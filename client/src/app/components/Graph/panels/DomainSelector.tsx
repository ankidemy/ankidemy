// File: ./src/app/components/Graph/panels/DomainSelector.tsx
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/app/components/core/button";
import { ChevronDown, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getMyDomains, getEnrolledDomains, Domain } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface DomainSelectorProps {
  // This prop will hold the NAME of the current domain
  currentDomainName: string;
  className?: string;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ 
  currentDomainName, 
  className = "" 
}) => {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDomains = async () => {
      setIsLoading(true);
      try {
        const my = await getMyDomains();
        const enrolled = await getEnrolledDomains();
        
        // Combine and remove duplicates
        const allDomains = [...my];
        enrolled.forEach(domain => {
          if (!allDomains.some(d => d.id === domain.id)) {
            allDomains.push(domain);
          }
        });

        setDomains(allDomains.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (error) {
        console.error("Failed to fetch domains for selector:", error);
        showToast("Failed to load domains.", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDomains();
  }, []);

  const handleDomainSelect = (domain: Domain) => {
    setIsOpen(false);
    // Find the current domain by name to compare IDs
    const currentDomain = domains.find(d => d.name === currentDomainName);
    if (!currentDomain || domain.id !== currentDomain.id) {
      router.push(`/main/domains/${domain.id}/study`);
    }
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const currentDomain = domains.find(d => d.name === currentDomainName);

  if (isLoading) {
    return (
      <div className={`flex items-center ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <Button
        variant="outline"
        onClick={toggleDropdown}
        className="flex items-center justify-between min-w-[200px] max-w-[300px] h-9"
        disabled={domains.length === 0}
      >
        <span className="truncate mr-2 font-medium">
          {currentDomainName || 'Select Domain'}
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
                  domain.name === currentDomainName ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                }`}
              >
                <div className="truncate">{domain.name}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DomainSelector;
