// src/app/(page)/main/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Card } from "@/app/components/core/card";
import { Plus, ArrowRight } from 'lucide-react';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import { useRouter } from 'next/navigation';
import Navbar from "@/app/components/Navbar";
import Sidebar from "@/app/components/Sidebar";
import { getCurrentUser, type User } from '@/lib/api';

import {
  Domain,
  getPublicDomains,
  getMyDomains,
  getEnrolledDomains
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
  const [displayDomains, setDisplayDomains] = useState<Domain[]>([]);
  
  // Selected domain
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch {
        router.push("/login");
      }
    })();
  }, [router]);

  // Load initial domain data
  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get public domains
        const publicDomainsResponse = await getPublicDomains();
        setPublicDomains(publicDomainsResponse || []);
        
        // Get user's domains
        try {
          const myDomainsResponse = await getMyDomains();
          setMyDomains(myDomainsResponse || []);
        } catch (error) {
          console.error("Failed to load your domains:", error);
          // Don't set global error to allow partial functionality
        }
        
        // Get enrolled domains
        try {
          const enrolledDomainsResponse = await getEnrolledDomains();
          setEnrolledDomains(enrolledDomainsResponse || []);
        } catch (error) {
          console.error("Failed to load enrolled domains:", error);
        }
        
      } catch (error) {
        console.error("Failed to load domains:", error);
        setError("Failed to load domains. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDomains();
  }, []);

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

  // Handle tab change
  const handleTabChange = (tab: 'all' | 'my' | 'enrolled') => {
    setActiveTab(tab);
  };

  // Handle domain selection
  const handleSelectDomain = (domain: Domain) => {
    setSelectedDomain(domain);
  };

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div>
      <Navbar currentUser={currentUser} onMenuClick={openSidebar} />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
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
              All Domains
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'my' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('my')}
            >
              My Domains
            </button>
            <button
              className={`px-4 py-2 font-medium ${activeTab === 'enrolled' ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-500'}`}
              onClick={() => handleTabChange('enrolled')}
            >
              Enrolled Domains
            </button>
          </div>

          {/* Create Domain Button */}
          <div className="mb-6">
            <Link href="/main/domains/create">
               <Button className="flex items-center">
                <Plus size={16} className="mr-1" />
                Create Domain
               </Button>
             </Link>
          </div>
          
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
              
              {activeTab === 'my' && (
                <Link href="/main/domains/create">
                  <Button className="mt-4">
                    Create Your First Domain
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayDomains.map((domain) => (
                <Card key={domain.id} className="p-6 hover:shadow-lg transition-all duration-200 rounded-xl border-0 shadow-sm">
                  <h3 className="text-xl font-semibold mb-2 text-gray-800">{domain.name}</h3>
                  <p className="text-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">{domain.description || "No description"}</p>
                  
                  <div className="flex justify-between items-center">
                    <span className={`text-sm px-2 py-1 rounded-full ${
                      domain.privacy === 'public' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {domain.privacy === 'public' ? 'Public' : 'Private'}
                    </span>
                    <Link 
                      href={`/main/domains/${domain.id}/study`}
                      className="text-orange-500 hover:text-orange-700 flex items-center font-medium transition-colors"
                    >
                      Explore
                      <ArrowRight size={16} className="ml-1" />
                    </Link>
                  </div>
                </Card>
              ))}
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
                  console.log('Selected domain ID:', id);
                  router.push(`/main/domains/${id}/study`);
                }}
                onCreateSubjectMatter={() => router.push('/main/domains/create')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
