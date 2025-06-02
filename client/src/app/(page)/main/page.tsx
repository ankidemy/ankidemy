// src/app/(page)/dashboard/page.tsx
"use client";

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Card } from "@/app/components/core/card";
import { Plus, ArrowRight } from 'lucide-react';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';

import {
  Domain,
  getPublicDomains,
  getMyDomains,
  getEnrolledDomains
} from '@/lib/api';

export default function DashboardPage() {
  // State
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'enrolled'>('all');
  
  // Domain data
  const [domains, setDomains] = useState<Domain[]>([]);
  const [myDomains, setMyDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [displayDomains, setDisplayDomains] = useState<Domain[]>([]);
  
  // Selected domain
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);

  // Menu
  const [showMenu, setShowMenu] = useState(false);

  // Load initial domain data
  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get public domains
        const publicDomains = await getPublicDomains();
        setDomains(publicDomains || []);
        
        // Use public domains as initial display
        if (activeTab === 'all') {
          setDisplayDomains(publicDomains || []);
        }
        
        // Get user's domains
        try {
          const myDomainsResponse = await getMyDomains();
          setMyDomains(myDomainsResponse || []);
          
          if (activeTab === 'my') {
            setDisplayDomains(myDomainsResponse || []);
          }
        } catch (error) {
          console.error("Failed to load your domains:", error);
          // Don't set global error to allow partial functionality
        }
        
      } catch (error) {
        console.error("Failed to load domains:", error);
        setError("Failed to load domains. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchDomains();
  }, [activeTab]);

  // Handle tab change
  const handleTabChange = (tab: 'all' | 'my' | 'enrolled') => {
    setActiveTab(tab);
    
    // Set appropriate domains for display
    if (tab === 'all') {
      setDisplayDomains(domains || []);
    } else if (tab === 'my') {
      setDisplayDomains(myDomains || []);
    } else if (tab === 'enrolled') {
      // When switching to enrolled tab, fetch enrolled domains if not loaded yet
      if (enrolledDomains.length === 0) {
        fetchEnrolledDomains();
      } else {
        setDisplayDomains(enrolledDomains || []);
      }
    }
  };

  // Fetch enrolled domains
  const fetchEnrolledDomains = async () => {
    setLoading(true);
    try {
      const enrolled = await getEnrolledDomains();
      setEnrolledDomains(enrolled || []);
      setDisplayDomains(enrolled || []);
    } catch (error) {
      console.error("Failed to load enrolled domains:", error);
      setError("Failed to load enrolled domains. Please try again.");
      setDisplayDomains([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle domain selection
  const handleSelectDomain = (domain: Domain) => {
    setSelectedDomain(domain);
  };

  // Handle hamburger menu
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !(menuRef.current as any).contains(event.target)) {
        setShowMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

const router = useRouter();

const handleLogout = async () => {
  try {
    await logout();
    router.push('/login');
  } catch (error) {
    console.error('Error cerrando sesion:', error);
  }
};

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-start mb-6" ref={menuRef}>
  <div>
    <div className="text-xl font-bold mb-2">
      Bienvenido, <span className="text-orange-500">usuario</span>
    </div>
  </div>

  {/* Botón hamburger */}
  <button
    onClick={() => setShowMenu(!showMenu)}
    className="relative group"
    aria-label="Abrir menú"
  >
    <div className="flex flex-col justify-center items-end w-8 h-8 space-y-1">
      <span className="w-full h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all" />
      <span className="w-2/3 h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all" />
      <span className="w-full h-0.5 bg-gray-800 group-hover:bg-orange-500 transition-all" />
    </div>
  </button>

  {showMenu && (
    <div className="absolute right-0 mt-3 w-56 bg-white rounded-2xl shadow-xl border z-50">
      <ul className="py-2 text-sm text-gray-800">
        <li>
          <Link 
            href="/profile"
            className="block px-4 py-2 hover:bg-orange-100 transition rounded-md"
            >
              Profile
          </Link>
        </li>
        <li>
          <Link 
            href="/settings"
            className="block px-4 py-2 hover:bg-orange-100 transition rounded-md"
          > 
            Settings 
          </Link>
        </li>
        <li>
          <button 
            onClick={handleLogout}
            className="w-full text-left block px-4 py-2 text-red-500 hover:bg-red-100 transition rounded-md"
          >
             Logout
          </button>
        </li>
      </ul>
    </div>
  )}
</div>
      
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
      <Link href="/dashboard/domains/create">
         <Button className="flex items-center">
          <Plus size={16} className="mr-1" />
          Create Domain
         </Button>
       </Link>
      
      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-500 p-4 rounded-md mb-6">
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
              ? "There are no public domains available."
              : activeTab === 'my'
              ? "You haven't created any domains yet."
              : "You haven't enrolled in any domains yet."
            }
          </p>
          
          {activeTab === 'my' && (
            <Link href="/dashboard/domains/new">
              <Button className="mt-4">
                Create Your First Domain
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayDomains.map((domain) => (
            <Card key={domain.id} className="p-6 hover:shadow-md transition-shadow">
              <h3 className="text-xl font-semibold mb-2">{domain.name}</h3>
              <p className="text-gray-600 mb-4 line-clamp-2">{domain.description || "No description"}</p>
              
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  {domain.privacy === 'public' ? 'Public' : 'Private'}
                </span>
                <Link 
                  href={`/dashboard/domains/${domain.id}/study`}
                  className="text-orange-500 hover:text-orange-700 flex items-center"
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
        <h2 className="text-xl font-bold mb-6">Domain Network</h2>
        <div className="border rounded-lg h-96 overflow-hidden">
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
                handleSelectDomain(domain);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
