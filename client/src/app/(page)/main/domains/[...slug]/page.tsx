// src/app/(page)/dashboard/domains/[...slug]/page.tsx
"use client";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import DomainForm from '@/app/components/Domain/DomainForm';
import { Button } from "@/app/components/core/button";
import { ArrowLeft } from 'lucide-react';
import { getCurrentUser, User, Domain } from '@/lib/api';

export default function DomainPage() {
  const router = useRouter();
  const params = useParams();
  
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Parse the slug to determine the mode and ID if applicable
  const slug = Array.isArray(params.slug) ? params.slug : [params.slug];
  const mode = slug[0]; // 'create', 'edit', 'view', etc.
  const domainId = slug.length > 1 ? slug[1] : undefined;
  
  // Check authentication and load user data
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch (err: any) {
        console.error("Authentication error:", err);
        setError("You must be logged in to manage domains");
        
        // Redirect to login after a delay
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUser();
  }, [router]);
  
  // Handle success after form submission
  const handleFormSuccess = (domain: Domain) => {
    if (mode === 'create') {
      // Redirect to the graph page with the new domain
      router.push(`/graph?domainId=${domain.id}`);
    } else {
      // Go back to dashboard after editing
      router.push('/dashboard');
    }
  };
  
  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
          </div>
          <p className="text-center text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Link href="/login">
            <Button className="w-full">Go to Login</Button>
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8 flex items-center">
            <Button 
              variant="ghost" 
              onClick={() => router.back()} 
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            <h1 className="text-2xl font-bold">
              {mode === 'create' ? 'Create New Domain' : 'Edit Domain'}
            </h1>
          </div>
          
          <DomainForm 
            domainId={domainId} 
            onSuccess={handleFormSuccess}
            onCancel={() => router.back()}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
