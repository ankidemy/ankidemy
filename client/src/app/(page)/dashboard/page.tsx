// src/app/dashboard/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/core/card";
import { getAllDomains, getMyDomains, getEnrolledDomains, Domain } from '@/lib/api';
import { Plus, Book, Users, User } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [myDomains, setMyDomains] = useState<Domain[]>([]);
  const [enrolledDomains, setEnrolledDomains] = useState<Domain[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'enrolled'>('all');

  useEffect(() => {
    const fetchDomains = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch domains based on active tab
        let fetchedDomains: Domain[] = [];
        
        if (activeTab === 'all') {
          fetchedDomains = await getAllDomains();
        } else if (activeTab === 'my') {
          fetchedDomains = await getMyDomains();
        } else if (activeTab === 'enrolled') {
          fetchedDomains = await getEnrolledDomains();
        }
        
        if (activeTab === 'all') {
          setDomains(fetchedDomains);
        } else if (activeTab === 'my') {
          setMyDomains(fetchedDomains);
        } else if (activeTab === 'enrolled') {
          setEnrolledDomains(fetchedDomains);
        }
      } catch (err: any) {
        console.error("Error fetching domains:", err);
        setError(`Failed to load domains: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDomains();
  }, [activeTab]);

  const navigateToDomain = (domainId: number) => {
    router.push(`/dashboard/domains/${domainId}/study`);
  };

  const createNewDomain = () => {
    router.push('/dashboard/domains/new');
  };

  const displayDomains = activeTab === 'all' ? domains : (activeTab === 'my' ? myDomains : enrolledDomains);

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Knowledge Domains</h1>
        <Button onClick={createNewDomain} className="flex items-center">
          <Plus size={16} className="mr-2" />
          Create Domain
        </Button>
      </div>

      <div className="mb-6">
        <div className="flex border-b border-gray-200">
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'all'
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('all')}
          >
            <div className="flex items-center">
              <Book size={16} className="mr-2" />
              All Domains
            </div>
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'my'
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('my')}
          >
            <div className="flex items-center">
              <User size={16} className="mr-2" />
              My Domains
            </div>
          </button>
          <button
            className={`px-4 py-2 font-medium ${
              activeTab === 'enrolled'
                ? 'border-b-2 border-orange-500 text-orange-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('enrolled')}
          >
            <div className="flex items-center">
              <Users size={16} className="mr-2" />
              Enrolled Domains
            </div>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-md mb-6">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      ) : displayDomains.length === 0 ? (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-600 mb-2">No domains found</h3>
          <p className="text-gray-500">
            {activeTab === 'all'
              ? 'No domains are available.'
              : activeTab === 'my'
              ? 'You have not created any domains yet.'
              : 'You are not enrolled in any domains.'}
          </p>
          {activeTab === 'my' && (
            <Button onClick={createNewDomain} variant="outline" className="mt-4">
              Create Your First Domain
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayDomains.map((domain) => (
            <Card key={domain.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle>{domain.name}</CardTitle>
                <CardDescription>
                  {domain.privacy === 'public' ? 'Public' : 'Private'} Domain
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 line-clamp-3">
                  {domain.description || 'No description available.'}
                </p>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/dashboard/domains/${domain.id}`)}
                >
                  Details
                </Button>
                <Button onClick={() => navigateToDomain(domain.id)}>
                  Open Graph
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
