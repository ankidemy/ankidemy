// src/app/(page)/main/page.tsx
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Card } from "@/app/components/core/card";
import { Plus, ArrowRight, Lock, Users, Globe, Upload, X, MoreVertical, Download, UserCheck } from 'lucide-react';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import { useRouter } from 'next/navigation';
import Navbar from "@/app/components/Navbar";
import DomainForm from "@/app/components/Domain/DomainForm";
import { showToast } from '@/app/components/core/ToastNotification';
import { useNotifications } from '@/contexts/NotificationContext';

import {
  Domain,
  getPublicDomains,
  getMyDomains,
  getEnrolledDomains,
  enrollInDomain,
  getCurrentUser,
  User,
  exportDomainAsJson,
  downloadJsonFile
} from '@/lib/api';
import { archiveDomain } from '@/lib/api';

export default function MainPage() {
  const { domainDueCounts } = useNotifications();

  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my' | 'enrolled' | 'community'>('community');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // Domain data
  const [publicDomains, setPublicDomains] = useState<Domain[]>([]);
  const [myDomains, setMyDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [displayDomains, setDisplayDomains] = useState<Domain[]>([]);
  
  // UI state
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // NEW: Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false);

  const router = useRouter();

  // Close menu by clicking anywhere inside the page container; elements that should keep it open stop propagation.
  // Note: Using React bubbling avoids conflicts with native document listeners.

  // Load user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setCurrentUser(userData);
        // Set default tab to 'my' for logged-in users
        setActiveTab('my');
      } catch (error) {
        console.error("Error loading user:", error);
        // Continue without user data - initial state is already 'community'
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

      } catch (error) {
        console.error("Failed to load domains:", error);
        setError("Failed to load domains. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDomains();
  }, [currentUser]);

  // Compute enrolledNonOwned (defensive client-side filter until server is deployed)
  const enrolledNonOwned = useMemo(() =>
    enrolledDomains.filter(d => d.ownerId !== currentUser?.id),
    [enrolledDomains, currentUser]
  );

  // Compute enrolledNonOwnedIds for quick lookup
  const enrolledNonOwnedIds = useMemo(() =>
    new Set(enrolledNonOwned.map(d => d.id)),
    [enrolledNonOwned]
  );

  // Compute communityDomains (public domains that user doesn't own and isn't enrolled in)
  const communityDomains = useMemo(() =>
    publicDomains.filter(d =>
      d.ownerId !== currentUser?.id && !enrolledNonOwnedIds.has(d.id)
    ),
    [publicDomains, currentUser, enrolledNonOwnedIds]
  );

  // Update display domains when data changes or tab changes
  useEffect(() => {
    if (activeTab === 'my') {
      setDisplayDomains(myDomains);
    } else if (activeTab === 'enrolled') {
      setDisplayDomains(enrolledNonOwned);
    } else if (activeTab === 'community') {
      setDisplayDomains(communityDomains);
    }
  }, [activeTab, myDomains, enrolledNonOwned, communityDomains]);

  // Handle tab change
  const handleTabChange = (tab: 'my' | 'enrolled' | 'community') => {
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

  // Handle export
  const handleExport = async (domain: Domain) => {
    try {
      const data = await exportDomainAsJson(domain.id);
      const safeBase = `${domain.name.replace(/[^a-z0-9-]+/gi, '_')}_export`;
      downloadJsonFile(data, safeBase);
      showToast('Export created', 'success');
    } catch (e: any) {
      console.error('Failed to export domain:', e);
      const errorMessage = e?.message || 'Failed to export domain';
      showToast(errorMessage, 'error');
    }
  };

  // Handle domain access
  const handleDomainAccess = async (domain: Domain) => {
    // Check if user owns the domain
    const currentUserId = currentUser?.id;
    const isOwned = !!currentUserId && domain.ownerId === currentUserId;
    const isEnrolled = enrolledNonOwnedIds.has(domain.id);

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

  // Archive a domain (soft delete)
  const handleArchive = async (domain: Domain) => {
    const confirmed = window.confirm(`Archive "${domain.name}"? You can restore it later from Archived Domains.`);
    if (!confirmed) return;
    try {
      await archiveDomain(domain.id);
      // Remove from lists where it may appear
      setMyDomains(prev => prev.filter(d => d.id !== domain.id));
      setEnrolledDomains(prev => prev.filter(d => d.id !== domain.id));
      setPublicDomains(prev => prev.filter(d => d.id !== domain.id));
      showToast(`Archived "${domain.name}"`, 'success');
    } catch (e) {
      console.error('Failed to archive domain', e);
      showToast('Failed to archive domain', 'error');
    }
  };

  // Get domain status info
  const getDomainStatus = (domain: Domain) => {
    const currentUserId = currentUser?.id;
    const isOwned = !!currentUserId && domain.ownerId === currentUserId;
    const isEnrolled = enrolledNonOwnedIds.has(domain.id);

    if (isOwned) {
      return {
        icon: <UserCheck size={14} className="text-purple-600" />,
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

  // No sidebar on Main page anymore; use Navbar dropdown menu
  const openSidebar = () => setSidebarOpen(false);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div>
      {/* Use Navbar's built-in hamburger dropdown (no slide-over sidebar) */}
      <Navbar 
        // Do not pass onMenuClick so the Navbar shows its dropdown
        // Provide extra menu items we previously had in the right panel
        extraMenuItems={[
          { href: '/main/domains/archived', label: 'Archived Domains' },
        ]}
      />
      
      <div className="min-h-screen bg-white w-full mt-16">
        {/* Use consistent padding like dashboard */}
        <div className="w-full max-w-7xl mx-auto px-6 sm:px-8 lg:px-16 py-8" onClick={() => setMenuOpenId(null)}>
          {/* Domain Network Visualization (moved above tabs) */}
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-6 text-gray-800">Domain Network</h2>
            <div className="border rounded-xl h-96 overflow-hidden bg-gray-50 relative">
              {displayDomains.length > 0 ? (
                <SubjectMatterGraph
                  key={`${activeTab}-${displayDomains.length}`}
                  subjectMatters={displayDomains.map(domain => ({
                    id: domain.id.toString(),
                    name: domain.name,
                    nodeCount: domain.nodeCount || 0,
                    exerciseCount: domain.exerciseCount || 0
                  }))}
                  onSelectSubjectMatter={(id) => {
                    const domain = displayDomains.find(d => d.id.toString() === id);
                    if (domain) {
                      handleDomainAccess(domain);
                    }
                  }}
                  onCreateSubjectMatter={currentUser ? () => router.push('/main/domains/create') : undefined}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <div className="text-center">
                    <p className="text-4xl mb-2">📚</p>
                    <p className="text-sm">
                      {activeTab === 'my' && "No domains created yet"}
                      {activeTab === 'enrolled' && "No enrolled domains yet"}
                      {activeTab === 'community' && "No community domains available"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b mb-6">
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
              Enrolled Domains ({enrolledNonOwned.length})
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'community' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('community')}
            >
              Community Domains ({communityDomains.length})
            </button>
          </div>

          {/* NEW: Create Domain and Import Buttons */}
          {currentUser && (
            <div className="flex items-center gap-3 mb-6">
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
              <div className="ml-auto">
                <Link href="/main/domains/archived">
                  <Button variant="outline" className="flex items-center">
                    Archived Domains
                  </Button>
                </Link>
              </div>
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
                {activeTab === 'my'
                  ? "You haven't created any domains yet."
                  : activeTab === 'enrolled'
                  ? "You haven't enrolled in any domains yet."
                  : "There are no community domains available."
                }
              </p>

              {activeTab === 'my' && currentUser && (
                <div className="flex justify-center gap-3 mt-4">
                  <Link href="/main/domains/create">
                    <Button>
                      Create Your First Domain
                    </Button>
                  </Link>
                  <Link href="/main/domains/archived">
                    <Button variant="outline">
                      Archived Domains
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
                const currentUserId = currentUser?.id;
                const isOwned = !!currentUserId && domain.ownerId === currentUserId;
                const isEnrolled = enrolledNonOwnedIds.has(domain.id);

                return (
                  <Card key={domain.id} className="p-6 hover:shadow-lg transition-all duration-200 rounded-xl border-0 shadow-sm relative">
                    {/* Card actions: 3-dot menu in upper-right */}
                    <div className="absolute top-4 right-4 z-20" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="p-1 rounded hover:bg-gray-100"
                        onClick={() => setMenuOpenId(prev => prev === domain.id ? null : domain.id)}
                        aria-label="More options"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuOpenId === domain.id && (
                        <div className="absolute right-0 mt-2 w-44 bg-white border rounded-md shadow-lg" onClick={(e) => e.stopPropagation()}>
                          {isOwned && (
                            <button
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                              onClick={() => { setMenuOpenId(null); handleArchive(domain); }}
                            >
                              Archive
                            </button>
                          )}
                          <button
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={() => { setMenuOpenId(null); handleDomainAccess(domain); }}
                          >
                            Open
                          </button>
                          <button
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                            onClick={() => { setMenuOpenId(null); handleExport(domain); }}
                          >
                            Export
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-2 pr-8">
                      <h3 className="text-xl font-semibold mb-2 text-gray-800">{domain.name}</h3>
                      {domainDueCounts[domain.id] > 0 && (
                        <span className="mt-1 inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-0.5">
                          {domainDueCounts[domain.id]} due
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{domain.description || "No description"}</p>
                    
                    <div className="flex justify-between items-center relative">
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm px-2 py-1 rounded-full flex items-center ${statusInfo.className}`}>
                          {statusInfo.icon}
                          <span className="ml-1">{statusInfo.label}</span>
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {/* Export button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleExport(domain); }}
                          className="text-xs"
                        >
                          <Download size={14} className="mr-1" />
                          Export
                        </Button>
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
          
          {/* Graph was moved above */}
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
