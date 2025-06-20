// src/app/components/Domain/DomainForm.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import { 
  createDomain, 
  updateDomain, 
  getDomain,
  createDomainWithImport,
  uploadJsonFile,
  validateImportData,
  Domain,
  DomainExportData
} from '@/lib/api';
import { showToast } from "@/app/components/core/ToastNotification";

interface DomainFormProps {
  domainId?: string; // If provided, we're editing; otherwise creating
  onSuccess?: (domain: Domain) => void;
  onCancel?: () => void;
  allowImport?: boolean; // NEW: Whether to show import option
}

const DomainForm: React.FC<DomainFormProps> = ({ 
  domainId, 
  onSuccess, 
  onCancel, 
  allowImport = false 
}) => {
  const router = useRouter();
  const isEditing = !!domainId;
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('private');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(!isEditing);

  // NEW: Import-related state
  const [importMode, setImportMode] = useState(false);
  const [importData, setImportData] = useState<DomainExportData | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    definitions: number;
    exercises: number;
    sampleDefinitions: string[];
    sampleExercises: string[];
  } | null>(null);

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

  // NEW: Handle file upload
  const handleFileUpload = async () => {
    try {
      setError(null);
      const fileData = await uploadJsonFile();
      
      // Validate the data
      const validation = validateImportData(fileData);
      if (!validation.isValid) {
        setError(`Invalid JSON file: ${validation.errors.join(', ')}`);
        return;
      }

      setImportData(fileData);
      setImportFileName('imported-domain.json'); // We don't have access to the actual filename

      // Generate preview
      const definitionKeys = Object.keys(fileData.definitions || {});
      const exerciseKeys = Object.keys(fileData.exercises || {});
      
      setImportPreview({
        definitions: definitionKeys.length,
        exercises: exerciseKeys.length,
        sampleDefinitions: definitionKeys.slice(0, 3).map(key => fileData.definitions[key]?.name || key),
        sampleExercises: exerciseKeys.slice(0, 3).map(key => fileData.exercises[key]?.name || key),
      });

      showToast('JSON file loaded successfully!', 'success');
    } catch (err: any) {
      setError(err.message || 'Failed to load JSON file');
    }
  };

  // NEW: Clear import data
  const clearImportData = () => {
    setImportData(null);
    setImportFileName(null);
    setImportPreview(null);
    setImportMode(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError("Domain name is required");
      return;
    }

    // For import mode, validate that we have import data
    if (importMode && !importData) {
      setError("Please select a JSON file to import");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      let domain;
      
      if (isEditing && domainId) {
        // For updating, ensure we're only sending fields that are valid for update
        domain = await updateDomain(parseInt(domainId), {
          name,
          description: description.trim() || undefined,
          privacy
        });
      } else if (importMode && importData) {
        // Create domain with import data
        domain = await createDomainWithImport(name, privacy, description.trim(), importData);
      } else {
        // Create regular domain without import
        domain = await createDomain({
          name,
          description: description.trim() || undefined,
          privacy
        });
      }
      
      console.log("Domain after creation/update:", domain);
      
      // Validate domain data
      if (!domain || typeof domain.id !== 'number') {
        console.error("Invalid domain data received:", domain);
        setError("Server returned invalid domain data. Please try again.");
        return;
      }
      
      // Success handling
      if (onSuccess) {
        onSuccess(domain);
      } else {
        // Default behavior - redirect to domain view/edit page
        console.log(`Redirecting to /main/domains/${domain.id}/study`);
        router.push(`/main/domains/${domain.id}/study`);
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="text-center">
          {isEditing ? "Edit Domain" : "Create New Domain"}
        </CardTitle>
        {/* NEW: Import mode toggle */}
        {!isEditing && allowImport && (
          <div className="flex justify-center space-x-4 mt-4">
            <Button
              type="button"
              variant={!importMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setImportMode(false);
                clearImportData();
              }}
            >
              Create Empty
            </Button>
            <Button
              type="button"
              variant={importMode ? "default" : "outline"}
              size="sm"
              onClick={() => setImportMode(true)}
            >
              <Upload size={14} className="mr-1" />
              Import from JSON
            </Button>
          </div>
        )}
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-md text-sm flex items-start">
              <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* NEW: Import file selection */}
          {importMode && !isEditing && (
            <div className="space-y-4 p-4 bg-blue-50 rounded-md border border-blue-200">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-blue-900">Import JSON Data</h3>
                {importData && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearImportData}
                    className="text-blue-700 hover:text-blue-900"
                  >
                    <X size={14} className="mr-1" />
                    Clear
                  </Button>
                )}
              </div>
              
              {!importData ? (
                <div className="text-center py-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFileUpload}
                    className="border-dashed border-2 border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  >
                    <Upload size={16} className="mr-2" />
                    Select JSON File
                  </Button>
                  <p className="text-xs text-blue-600 mt-2">
                    Choose a domain export file (.json)
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center text-green-700 bg-green-50 p-2 rounded">
                    <FileText size={16} className="mr-2" />
                    <span className="text-sm font-medium">File loaded successfully</span>
                  </div>
                  
                  {importPreview && (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-white p-3 rounded border">
                        <div className="font-medium text-blue-900">Definitions</div>
                        <div className="text-lg font-bold text-blue-700">{importPreview.definitions}</div>
                        {importPreview.sampleDefinitions.length > 0 && (
                          <div className="text-xs text-gray-600 mt-1">
                            {importPreview.sampleDefinitions.join(', ')}
                            {importPreview.definitions > 3 && '...'}
                          </div>
                        )}
                      </div>
                      <div className="bg-white p-3 rounded border">
                        <div className="font-medium text-blue-900">Exercises</div>
                        <div className="text-lg font-bold text-blue-700">{importPreview.exercises}</div>
                        {importPreview.sampleExercises.length > 0 && (
                          <div className="text-xs text-gray-600 mt-1">
                            {importPreview.sampleExercises.join(', ')}
                            {importPreview.exercises > 3 && '...'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
            disabled={isLoading || (importMode && !importData)}
          >
            {isLoading 
              ? isEditing ? "Updating..." : (importMode ? "Creating with Import..." : "Creating...")
              : isEditing ? "Update Domain" : (importMode ? "Create with Import" : "Create Domain")
            }
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default DomainForm;
