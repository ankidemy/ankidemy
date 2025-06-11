// File: ./src/app/components/Graph/panels/DomainSelector.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { ChevronDown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getMyDomains, getEnrolledDomains, getPublicDomains, Domain } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface DomainSelectorProps {
  currentDomainId: string;
  className?: string;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ 
  currentDomainId, 
  className = "" 
}) => {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDomain, setCurrentDomain] = useState<Domain | null>(null);

  useEffect(() => {
    const fetchDomains = async () => {
      try {
        setIsLoading(true);
        
        // Get all available domains
        const [myDomains, enrolledDomains, publicDomains] = await Promise.all([
          getMyDomains(),
          getEnrolledDomains(), 
          getPublicDomains()
        ]);
        
        // Combine and remove duplicates
        const combinedDomains = [...myDomains];
        
        // Add enrolled domains that aren't already in the list
        enrolledDomains.forEach(domain => {
          if (!combinedDomains.some(d => d.id === domain.id)) {
            combinedDomains.push(domain);
          }
        });
        
        // Add public domains that aren't already in the list  
        publicDomains.forEach(domain => {
          if (!combinedDomains.some(d => d.id === domain.id)) {
            combinedDomains.push(domain);
          }
        });
        
        // Sort domains alphabetically
        combinedDomains.sort((a, b) => a.name.localeCompare(b.name));
        
        setDomains(combinedDomains);
        
        // Find current domain
        const current = combinedDomains.find(d => d.id.toString() === currentDomainId);
        setCurrentDomain(current || null);
        
      } catch (error) {
        console.error("Error fetching domains:", error);
        showToast("Failed to load domains.", "error");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDomains();
  }, [currentDomainId]);

  const handleDomainSelect = (domain: Domain) => {
    setIsOpen(false);
    if (domain.id.toString() !== currentDomainId) {
      // Navigate to the selected domain
      router.push(`/main/domains/${domain.id}/study`);
    }
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.domain-selector')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  if (isLoading) {
    return (
      <div className={`domain-selector flex items-center ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm text-gray-500">Loading domains...</span>
      </div>
    );
  }

  return (
    <div className={`domain-selector relative ${className}`}>
      <Button
        variant="outline"
        onClick={toggleDropdown}
        className="flex items-center justify-between min-w-[200px] max-w-[300px]"
        disabled={domains.length === 0}
      >
        <span className="truncate mr-2">
          {currentDomain ? currentDomain.name : 'Select Domain'}
        </span>
        <ChevronDown 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </Button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] max-w-[400px] bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-[300px] overflow-y-auto">
          {domains.length === 0 ? (
            <div className="p-3 text-sm text-gray-500 text-center">
              No domains available
            </div>
          ) : (
            domains.map((domain) => (
              <button
                key={domain.id}
                onClick={() => handleDomainSelect(domain)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 focus:bg-gray-100 focus:outline-none border-b border-gray-100 last:border-b-0 ${
                  domain.id.toString() === currentDomainId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                }`}
              >
                <div className="truncate">{domain.name}</div>
                {domain.description && (
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {domain.description}
                  </div>
                )}
                <div className="text-xs text-gray-400 mt-0.5">
                  {domain.privacy === 'public' ? 'Public' : 'Private'} • ID: {domain.id}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DomainSelector;
