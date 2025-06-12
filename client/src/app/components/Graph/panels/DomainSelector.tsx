// DomainSelector.tsx - Simple domain selector component
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/app/components/core/button";
import { ChevronDown, Globe, Users, Lock } from 'lucide-react';
import { getMyDomains, getEnrolledDomains, getPublicDomains, Domain } from '@/lib/api';

interface DomainSelectorProps {
  currentDomainName: string;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({ currentDomainName }) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [domains, setDomains] = useState<(Domain & { source: 'my' | 'enrolled' | 'public' })[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDomains = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        const [myDomains, enrolledDomains, publicDomains] = await Promise.allSettled([
          getMyDomains(),
          getEnrolledDomains(), 
          getPublicDomains()
        ]);

        const allDomains: (Domain & { source: 'my' | 'enrolled' | 'public' })[] = [];
        
        if (myDomains.status === 'fulfilled') {
          allDomains.push(...myDomains.value.map(d => ({ ...d, source: 'my' as const })));
        }
        
        if (enrolledDomains.status === 'fulfilled') {
          enrolledDomains.value.forEach(domain => {
            // Don't duplicate domains the user owns
            if (!allDomains.some(d => d.id === domain.id)) {
              allDomains.push({ ...domain, source: 'enrolled' as const });
            }
          });
        }
        
        if (publicDomains.status === 'fulfilled') {
          publicDomains.value.forEach(domain => {
            // Don't duplicate domains the user already has access to
            if (!allDomains.some(d => d.id === domain.id)) {
              allDomains.push({ ...domain, source: 'public' as const });
            }
          });
        }

        // Sort by name
        allDomains.sort((a, b) => a.name.localeCompare(b.name));
        setDomains(allDomains);
      } catch (error) {
        console.error('Error fetching domains:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDomains();
  }, [isOpen]);

  const handleDomainSelect = (domain: Domain) => {
    setIsOpen(false);
    router.push(`/main/domains/${domain.id}/study`);
  };

  const getSourceIcon = (source: 'my' | 'enrolled' | 'public') => {
    switch (source) {
      case 'my':
        return <Lock size={12} className="text-purple-600" />;
      case 'enrolled':
        return <Users size={12} className="text-green-600" />;
      case 'public':
        return <Globe size={12} className="text-blue-600" />;
    }
  };

  const getSourceLabel = (source: 'my' | 'enrolled' | 'public') => {
    switch (source) {
      case 'my': return 'Owned';
      case 'enrolled': return 'Enrolled';
      case 'public': return 'Public';
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center text-sm font-normal max-w-xs"
      >
        <span className="truncate mr-1" title={currentDomainName}>
          {currentDomainName}
        </span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-80 bg-white border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 mb-2 px-2">Switch Domain</div>
              
              {loading ? (
                <div className="text-center py-4 text-gray-500">Loading domains...</div>
              ) : domains.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No domains available</div>
              ) : (
                <div className="space-y-1">
                  {domains.map(domain => (
                    <button
                      key={domain.id}
                      onClick={() => handleDomainSelect(domain)}
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{domain.name}</div>
                          {domain.description && (
                            <div className="text-xs text-gray-500 truncate">
                              {domain.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center ml-2">
                          <span className="text-xs text-gray-500 mr-1">
                            {getSourceLabel(domain.source)}
                          </span>
                          {getSourceIcon(domain.source)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              
              <div className="border-t mt-2 pt-2">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    router.push('/main');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 transition-colors text-sm text-orange-600 font-medium"
                >
                  View All Domains
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DomainSelector;
