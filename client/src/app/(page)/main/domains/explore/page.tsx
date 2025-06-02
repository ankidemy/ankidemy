// src/app/(page)/dashboard/domains/explore/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getPublicDomains, getEnrolledDomains, enrollInDomain, Domain } from '@/lib/api';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Input } from "@/app/components/core/input";
import { ArrowLeft, Search, Globe, Lock, BookOpen, Users, Calendar } from 'lucide-react';

export default function ExplorePage() {
  const router = useRouter();
  
  const [domains, setDomains] = useState<Domain[]>([]);
  const [enrolledDomainIds, setEnrolledDomainIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  
  useEffect(() => {
    const fetchDomains = async () => {
      setIsLoading(true);
      
      try {
        // Fetch public domains
        const publicDomains = await getPublicDomains();
        setDomains(publicDomains);
        
        // Fetch domains the user is already enrolled in
        const enrolledDomains = await getEnrolledDomains();
        const enrolledIds = new Set(enrolledDomains.map(d => d.id));
        setEnrolledDomainIds(enrolledIds);
      } catch (err: any) {
        console.error("Error fetching domains:", err);
        setError("Failed to load domains. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDomains();
  }, []);
  
  // Filter domains based on search query
  const filteredDomains = domains.filter(domain => 
    domain.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (domain.description && domain.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  
  // Enroll in a domain
  const handleEnroll = async (domainId: number) => {
    setEnrollingId(domainId);
    
    try {
      await enrollInDomain(domainId);
      
      // Update enrolled domains list
      setEnrolledDomainIds(prev => new Set([...prev, domainId]));
      
      // Show success message
      alert("Successfully enrolled in domain!");
    } catch (err: any) {
      console.error("Error enrolling in domain:", err);
      alert("Failed to enroll in domain. Please try again.");
    } finally {
      setEnrollingId(null);
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <Button 
              variant="ghost" 
              onClick={() => router.back()} 
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <h1 className="text-2xl font-bold">Explore Knowledge Domains</h1>
          </div>
          
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search domains..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-6">
            {error}
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {searchQuery 
                ? `No domains found matching "${searchQuery}"`
                : "No public domains available at the moment."}
            </p>
            
            <Link href="/dashboard/domains/create">
              <Button>Create Your Own Domain</Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDomains.map(domain => (
              <Card key={domain.id} className="overflow-hidden">
                <CardHeader className="pb-0">
                  <CardTitle className="flex items-start justify-between">
                    <span className="truncate">{domain.name}</span>
                    <span>
                      {domain.privacy === 'public' ? (
                        <Globe size={18} className="text-green-600" />
                      ) : (
                        <Lock size={18} className="text-gray-500" />
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="pt-4 pb-0">
                  <p className="text-sm text-gray-600 line-clamp-2 h-10">
                    {domain.description || "No description available."}
                  </p>
                  
                  <div className="mt-4 flex justify-between text-xs text-gray-500">
                    <span className="flex items-center">
                      <Calendar size={14} className="mr-1" />
                      {formatDate(domain.createdAt)}
                    </span>
                    <span className="flex items-center">
                      <Users size={14} className="mr-1" />
                      {/* This would ideally show enrolled user count */}
                      0 enrolled
                    </span>
                  </div>
                </CardContent>
                
                <CardFooter className="mt-4 flex justify-between">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push(`/graph?domainId=${domain.id}`)}
                  >
                    <BookOpen size={16} className="mr-1" />
                    Preview
                  </Button>
                  
                  {enrolledDomainIds.has(domain.id) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/dashboard/domains/${domain.id}/study`)}
                    >
                      Already Enrolled
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={enrollingId === domain.id}
                      onClick={() => handleEnroll(domain.id)}
                    >
                      {enrollingId === domain.id ? "Enrolling..." : "Enroll"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
