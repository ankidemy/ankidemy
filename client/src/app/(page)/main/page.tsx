// src/app/(page)/main/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Card } from "@/app/components/core/card";
import { Plus, ArrowRight, Lock, Users, Globe, Upload, X } from 'lucide-react';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import { useRouter } from 'next/navigation';
import Navbar from "@/app/components/Navbar";
import Sidebar from "@/app/components/Sidebar";
import DomainForm from "@/app/components/Domain/DomainForm";
import { showToast } from '@/app/components/core/ToastNotification';

import {
  Domain,
  getPublicDomains,
  getMyDomains,
  getEnrolledDomains,
  enrollInDomain,
  getCurrentUser,
  User
} from '@/lib/api';

export default function MainPage() {
  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'enrolled'>('all');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Domain data
  const [publicDomains, setPublicDomains] = useState<Domain[]>([]);
  const [myDomains, setMyDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [enrolledDomainIds, setEnrolledDomainIds] = useState<Set<number>>(new Set());
  const [displayDomains, setDisplayDomains] = useState<Domain[]>([]);
  
  // UI state
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // NEW: Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);

  const router = useRouter();

  // Load user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setCurrentUser(userData);
      } catch (error) {
        console.error("Error loading user:", error);
        // Continue without user data - might be on public page
      }
    };
    fetchUser();
  }, []);

  // Load initial domain data
  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get public domains (always available)
        const publicDomainsResponse = await getPublicDomains();
        setPublicDomains(publicDomainsResponse || []);
        
        // Get user's domains if authenticated
        let myDomainsResponse: Domain[] = [];
        let enrolledDomainsResponse: Domain[] = [];
        
        if (currentUser) {
          try {
            const [myResult, enrolledResult] = await Promise.allSettled([
              getMyDomains(),
              getEnrolledDomains()
            ]);
            
            myDomainsResponse = myResult.status === 'fulfilled' ? myResult.value : [];
            enrolledDomainsResponse = enrolledResult.status === 'fulfilled' ? enrolledResult.value : [];
          } catch (error) {
            console.error("Failed to load user domains:", error);
          }
        }
        
        setMyDomains(myDomainsResponse);
        setEnrolledDomains(enrolledDomainsResponse);
        
        // Create set of enrolled domain IDs for quick lookup
        const enrolledIds = new Set(enrolledDomainsResponse.map(d => d.id));
        setEnrolledDomainIds(enrolledIds);
        
      } catch (error) {
        console.error("Failed to load domains:", error);
        setError("Failed to load domains. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDomains();
  }, [currentUser]);

  // Update display domains when data changes or tab changes
  useEffect(() => {
    if (activeTab === 'all') {
      // Combine public domains and user's domains for "all"
      const allDomains = [...publicDomains, ...myDomains];
      // Remove duplicates by id
      const uniqueDomains = allDomains.filter((domain, index, self) => 
        index === self.findIndex(d => d.id === domain.id)
      );
      setDisplayDomains(uniqueDomains);
    } else if (activeTab === 'my') {
      setDisplayDomains(myDomains);
    } else if (activeTab === 'enrolled') {
      setDisplayDomains(enrolledDomains);
    }
  }, [activeTab, publicDomains, myDomains, enrolledDomains]);

  const uniqueAllDomainsCount = new Set([...publicDomains.map(d => d.id), ...myDomains.map(d => d.id)]).size;

  // Handle tab change
  const handleTabChange = (tab: 'all' | 'my' | 'enrolled') => {
    setActiveTab(tab);
  };

  // Handle enrollment
  const handleEnrollment = async (domain: Domain) => {
    if (!currentUser) {
      showToast('Please log in to enroll in domains', 'error');
      router.push('/login');
      return;
    }

    setEnrolling(prev => new Set(prev).add(domain.id));
    
    try {
      await enrollInDomain(domain.id);
      
      // Update local state
      setEnrolledDomains(prev => [...prev, domain]);
      setEnrolledDomainIds(prev => new Set(prev).add(domain.id));
      
      showToast(`Successfully enrolled in "${domain.name}"`, 'success');
      
      // Navigate to the domain
      router.push(`/main/domains/${domain.id}/study`);
    } catch (error) {
      console.error('Error enrolling in domain:', error);
      showToast(`Failed to enroll in "${domain.name}"`, 'error');
    } finally {
      setEnrolling(prev => {
        const newSet = new Set(prev);
        newSet.delete(domain.id);
        return newSet;
      });
    }
  };

  // Handle domain access
  const handleDomainAccess = async (domain: Domain) => {
    // Check if user owns the domain
    const isOwned = currentUser && domain.ownerId === currentUser.id;
    const isEnrolled = enrolledDomainIds.has(domain.id);
    
    if (isOwned || isEnrolled) {
      // Direct access for owned or enrolled domains
      router.push(`/main/domains/${domain.id}/study`);
    } else if (domain.privacy === 'public') {
      // Prompt for enrollment in public domain
      const shouldEnroll = window.confirm(
        `You are not enrolled in "${domain.name}". Would you like to enroll to access all features including progress tracking?\n\nNote: You can still browse the domain without enrolling, but won't have access to study features.`
      );
      
      if (shouldEnroll) {
        await handleEnrollment(domain);
      } else {
        // Navigate anyway but user will have limited access
        router.push(`/main/domains/${domain.id}/study`);
      }
    } else {
      // Private domain that user doesn't own
      showToast('This is a private domain you cannot access', 'error');
    }
  };

  // Get domain status info
  const getDomainStatus = (domain: Domain) => {
    const isOwned = currentUser && domain.ownerId === currentUser.id;
    const isEnrolled = enrolledDomainIds.has(domain.id);
    
    if (isOwned) {
      return {
        icon: <Lock size={14} className="text-purple-600" />,
        label: 'Owned',
        className: 'bg-purple-100 text-purple-700'
      };
    } else if (isEnrolled) {
      return {
        icon: <Users size={14} className="text-green-600" />,
        label: 'Enrolled',
        className: 'bg-green-100 text-green-700'
      };
    } else if (domain.privacy === 'public') {
      return {
        icon: <Globe size={14} className="text-blue-600" />,
        label: 'Public',
        className: 'bg-blue-100 text-blue-700'
      };
    } else {
      return {
        icon: <Lock size={14} className="text-gray-600" />,
        label: 'Private',
        className: 'bg-gray-100 text-gray-700'
      };
    }
  };

  // NEW: Handle import success
  const handleImportSuccess = (domain: Domain) => {
    setShowImportDialog(false);
    showToast(`Domain "${domain.name}" created successfully with imported data!`, 'success');
    
    // Refresh domain lists
    if (currentUser) {
      // Add to my domains
      setMyDomains(prev => [...prev, domain]);
      
      // If it's public, also add to public domains
      if (domain.privacy === 'public') {
        setPublicDomains(prev => [...prev, domain]);
      }
    }
    
    // Navigate to the new domain
    router.push(`/main/domains/${domain.id}/study`);
  };

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div>
      <Navbar onMenuClick={openSidebar} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      
      <div className="min-h-screen bg-white w-full mt-16">
        {/* Use consistent padding like dashboard */}
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 py-8">
          
          {/* Tabs */}
          <div className="flex border-b mb-6">
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'all' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('all')}
            >
              All Domains ({uniqueAllDomainsCount})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'my' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('my')}
            >
              My Domains ({myDomains.length})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'enrolled' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('enrolled')}
            >
              Enrolled Domains ({enrolledDomains.length})
            </button>
          </div>

          {/* NEW: Create Domain and Import Buttons */}
          {currentUser && (
            <div className="flex gap-3 mb-6">
              <Link href="/main/domains/create">
                <Button className="flex items-center">
                  <Plus size={16} className="mr-1" />
                  Create Domain
                </Button>
              </Link>
              <Button 
                variant="outline" 
                onClick={() => setShowImportDialog(true)}
                className="flex items-center"
              >
                <Upload size={16} className="mr-1" />
                Import from JSON
              </Button>
            </div>
          )}
          
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-500 p-4 rounded-lg mb-6">
              {error}
            </div>
          )}
          
          {/* Domain Display */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : displayDomains.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-600 mb-2">No domains found</h3>
              <p className="text-gray-500">
                {activeTab === 'all'
                  ? "There are no domains available."
                  : activeTab === 'my'
                  ? "You haven't created any domains yet."
                  : "You haven't enrolled in any domains yet."
                }
              </p>
              
              {activeTab === 'my' && currentUser && (
                <div className="flex justify-center gap-3 mt-4">
                  <Link href="/main/domains/create">
                    <Button>
                      Create Your First Domain
                    </Button>
                  </Link>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowImportDialog(true)}
                  >
                    <Upload size={16} className="mr-1" />
                    Import from JSON
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayDomains.map((domain) => {
                const statusInfo = getDomainStatus(domain);
                const isEnrolling = enrolling.has(domain.id);
                const isOwned = currentUser && domain.ownerId === currentUser.id;
                const isEnrolled = enrolledDomainIds.has(domain.id);
                
                return (
                  <Card key={domain.id} className="p-6 hover:shadow-lg transition-all duration-200 rounded-xl border-0 shadow-sm">
                    <h3 className="text-xl font-semibold mb-2 text-gray-800">{domain.name}</h3>
                    <p className="text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{domain.description || "No description"}</p>
                    
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm px-2 py-1 rounded-full flex items-center ${statusInfo.className}`}>
                          {statusInfo.icon}
                          <span className="ml-1">{statusInfo.label}</span>
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Enrollment button for public domains */}
                        {domain.privacy === 'public' && !isOwned && !isEnrolled && currentUser && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEnrollment(domain)}
                            disabled={isEnrolling}
                            className="text-xs"
                          >
                            {isEnrolling ? 'Enrolling...' : 'Enroll'}
                          </Button>
                        )}
                        
                        {/* Explore button */}
                        <button
                          onClick={() => handleDomainAccess(domain)}
                          className="text-orange-500 hover:text-orange-700 flex items-center font-medium transition-colors"
                          disabled={isEnrolling}
                        >
                          Explore
                          <ArrowRight size={16} className="ml-1" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Login prompt for non-authenticated users */}
                    {!currentUser && domain.privacy === 'public' && (
                      <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                        <Link href="/login" className="underline">Log in</Link> to enroll and track your progress
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          
          {/* Domain Network Visualization */}
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-6 text-gray-800">Domain Network</h2>
            <div className="border rounded-xl h-96 overflow-hidden bg-gray-50 relative">
              <SubjectMatterGraph 
                subjectMatters={displayDomains.map(domain => ({
                  id: domain.id.toString(),
                  name: domain.name,
                  nodeCount: 0, // In a real app, you'd fetch this data
                  exerciseCount: 0
                }))}
                onSelectSubjectMatter={(id) => {
                  const domain = displayDomains.find(d => d.id.toString() === id);
                  if (domain) {
                    handleDomainAccess(domain);
                  }
                }}
                onCreateSubjectMatter={currentUser ? () => router.push('/main/domains/create') : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* NEW: Import Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowImportDialog(false)}
              className="absolute top-4 right-4 z-10"
            >
              <X size={20} />
            </Button>
            <DomainForm
              allowImport={true}
              onSuccess={handleImportSuccess}
              onCancel={() => setShowImportDialog(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
