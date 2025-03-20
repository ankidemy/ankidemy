// src/app/components/Domain/DomainForm.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { 
  createDomain, 
  updateDomain, 
  getDomain,
  Domain
} from '@/lib/api';

interface DomainFormProps {
  domainId?: string; // If provided, we're editing; otherwise creating
  onSuccess?: (domain: Domain) => void;
  onCancel?: () => void;
}

const DomainForm: React.FC<DomainFormProps> = ({ domainId, onSuccess, onCancel }) => {
  const router = useRouter();
  const isEditing = !!domainId;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('private');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(!isEditing);

  // If editing, load domain data
  useEffect(() => {
    if (isEditing && domainId) {
      const fetchDomain = async () => {
        setIsLoading(true);
        try {
          const domain = await getDomain(parseInt(domainId));
          
          setName(domain.name);
          setDescription(domain.description || '');
          setPrivacy(domain.privacy as 'public' | 'private');
          setInitialLoadDone(true);
        } catch (err: any) {
          console.error("Error loading domain:", err);
          setError(`Failed to load domain: ${err.message}`);
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchDomain();
    }
  }, [domainId, isEditing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Domain name is required");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      let domain;
      
      if (isEditing && domainId) {
        domain = await updateDomain(parseInt(domainId), {
          name,
          description,
          privacy
        });
      } else {
        domain = await createDomain({
          name,
          description,
          privacy
        });
      }
      
      // Success handling
      if (onSuccess) {
        onSuccess(domain);
      } else {
        // Default behavior - redirect to domain view/edit page
        router.push(`/dashboard/domains/${domain.id}`);
      }
    } catch (err: any) {
      console.error("Error saving domain:", err);
      setError(err.message || "Failed to save domain. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isEditing && !initialLoadDone) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-center">{isLoading ? "Loading Domain..." : "Error"}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-red-500 text-center">{error}</p>}
          {isLoading && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">
          {isEditing ? "Edit Domain" : "Create New Domain"}
        </CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="name" className="block text-sm font-medium">
              Domain Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Mathematics, Programming, Biology, etc."
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="description" className="block text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              className="flex h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this knowledge domain contains..."
              disabled={isLoading}
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Privacy
            </label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="privacy"
                  checked={privacy === 'private'}
                  onChange={() => setPrivacy('private')}
                  disabled={isLoading}
                  className="h-4 w-4 text-orange-500"
                />
                <span>Private</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="privacy"
                  checked={privacy === 'public'}
                  onChange={() => setPrivacy('public')}
                  disabled={isLoading}
                  className="h-4 w-4 text-orange-500"
                />
                <span>Public</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              {privacy === 'public' 
                ? "Public domains can be viewed and enrolled in by all users." 
                : "Private domains are only visible to you."}
            </p>
          </div>
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel || (() => router.back())}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            disabled={isLoading}
          >
            {isLoading 
              ? isEditing ? "Updating..." : "Creating..." 
              : isEditing ? "Update Domain" : "Create Domain"
            }
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default DomainForm;
