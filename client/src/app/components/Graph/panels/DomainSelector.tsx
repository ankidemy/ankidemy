// src/app/components/Graph/panels/DomainSelector.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { ChevronDown, Globe, Lock, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Domain,
  getMyDomains,
  getEnrolledDomains,
  getPublicDomains,
  enrollInDomain
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface DomainSelectorProps {
  currentDomainName?: string;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ currentDomainName }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [enrolledDomainIds, setEnrolledDomainIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchDomains = async () => {
      setLoading(true);
      try {
        // Fetch all domain types with proper error handling
        const [my, enrolled, publicDomains] = await Promise.allSettled([
          getMyDomains(),
          getEnrolledDomains(), 
          getPublicDomains()
        ]);

        // Extract successful results, defaulting to empty arrays for failures
        const myDomains = my.status === 'fulfilled' ? my.value : [];
        const enrolledDomains = enrolled.status === 'fulfilled' ? enrolled.value : [];
        const publicDomainsResult = publicDomains.status === 'fulfilled' ? publicDomains.value : [];

        // Create set of enrolled domain IDs
        const enrolledIds = new Set(enrolledDomains.map(d => d.id));
        setEnrolledDomainIds(enrolledIds);

        // Combine and remove duplicates
        const allDomains = [...myDomains];
        
        // Add enrolled domains that aren't already in the list
        enrolledDomains.forEach(domain => {
          if (!allDomains.some(d => d.id === domain.id)) {
            allDomains.push(domain);
          }
        });

        // Add public domains that aren't already in the list
        publicDomainsResult.forEach(domain => {
          if (!allDomains.some(d => d.id === domain.id)) {
            allDomains.push(domain);
          }
        });

        setDomains(allDomains);
      } catch (error) {
        console.error('Error fetching domains:', error);
        showToast('Failed to load domains', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchDomains();
    }
  }, [isOpen]);

  const handleDomainSelect = async (domain: Domain) => {
    // Check if user is enrolled or owns the domain
    const isEnrolled = enrolledDomainIds.has(domain.id);
    
    if (!isEnrolled && domain.privacy === 'public') {
      // Prompt for enrollment in public domain
      const shouldEnroll = window.confirm(
        `You are not enrolled in "${domain.name}". Would you like to enroll to access all features including progress tracking?`
      );
      
      if (shouldEnroll) {
        await handleEnrollment(domain);
      } else {
        // Navigate anyway but with limited access
        router.push(`/main/domains/${domain.id}/study`);
        setIsOpen(false);
      }
    } else if (!isEnrolled && domain.privacy === 'private') {
      showToast('This is a private domain you cannot access', 'error');
    } else {
      // User is enrolled or owns the domain
      router.push(`/main/domains/${domain.id}/study`);
      setIsOpen(false);
    }
  };

  const handleEnrollment = async (domain: Domain) => {
    setEnrolling(prev => new Set(prev).add(domain.id));
    
    try {
      await enrollInDomain(domain.id);
      
      // Update enrolled domains set
      setEnrolledDomainIds(prev => new Set(prev).add(domain.id));
      
      showToast(`Successfully enrolled in "${domain.name}"`, 'success');
      
      // Navigate to the domain
      router.push(`/main/domains/${domain.id}/study`);
      setIsOpen(false);
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

  const getDomainIcon = (domain: Domain) => {
    if (domain.privacy === 'private') {
      return <Lock size={14} className="text-gray-500" />;
    } else if (enrolledDomainIds.has(domain.id)) {
      return <Users size={14} className="text-green-500" />;
    } else {
      return <Globe size={14} className="text-blue-500" />;
    }
  };

  const getDomainStatus = (domain: Domain) => {
    if (domain.privacy === 'private') {
      return 'Private';
    } else if (enrolledDomainIds.has(domain.id)) {
      return 'Enrolled';
    } else {
      return 'Public';
    }
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center"
        disabled={loading}
      >
        <span className="mr-2 truncate max-w-32">
          {currentDomainName || 'Select Domain'}
        </span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading domains...</p>
            </div>
          ) : domains.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p>No domains available</p>
            </div>
          ) : (
            <>
              <div className="p-2 border-b">
                <h3 className="text-sm font-medium text-gray-700">Available Domains</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {domains.map((domain) => {
                  const isEnrolled = enrolledDomainIds.has(domain.id);
                  const isEnrolling = enrolling.has(domain.id);
                  
                  return (
                    <div
                      key={domain.id}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex-1 min-w-0 mr-2"
                          onClick={() => !isEnrolling && handleDomainSelect(domain)}
                        >
                          <div className="flex items-center mb-1">
                            {getDomainIcon(domain)}
                            <h4 className="text-sm font-medium text-gray-900 ml-2 truncate">
                              {domain.name}
                            </h4>
                          </div>
                          <p className="text-xs text-gray-500 line-clamp-2">
                            {domain.description || 'No description'}
                          </p>
                          <div className="flex items-center mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              domain.privacy === 'private' 
                                ? 'bg-gray-100 text-gray-600'
                                : isEnrolled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {getDomainStatus(domain)}
                            </span>
                          </div>
                        </div>
                        
                        {/* Enrollment button for public non-enrolled domains */}
                        {domain.privacy === 'public' && !isEnrolled && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEnrollment(domain)}
                            disabled={isEnrolling}
                            className="ml-2"
                          >
                            {isEnrolling ? 'Enrolling...' : 'Enroll'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default DomainSelector;
