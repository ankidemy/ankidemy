// src/app/(page)/debug/page.tsx
"use client";

import ProtectedRoute from "@/app/components/ProtectedRoute";
import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/core/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/app/components/core/card";
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import * as api from '@/lib/api';

export default function DebugPage() {
  const [activeTab, setActiveTab] = useState('domains');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginStatus, setLoginStatus] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          await api.getCurrentUser();
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Not authenticated:', error);
        localStorage.removeItem('token');
      }
    };
    
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginStatus('Logging in...');
    
    try {
      await api.loginUser({ email, password });
      setIsAuthenticated(true);
      setLoginStatus('Logged in successfully');
    } catch (error) {
      console.error('Login failed:', error);
      setLoginStatus(`Login failed: ${error.message}`);
    }
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setLoginStatus('Logged out');
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-4 max-w-md mt-20">
        <Card>
          <CardHeader>
            <CardTitle>Debug Page Login</CardTitle>
            <CardDescription>Login to access the debug panel</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit">Login</Button>
              {loginStatus && (
                <p className={`text-sm ${loginStatus.includes('failed') ? 'text-red-500' : 'text-green-500'}`}>
                  {loginStatus}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Debug Panel</h1>
        <Button variant="outline" onClick={handleLogout}>Logout</Button>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full mb-6">
          <TabsTrigger value="domains" className="flex-1">Domains</TabsTrigger>
          <TabsTrigger value="definitions" className="flex-1">Definitions</TabsTrigger>
          <TabsTrigger value="exercises" className="flex-1">Exercises</TabsTrigger>
          <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          <TabsTrigger value="progress" className="flex-1">Progress</TabsTrigger>
        </TabsList>
        
        <TabsContent value="domains">
          <DomainDebugPanel />
        </TabsContent>
        
        <TabsContent value="definitions">
          <DefinitionDebugPanel />
        </TabsContent>
        
        <TabsContent value="exercises">
          <ExerciseDebugPanel />
        </TabsContent>
        
        <TabsContent value="users">
          <UserDebugPanel />
        </TabsContent>
        
        <TabsContent value="progress">
          <ProgressDebugPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Domain Debug Panel
function DomainDebugPanel() {
  const [domains, setDomains] = useState<api.Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<api.Domain | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    privacy: 'private' as 'public' | 'private',
    description: ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Fetch domains
  const fetchDomains = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const allDomains = await api.getAllDomains();
      setDomains(allDomains);
    } catch (err) {
      console.error('Error fetching domains:', err);
      setError(`Failed to fetch domains: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load domains on mount
  useEffect(() => {
    fetchDomains();
  }, []);

  // Reset form when switching between create/edit modes
  useEffect(() => {
    if (isEditing && selectedDomain) {
      setFormData({
        name: selectedDomain.name,
        privacy: selectedDomain.privacy as 'public' | 'private',
        description: selectedDomain.description || ''
      });
    } else if (!isEditing) {
      setFormData({
        name: '',
        privacy: 'private',
        description: ''
      });
    }
  }, [isEditing, selectedDomain]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle radio button change for privacy
  const handlePrivacyChange = (value: 'public' | 'private') => {
    setFormData(prev => ({ ...prev, privacy: value }));
  };

  // Handle domain selection
  const handleSelectDomain = (domain: api.Domain) => {
    setSelectedDomain(domain);
    setIsEditing(true);
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionStatus('Processing...');
    
    try {
      if (isEditing && selectedDomain) {
        // Update existing domain
        await api.updateDomain(selectedDomain.id, formData);
        setActionStatus('Domain updated successfully');
      } else {
        // Create new domain
        await api.createDomain(formData);
        setActionStatus('Domain created successfully');
      }
      
      // Refresh domains list
      fetchDomains();
      
      // Reset form after successful submission
      if (!isEditing) {
        setFormData({
          name: '',
          privacy: 'private',
          description: ''
        });
      }
    } catch (err) {
      console.error('Error saving domain:', err);
      setActionStatus(`Failed to save domain: ${err.message}`);
    }
  };

  // Handle domain deletion
  const handleDelete = async () => {
    if (!selectedDomain) return;
    
    if (window.confirm(`Are you sure you want to delete domain "${selectedDomain.name}"?`)) {
      setActionStatus('Deleting...');
      
      try {
        await api.deleteDomain(selectedDomain.id);
        setActionStatus('Domain deleted successfully');
        setSelectedDomain(null);
        setIsEditing(false);
        fetchDomains();
      } catch (err) {
        console.error('Error deleting domain:', err);
        setActionStatus(`Failed to delete domain: ${err.message}`);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left panel - Domains list */}
      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>
            {loading ? 'Loading domains...' : 
             error ? error : 
             `${domains.length} domains found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-y-auto">
          {domains.length > 0 ? (
            <ul className="space-y-2">
              {domains.map(domain => (
                <li 
                  key={domain.id}
                  className={`p-3 rounded-md cursor-pointer border ${
                    selectedDomain?.id === domain.id ? 'bg-gray-100 border-gray-400' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => handleSelectDomain(domain)}
                >
                  <div className="font-medium">{domain.name}</div>
                  <div className="text-sm text-gray-500 flex justify-between">
                    <span>ID: {domain.id}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      domain.privacy === 'public' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {domain.privacy}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : loading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : (
            <div className="text-center py-4 text-gray-500">No domains found</div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button onClick={fetchDomains}>Refresh</Button>
          <Button onClick={() => { setIsEditing(false); setSelectedDomain(null); }}>
            Create New Domain
          </Button>
        </CardFooter>
      </Card>

      {/* Right panel - Edit/Create form */}
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Edit Domain' : 'Create Domain'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter domain name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Privacy</label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={formData.privacy === 'private'}
                    onChange={() => handlePrivacyChange('private')}
                    className="h-4 w-4"
                  />
                  <span>Private</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    checked={formData.privacy === 'public'}
                    onChange={() => handlePrivacyChange('public')}
                    className="h-4 w-4"
                  />
                  <span>Public</span>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="w-full h-24 p-2 border rounded-md"
                placeholder="Domain description"
              />
            </div>
            
            {actionStatus && (
              <div className={`p-2 rounded text-sm ${
                actionStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
              }`}>
                {actionStatus}
              </div>
            )}
            
            <div className="flex justify-between pt-2">
              <Button type="submit">
                {isEditing ? 'Update Domain' : 'Create Domain'}
              </Button>
              
              {isEditing && selectedDomain && (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                  Delete Domain
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Definition Debug Panel
function DefinitionDebugPanel() {
  const [domains, setDomains] = useState<api.Domain[]>([]);
  const [definitions, setDefinitions] = useState<api.Definition[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null);
  const [selectedDefinition, setSelectedDefinition] = useState<api.Definition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState<Partial<api.DefinitionRequest>>({
    code: '',
    name: '',
    description: '',
    notes: '',
    references: [],
    prerequisiteIds: [],
    domainId: null,
    xPosition: 0,
    yPosition: 0
  });

  // Fetch domains
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.getAllDomains();
        setDomains(data);
      } catch (err) {
        console.error('Error fetching domains:', err);
        setError('Failed to fetch domains');
      }
    };
    
    fetchDomains();
  }, []);

  // Fetch definitions when domain is selected
  useEffect(() => {
    if (selectedDomain) {
      fetchDefinitionsForDomain(selectedDomain);
    } else {
      setDefinitions([]);
    }
  }, [selectedDomain]);

  // Reset form when switching between create/edit modes
  useEffect(() => {
    if (isEditing && selectedDefinition) {
      setFormData({
        code: selectedDefinition.code,
        name: selectedDefinition.name,
        description: selectedDefinition.description,
        notes: selectedDefinition.notes || '',
        references: selectedDefinition.references || [],
        prerequisiteIds: selectedDefinition.prerequisites?.map(code => {
          // Find the definition with this code to get its ID
          const prerequisiteDef = definitions.find(def => def.code === code);
          return prerequisiteDef?.id;
        }).filter(Boolean) || [],
        domainId: selectedDefinition.domainId,
        xPosition: selectedDefinition.xPosition || 0,
        yPosition: selectedDefinition.yPosition || 0
      });
    } else if (!isEditing) {
      setFormData({
        code: '',
        name: '',
        description: '',
        notes: '',
        references: [],
        prerequisiteIds: [],
        domainId: selectedDomain,
        xPosition: 0,
        yPosition: 0
      });
    }
  }, [isEditing, selectedDefinition, definitions, selectedDomain]);

  const fetchDefinitionsForDomain = async (domainId: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const definitionsData = await api.getDomainDefinitions(domainId);
      setDefinitions(definitionsData);
    } catch (err) {
      console.error('Error fetching definitions:', err);
      setError(`Failed to fetch definitions: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleReferencesChange = (e) => {
    const references = e.target.value.split('\n').map(r => r.trim()).filter(r => r);
    setFormData(prev => ({ ...prev, references }));
  };

  const handlePrerequisitesChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => Number(option.value));
    setFormData(prev => ({ ...prev, prerequisiteIds: selectedOptions }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionStatus('Processing...');
    
    try {
      // Make sure position values are properly converted to numbers
      const processedFormData = {
        ...formData,
        xPosition: formData.xPosition ? Number(formData.xPosition) : 0,
        yPosition: formData.yPosition ? Number(formData.yPosition) : 0,
        prerequisiteIds: formData.prerequisiteIds?.map(id => 
          typeof id === 'string' ? Number(id) : id
        )
      };
      
      if (isEditing && selectedDefinition) {
        // Update definition
        await api.updateDefinition(selectedDefinition.id, processedFormData);
        setActionStatus('Definition updated successfully');
      } else {
        // Create definition
        if (!selectedDomain) {
          setActionStatus('Please select a domain first');
          return;
        }
        
        await api.createDefinition(selectedDomain, {
          ...processedFormData,
          domainId: selectedDomain
        } as api.DefinitionRequest);
        
        setActionStatus('Definition created successfully');
      }
      
      // Refresh definitions
      if (selectedDomain) {
        fetchDefinitionsForDomain(selectedDomain);
      }
      
      // Reset form for creation
      if (!isEditing) {
        setFormData({
          code: '',
          name: '',
          description: '',
          notes: '',
          references: [],
          prerequisiteIds: [],
          domainId: selectedDomain,
          xPosition: 0,
          yPosition: 0
        });
      }
    } catch (err) {
      console.error('Error saving definition:', err);
      setActionStatus(`Failed to save definition: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedDefinition) return;
    
    if (window.confirm(`Are you sure you want to delete definition "${selectedDefinition.name}"?`)) {
      setActionStatus('Deleting...');
      
      try {
        await api.deleteDefinition(selectedDefinition.id);
        setActionStatus('Definition deleted successfully');
        setSelectedDefinition(null);
        setIsEditing(false);
        
        if (selectedDomain) {
          fetchDefinitionsForDomain(selectedDomain);
        }
      } catch (err) {
        console.error('Error deleting definition:', err);
        setActionStatus(`Failed to delete definition: ${err.message}`);
      }
    }
  };

  return (
    <ProtectedRoute>
      <div className="space-y-6">
        {/* Domain selector */}
        <Card>
          <CardHeader>
            <CardTitle>Select Domain</CardTitle>
          </CardHeader>
          <CardContent>
            <select 
              className="w-full p-2 border rounded-md"
              value={selectedDomain || ''}
              onChange={(e) => setSelectedDomain(Number(e.target.value) || null)}
            >
              <option value="">-- Select a domain --</option>
              {domains.map(domain => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        {selectedDomain && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left panel - Definitions list */}
            <Card>
              <CardHeader>
                <CardTitle>Definitions</CardTitle>
                <CardDescription>
                  {loading ? 'Loading definitions...' : 
                  error ? error : 
                  `${definitions.length} definitions found`}
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {definitions.length > 0 ? (
                  <ul className="space-y-2">
                    {definitions.map(definition => (
                      <li 
                        key={definition.id}
                        className={`p-3 rounded-md cursor-pointer border ${
                          selectedDefinition?.id === definition.id ? 'bg-gray-100 border-gray-400' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                        onClick={() => { 
                          setSelectedDefinition(definition);
                          setIsEditing(true);
                        }}
                      >
                        <div className="font-medium">{definition.name}</div>
                        <div className="text-sm text-gray-500">Code: {definition.code}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {definition.description.substring(0, 50)}
                          {definition.description.length > 50 ? '...' : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : loading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : (
                  <div className="text-center py-4 text-gray-500">No definitions found</div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button 
                  onClick={() => selectedDomain && fetchDefinitionsForDomain(selectedDomain)}
                >
                  Refresh
                </Button>
                <Button onClick={() => { setIsEditing(false); setSelectedDefinition(null); }}>
                  Create New Definition
                </Button>
              </CardFooter>
            </Card>

            {/* Right panel - Edit/Create form */}
            <Card>
              <CardHeader>
                <CardTitle>{isEditing ? 'Edit Definition' : 'Create Definition'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Code</label>
                    <Input
                      name="code"
                      value={formData.code}
                      onChange={handleInputChange}
                      required
                      placeholder="Definition code (e.g., DEF001)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <Input
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      placeholder="Definition name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      className="w-full h-24 p-2 border rounded-md"
                      placeholder="Definition description (can use LaTeX with $ symbols)"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      className="w-full h-16 p-2 border rounded-md"
                      placeholder="Additional notes"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">References</label>
                    <textarea
                      value={formData.references?.join('\n') || ''}
                      onChange={handleReferencesChange}
                      className="w-full h-16 p-2 border rounded-md"
                      placeholder="One reference per line"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Prerequisites</label>
                    <select
                      multiple
                      className="w-full h-24 p-2 border rounded-md"
                      value={formData.prerequisiteIds?.map(String) || []}
                      onChange={handlePrerequisitesChange}
                    >
                      {definitions
                        .filter(def => def.id !== selectedDefinition?.id)
                        .map(def => (
                          <option key={def.id} value={def.id}>
                            {def.code}: {def.name}
                          </option>
                        ))
                      }
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">X Position</label>
                      <Input
                        type="number"
                        name="xPosition"
                        value={formData.xPosition}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Y Position</label>
                      <Input
                        type="number"
                        name="yPosition"
                        value={formData.yPosition}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  
                  {actionStatus && (
                    <div className={`p-2 rounded text-sm ${
                      actionStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {actionStatus}
                    </div>
                  )}
                  
                  <div className="flex justify-between pt-2">
                    <Button type="submit">
                      {isEditing ? 'Update Definition' : 'Create Definition'}
                    </Button>
                    
                    {isEditing && selectedDefinition && (
                      <Button type="button" variant="destructive" onClick={handleDelete}>
                        Delete Definition
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

// Exercise Debug Panel
function ExerciseDebugPanel() {
  const [domains, setDomains] = useState<api.Domain[]>([]);
  const [exercises, setExercises] = useState<api.Exercise[]>([]);
  const [definitions, setDefinitions] = useState<api.Definition[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<api.Exercise | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
  const [formData, setFormData] = useState<Partial<api.ExerciseRequest>>({
    code: '',
    name: '',
    statement: '',
    description: '',
    hints: '',
    verifiable: false,
    result: '',
    difficulty: '3',
    prerequisiteIds: [],
    domainId: null,
    xPosition: 0,
    yPosition: 0
  });

  // Fetch domains
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.getAllDomains();
        setDomains(data);
      } catch (err) {
        console.error('Error fetching domains:', err);
        setError('Failed to fetch domains');
      }
    };
    
    fetchDomains();
  }, []);

  // Fetch exercises when domain is selected
  useEffect(() => {
    if (selectedDomain) {
      fetchExercisesForDomain(selectedDomain);
      fetchDefinitionsForDomain(selectedDomain);
    } else {
      setExercises([]);
      setDefinitions([]);
    }
  }, [selectedDomain]);

  // Reset form when switching between create/edit modes
  useEffect(() => {
    if (isEditing && selectedExercise) {
      setFormData({
        code: selectedExercise.code,
        name: selectedExercise.name,
        statement: selectedExercise.statement,
        description: selectedExercise.description,
        hints: selectedExercise.hints || '',
        verifiable: selectedExercise.verifiable,
        result: selectedExercise.result || '',
        difficulty: selectedExercise.difficulty?.toString() || '3',
        prerequisiteIds: selectedExercise.prerequisites?.map(code => {
          // Find the definition with this code to get its ID
          const prerequisiteDef = definitions.find(def => def.code === code);
          return prerequisiteDef?.id;
        }).filter(Boolean) || [],
        domainId: selectedExercise.domainId,
        xPosition: selectedExercise.xPosition || 0,
        yPosition: selectedExercise.yPosition || 0
      });
    } else if (!isEditing) {
      setFormData({
        code: '',
        name: '',
        statement: '',
        description: '',
        hints: '',
        verifiable: false,
        result: '',
        difficulty: '3',
        prerequisiteIds: [],
        domainId: selectedDomain,
        xPosition: 0,
        yPosition: 0
      });
    }
  }, [isEditing, selectedExercise, definitions, selectedDomain]);

  const fetchExercisesForDomain = async (domainId: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const exercisesData = await api.getDomainExercises(domainId);
      setExercises(exercisesData);
    } catch (err) {
      console.error('Error fetching exercises:', err);
      setError(`Failed to fetch exercises: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchDefinitionsForDomain = async (domainId: number) => {
    try {
      const definitionsData = await api.getDomainDefinitions(domainId);
      setDefinitions(definitionsData);
    } catch (err) {
      console.error('Error fetching definitions:', err);
      // Don't set error here to not override exercise loading error
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handlePrerequisitesChange = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => Number(option.value));
    setFormData(prev => ({ ...prev, prerequisiteIds: selectedOptions }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionStatus('Processing...');
    
    try {
      // Make sure position values are properly converted and convert difficulty to a number
      const processedFormData = {
        ...formData,
        xPosition: formData.xPosition ? Number(formData.xPosition) : 0,
        yPosition: formData.yPosition ? Number(formData.yPosition) : 0,
        // Convert difficulty to a number since that's what the backend expects
        difficulty: formData.difficulty ? parseInt(formData.difficulty, 10) : 3,
        prerequisiteIds: formData.prerequisiteIds?.map(id => 
          typeof id === 'string' ? Number(id) : id
        )
      };
      
      if (isEditing && selectedExercise) {
        // Update exercise
        await api.updateExercise(selectedExercise.id, processedFormData);
        setActionStatus('Exercise updated successfully');
      } else {
        // Create exercise
        if (!selectedDomain) {
          setActionStatus('Please select a domain first');
          return;
        }
        
        await api.createExercise(selectedDomain, {
          ...processedFormData,
          domainId: selectedDomain
        } as api.ExerciseRequest);
        
        setActionStatus('Exercise created successfully');
      }
      
      // Refresh exercises
      if (selectedDomain) {
        fetchExercisesForDomain(selectedDomain);
      }
      
      // Reset form for creation
      if (!isEditing) {
        setFormData({
          code: '',
          name: '',
          statement: '',
          description: '',
          hints: '',
          verifiable: false,
          result: '',
          difficulty: '3',
          prerequisiteIds: [],
          domainId: selectedDomain,
          xPosition: 0,
          yPosition: 0
        });
      }
    } catch (err) {
      console.error('Error saving exercise:', err);
      setActionStatus(`Failed to save exercise: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!selectedExercise) return;
    
    if (window.confirm(`Are you sure you want to delete exercise "${selectedExercise.name}"?`)) {
      setActionStatus('Deleting...');
      
      try {
        await api.deleteExercise(selectedExercise.id);
        setActionStatus('Exercise deleted successfully');
        setSelectedExercise(null);
        setIsEditing(false);
        
        if (selectedDomain) {
          fetchExercisesForDomain(selectedDomain);
        }
      } catch (err) {
        console.error('Error deleting exercise:', err);
        setActionStatus(`Failed to delete exercise: ${err.message}`);
      }
    }
  };

  const testExerciseVerification = async () => {
    if (!selectedExercise) return;
    
    const testAnswer = window.prompt("Enter an answer to test exercise verification:");
    if (testAnswer === null) return;
    
    setActionStatus('Verifying answer...');
    
    try {
      const result = await api.verifyExerciseAnswer(selectedExercise.id, testAnswer);
      setActionStatus(`Verification result: ${result.correct ? 'Correct' : 'Incorrect'} - ${result.message}`);
    } catch (err) {
      console.error('Error verifying exercise:', err);
      setActionStatus(`Verification failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Domain selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <select 
            className="w-full p-2 border rounded-md"
            value={selectedDomain || ''}
            onChange={(e) => setSelectedDomain(Number(e.target.value) || null)}
          >
            <option value="">-- Select a domain --</option>
            {domains.map(domain => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {selectedDomain && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left panel - Exercises list */}
          <Card>
            <CardHeader>
              <CardTitle>Exercises</CardTitle>
              <CardDescription>
                {loading ? 'Loading exercises...' : 
                error ? error : 
                `${exercises.length} exercises found`}
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto">
              {exercises.length > 0 ? (
                <ul className="space-y-2">
                  {exercises.map(exercise => (
                    <li 
                      key={exercise.id}
                      className={`p-3 rounded-md cursor-pointer border ${
                        selectedExercise?.id === exercise.id ? 'bg-gray-100 border-gray-400' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                      onClick={() => { 
                        setSelectedExercise(exercise);
                        setIsEditing(true);
                      }}
                    >
                      <div className="font-medium">{exercise.name}</div>
                      <div className="text-sm text-gray-500 flex justify-between">
                        <span>Code: {exercise.code}</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">
                          Difficulty: {exercise.difficulty}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {exercise.statement.substring(0, 50)}
                        {exercise.statement.length > 50 ? '...' : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : loading ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : (
                <div className="text-center py-4 text-gray-500">No exercises found</div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button 
                onClick={() => selectedDomain && fetchExercisesForDomain(selectedDomain)}
              >
                Refresh
              </Button>
              <Button onClick={() => { setIsEditing(false); setSelectedExercise(null); }}>
                Create New Exercise
              </Button>
            </CardFooter>
          </Card>

          {/* Right panel - Edit/Create form */}
          <Card>
            <CardHeader>
              <CardTitle>{isEditing ? 'Edit Exercise' : 'Create Exercise'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Code</label>
                  <Input
                    name="code"
                    value={formData.code}
                    onChange={handleInputChange}
                    required
                    placeholder="Exercise code (e.g., EX001)"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Exercise name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Statement</label>
                  <textarea
                    name="statement"
                    value={formData.statement}
                    onChange={handleInputChange}
                    className="w-full h-24 p-2 border rounded-md"
                    placeholder="Exercise statement (can use LaTeX with $ symbols)"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Solution/Description</label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    className="w-full h-24 p-2 border rounded-md"
                    placeholder="Solution or exercise description"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hints</label>
                  <textarea
                    name="hints"
                    value={formData.hints}
                    onChange={handleInputChange}
                    className="w-full h-16 p-2 border rounded-md"
                    placeholder="Hints for solving the exercise"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Difficulty (1-7)</label>
                    <Input
                      type="number"
                      name="difficulty"
                      value={formData.difficulty}
                      onChange={handleInputChange}
                      min="1"
                      max="7"
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <input
                      type="checkbox"
                      name="verifiable"
                      checked={formData.verifiable}
                      onChange={handleInputChange}
                      className="h-5 w-5 mr-2"
                    />
                    <label className="text-sm font-medium">Verifiable</label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Expected Result (for verification)</label>
                  <Input
                    name="result"
                    value={formData.result}
                    onChange={handleInputChange}
                    placeholder="Expected answer for automatic verification"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prerequisites</label>
                  <select
                    multiple
                    className="w-full h-24 p-2 border rounded-md"
                    value={formData.prerequisiteIds?.map(String) || []}
                    onChange={handlePrerequisitesChange}
                  >
                    {definitions.map(def => (
                      <option key={def.id} value={def.id}>
                        {def.code}: {def.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">X Position</label>
                    <Input
                      type="number"
                      name="xPosition"
                      value={formData.xPosition}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Y Position</label>
                    <Input
                      type="number"
                      name="yPosition"
                      value={formData.yPosition}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                
                {actionStatus && (
                  <div className={`p-2 rounded text-sm ${
                    actionStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {actionStatus}
                  </div>
                )}
                
                <div className="flex justify-between pt-2">
                  <Button type="submit">
                    {isEditing ? 'Update Exercise' : 'Create Exercise'}
                  </Button>
                  
                  {isEditing && selectedExercise && (
                    <div className="space-x-2">
                      {selectedExercise.verifiable && (
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={testExerciseVerification}
                        >
                          Test Verification
                        </Button>
                      )}
                      <Button type="button" variant="destructive" onClick={handleDelete}>
                        Delete Exercise
                      </Button>
                    </div>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// User Debug Panel
function UserDebugPanel() {
  const [currentUser, setCurrentUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    password: ''
  });

  // Load current user info
  useEffect(() => {
    const fetchCurrentUser = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const userData = await api.getCurrentUser();
        setCurrentUser(userData);
        
        // Initialize form with user data
        setFormData({
          username: userData.username,
          email: userData.email,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          password: '' // Don't fill password
        });
      } catch (err) {
        console.error('Error fetching user:', err);
        setError(`Failed to fetch user: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCurrentUser();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionStatus('Updating user...');
    
    try {
      // Only include password if it's been entered
      const updateData = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        ...(formData.password ? { password: formData.password } : {})
      };
      
      const updatedUser = await api.updateCurrentUser(updateData);
      setCurrentUser(updatedUser);
      setActionStatus('User updated successfully');
      
      // Clear password field after update
      setFormData(prev => ({ ...prev, password: '' }));
    } catch (err) {
      console.error('Error updating user:', err);
      setActionStatus(`Failed to update user: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="text-lg">Loading user information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-500">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* User info card */}
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <span className="font-semibold">ID:</span> {currentUser?.id}
            </div>
            <div>
              <span className="font-semibold">Username:</span> {currentUser?.username}
            </div>
            <div>
              <span className="font-semibold">Email:</span> {currentUser?.email}
            </div>
            <div>
              <span className="font-semibold">Name:</span> {currentUser?.firstName} {currentUser?.lastName}
            </div>
            <div>
              <span className="font-semibold">Level:</span> {currentUser?.level || 'N/A'}
            </div>
            <div>
              <span className="font-semibold">Status:</span> {currentUser?.isActive ? 'Active' : 'Inactive'}
            </div>
            <div>
              <span className="font-semibold">Role:</span> {currentUser?.isAdmin ? 'Admin' : 'User'}
            </div>
            <div>
              <span className="font-semibold">Created:</span> {new Date(currentUser?.createdAt || '').toLocaleString()}
            </div>
            <div>
              <span className="font-semibold">Updated:</span> {new Date(currentUser?.updatedAt || '').toLocaleString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit user form */}
      <Card>
        <CardHeader>
          <CardTitle>Edit User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Username</label>
              <Input
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">First Name</label>
              <Input
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Last Name</label>
              <Input
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                New Password (leave blank to keep current)
              </label>
              <Input
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Enter new password to change"
              />
            </div>
            
            {actionStatus && (
              <div className={`p-2 rounded text-sm ${
                actionStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
              }`}>
                {actionStatus}
              </div>
            )}
            
            <Button type="submit" className="mt-2">
              Update User
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// Progress Tracking Debug Panel
function ProgressDebugPanel() {
  const [domains, setDomains] = useState<api.Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<number | null>(null);
  const [definitionProgress, setDefinitionProgress] = useState<any[]>([]);
  const [exerciseProgress, setExerciseProgress] = useState<any[]>([]);
  const [domainProgress, setDomainProgress] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Fetch domains
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        const data = await api.getAllDomains();
        setDomains(data);
      } catch (err) {
        console.error('Error fetching domains:', err);
        setError('Failed to fetch domains');
      }
    };
    
    fetchDomains();
  }, []);

  // Fetch domain progress
  useEffect(() => {
    const fetchDomainProgress = async () => {
      try {
        const progress = await api.getDomainProgress();
        setDomainProgress(progress);
      } catch (err) {
        console.error('Error fetching domain progress:', err);
        setError('Failed to fetch domain progress');
      }
    };
    
    fetchDomainProgress();
  }, []);

  // Fetch definition and exercise progress when domain is selected
  useEffect(() => {
    if (selectedDomain) {
      fetchProgressForDomain(selectedDomain);
    } else {
      setDefinitionProgress([]);
      setExerciseProgress([]);
    }
  }, [selectedDomain]);

  const fetchProgressForDomain = async (domainId: number) => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch definition progress
      const defProgress = await api.getDefinitionProgress(domainId);
      setDefinitionProgress(defProgress);
      
      // Fetch exercise progress
      const exProgress = await api.getExerciseProgress(domainId);
      setExerciseProgress(exProgress);
    } catch (err) {
      console.error('Error fetching progress:', err);
      setError(`Failed to fetch progress: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get review definitions
  const handleGetReviewDefinitions = async () => {
    if (!selectedDomain) {
      setActionStatus('Please select a domain first');
      return;
    }
    
    setActionStatus('Fetching definitions for review...');
    
    try {
      const definitions = await api.getDefinitionsForReview(selectedDomain, 10);
      setActionStatus(`Found ${definitions.length} definitions for review`);
    } catch (err) {
      console.error('Error fetching review definitions:', err);
      setActionStatus(`Failed to fetch review definitions: ${err.message}`);
    }
  };

  // Start session
  const handleStartSession = async () => {
    if (!selectedDomain) {
      setActionStatus('Please select a domain first');
      return;
    }
    
    setActionStatus('Starting study session...');
    
    try {
      const session = await api.startSession(selectedDomain);
      setActionStatus(`Session started with ID: ${session.id}`);
    } catch (err) {
      console.error('Error starting session:', err);
      setActionStatus(`Failed to start session: ${err.message}`);
    }
  };

  // Get all sessions
  const handleGetSessions = async () => {
    setActionStatus('Fetching sessions...');
    
    try {
      const sessions = await api.getSessions();
      setActionStatus(`Found ${sessions.length} sessions`);
      
      // If there are sessions, show the latest one
      if (sessions.length > 0) {
        const latestSession = sessions[0];
        
        try {
          const sessionDetails = await api.getSessionDetails(latestSession.id);
          console.log('Latest session details:', sessionDetails);
          setActionStatus(`Latest session ID: ${latestSession.id}. See console for details.`);
        } catch (err) {
          console.error('Error fetching session details:', err);
        }
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setActionStatus(`Failed to fetch sessions: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Domain selector */}
      <Card>
        <CardHeader>
          <CardTitle>Progress Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="col-span-1">
              <label className="block text-sm font-medium mb-1">Select Domain</label>
              <select 
                className="w-full p-2 border rounded-md"
                value={selectedDomain || ''}
                onChange={(e) => setSelectedDomain(Number(e.target.value) || null)}
              >
                <option value="">-- Select a domain --</option>
                {domains.map(domain => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex space-x-2">
              <Button onClick={handleGetReviewDefinitions}>
                Get Review Definitions
              </Button>
              <Button onClick={handleStartSession}>
                Start Session
              </Button>
              <Button onClick={handleGetSessions}>
                Get Sessions
              </Button>
            </div>
          </div>
          
          {actionStatus && (
            <div className={`mt-4 p-2 rounded text-sm ${
              actionStatus.includes('Failed') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}>
              {actionStatus}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Domain progress overview */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Progress Overview</CardTitle>
        </CardHeader>
        <CardContent>
          {domainProgress.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Domain ID</th>
                    <th className="border p-2 text-left">Progress</th>
                    <th className="border p-2 text-left">Enrollment Date</th>
                    <th className="border p-2 text-left">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {domainProgress.map((progress, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="border p-2">
                        {progress.domainId}
                      </td>
                      <td className="border p-2">
                        <div className="flex items-center">
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div 
                              className="bg-blue-600 h-2.5 rounded-full" 
                              style={{ width: `${progress.progress || 0}%` }}
                            ></div>
                          </div>
                          <span className="ml-2">{progress.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="border p-2">
                        {new Date(progress.enrollmentDate).toLocaleDateString()}
                      </td>
                      <td className="border p-2">
                        {progress.lastActivity ? new Date(progress.lastActivity).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center p-4 text-gray-500">No domain progress data available</div>
          )}
        </CardContent>
      </Card>

      {selectedDomain && (
        <>
          {/* Definition progress */}
          <Card>
            <CardHeader>
              <CardTitle>Definition Progress</CardTitle>
              <CardDescription>
                {loading ? 'Loading progress...' : 
                error ? error : 
                `${definitionProgress.length} definitions tracked`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {definitionProgress.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">Definition</th>
                        <th className="border p-2 text-left">Learned</th>
                        <th className="border p-2 text-left">Last Review</th>
                        <th className="border p-2 text-left">Next Review</th>
                        <th className="border p-2 text-left">E-Factor</th>
                        <th className="border p-2 text-left">Interval (days)</th>
                        <th className="border p-2 text-left">Repetitions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {definitionProgress.map((progress, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border p-2">
                            {progress.definition ? 
                              `${progress.definition.code}: ${progress.definition.name}` : 
                              `ID: ${progress.definitionId}`}
                          </td>
                          <td className="border p-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              progress.learned ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {progress.learned ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="border p-2">
                            {progress.lastReview ? new Date(progress.lastReview).toLocaleString() : 'Never'}
                          </td>
                          <td className="border p-2">
                            {progress.nextReview ? new Date(progress.nextReview).toLocaleString() : 'Not scheduled'}
                          </td>
                          <td className="border p-2">{progress.easinessFactor?.toFixed(2) || 'N/A'}</td>
                          <td className="border p-2">{progress.intervalDays || 'N/A'}</td>
                          <td className="border p-2">{progress.repetitions || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : loading ? (
                <div className="text-center p-4 text-gray-500">Loading...</div>
              ) : (
                <div className="text-center p-4 text-gray-500">No definition progress data available</div>
              )}
            </CardContent>
          </Card>

          {/* Exercise progress */}
          <Card>
            <CardHeader>
              <CardTitle>Exercise Progress</CardTitle>
              <CardDescription>
                {loading ? 'Loading progress...' : 
                error ? error : 
                `${exerciseProgress.length} exercises tracked`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exerciseProgress.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">Exercise</th>
                        <th className="border p-2 text-left">Completed</th>
                        <th className="border p-2 text-left">Correct</th>
                        <th className="border p-2 text-left">Attempts</th>
                        <th className="border p-2 text-left">Last Attempt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exerciseProgress.map((progress, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="border p-2">
                            {progress.exercise ? 
                              `${progress.exercise.code}: ${progress.exercise.name}` : 
                              `ID: ${progress.exerciseId}`}
                          </td>
                          <td className="border p-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              progress.completed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {progress.completed ? 'Yes' : 'No'}
                            </span>
                          </td>
                          <td className="border p-2">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              progress.correct ? 'bg-green-100 text-green-800' : 
                              progress.completed ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {progress.completed ? (progress.correct ? 'Yes' : 'No') : 'N/A'}
                            </span>
                          </td>
                          <td className="border p-2">{progress.attempts || '0'}</td>
                          <td className="border p-2">
                            {progress.lastAttempt ? new Date(progress.lastAttempt).toLocaleString() : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : loading ? (
                <div className="text-center p-4 text-gray-500">Loading...</div>
              ) : (
                <div className="text-center p-4 text-gray-500">No exercise progress data available</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
