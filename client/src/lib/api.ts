// FILE: src/lib/api.ts
// Complete API client for Ankidemy with standardized import/export handling

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// Centralized auth redirect helper
const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  try {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace(`/login?next=${next}`);
    }
  } catch {}
};

// Types
export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  level: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// Normalize server user payloads to consistent casing (id, createdAt, ...)
const normalizeUser = (u: any): User => {
  if (!u) return u as any;
  const id = typeof u.id !== 'undefined' ? u.id : u.ID;
  return {
    id: Number(id),
    username: u.username,
    email: u.email,
    level: u.level,
    firstName: u.firstName,
    lastName: u.lastName,
    isActive: Boolean(u.isActive),
    isAdmin: Boolean(u.isAdmin),
    createdAt: u.createdAt ?? u.CreatedAt ?? u.created_at ?? '',
    updatedAt: u.updatedAt ?? u.UpdatedAt ?? u.updated_at ?? '',
    deletedAt: u.deletedAt ?? u.DeletedAt ?? u.deleted_at,
  };
};

export interface Domain {
  id: number;
  name: string;
  privacy: string;
  ownerId: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  definitions?: Definition[];
  exercises?: Exercise[];
}

// NEW: Domain network link types
export interface DomainLink {
  id: number;
  domainAId: number;
  domainBId: number;
  createdBy: number;
  createdAt: string;
}

// FIXED: Added prerequisiteWeights to Definition interface
export interface Definition {
  id: number;
  code: string;
  name: string;
  description: string;
  notes?: string;
  domainId: number;
  ownerId: number;
  xPosition?: number;
  yPosition?: number;
  createdAt: string;
  updatedAt: string;
  references?: string[];
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>; // ADDED: weights for each prerequisite
}

// FIXED: Added prerequisiteWeights to Exercise interface
export interface Exercise {
  id: number;
  code: string;
  name: string;
  statement: string;
  description: string;
  notes?: string;
  hints?: string;
  domainId: number;
  ownerId: number;
  verifiable: boolean;
  result?: string;
  difficulty?: number;
  xPosition?: number;
  yPosition?: number;
  createdAt: string;
  updatedAt: string;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>; // ADDED: weights for each prerequisite
}

// New: Meta-exercise (pool) and version types
export interface ExerciseVersion {
  id: number;
  statement: string;
  description?: string;
  notes?: string;
  hints?: string;
  verifiable?: boolean;
  result?: string;
  difficulty?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaExercise {
  id: number;
  code: string;
  name: string;
  domainId: number;
  ownerId: number;
  xPosition?: number;
  yPosition?: number;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>;
  versionCount: number;
  versions?: ExerciseVersion[];
}

// Updated DefinitionRequest interface
export interface DefinitionRequest {
  code: string;
  name: string;
  description: string;
  notes?: string;
  references?: string[];
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: weights for each prerequisite ID
  domainId: number;
  xPosition?: number;
  yPosition?: number;
}

// Updated ExerciseRequest interface  
export interface ExerciseRequest {
  code: string;
  name: string;
  statement: string;
  description?: string;
  notes?: string;
  hints?: string;
  domainId: number;
  verifiable?: boolean;
  result?: string;
  difficulty?: number;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: weights for each prerequisite ID
  xPosition?: number;
  yPosition?: number;
}

export interface ReviewRequest {
  definitionId: number;
  result: 'again' | 'hard' | 'good' | 'easy';
  timeTaken: number;
}

export interface ExerciseAttemptRequest {
  exerciseId: number;
  answer: string;
  timeTaken: number;
}

export interface VisualGraph {
  nodes: {
    id: string;
    type: 'definition' | 'exercise';
    name: string;
    code: string;
    x?: number;
    y?: number;
    prerequisites?: string[];
  }[];
  links: {
    source: string;
    target: string;
  }[];
}

export interface GraphData {
  definitions: Record<string, {
    code: string;
    name: string;
    description: string;
    notes?: string;
    references?: string[];
    prerequisites?: string[];
    prerequisiteWeights?: Record<string, number>; // ADDED: weights
    xPosition?: number;
    yPosition?: number;
    domainId?: number;
  }>;
  exercises: Record<string, {
    code: string;
    name: string;
    statement: string;
    description?: string;
    notes?: string;
    hints?: string;
    verifiable?: boolean;
    result?: string;
    difficulty?: number;
    prerequisites?: string[];
    prerequisiteWeights?: Record<string, number>; // ADDED: weights
    xPosition?: number;
    yPosition?: number;
    domainId?: number;
  }>;
}

// UPDATED: Standardized Import/Export Data Types
export interface DomainExportData {
  definitions: {
    [key: string]: {
      code: string;
      name: string;
      description: string[]; // STANDARDIZED: Always array for definitions
      notes?: string;
      references?: string[];
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
    };
  };
  exercises?: {
    [key: string]: {
      code: string;
      name: string;
      statement: string;
      description?: string; // Exercises keep single string
      hints?: string;
      difficulty?: number; // Standardized as number
      verifiable?: boolean;
      result?: string;
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
    };
  };
  metaExercises?: {
    [key: string]: {
      code: string;
      name: string;
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
      versions: Array<{
        statement: string;
        description?: string;
        hints?: string;
        verifiable?: boolean;
        result?: string;
        difficulty?: number;
        notes?: string;
      }>;
    };
  };
}

export interface CreateDomainWithImportRequest {
  name: string;
  privacy: 'public' | 'private';
  description?: string;
  importData?: DomainExportData;
}

// Helper functions
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Enhance the handleResponse function to better handle API responses
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // Could not parse JSON, use status text
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }

    // Add more specific error messages based on status codes from API documentation
    switch (response.status) {
      case 400:
        errorMessage = `Bad Request: ${errorMessage}`;
        break;
      case 401:
        errorMessage = 'Authentication required. Please log in again.';
        try { localStorage.removeItem('token'); } catch {}
        // Redirect to login after current microtask
        Promise.resolve().then(redirectToLogin);
        // Downgrade to warn to avoid noisy console errors for expected expiry
        console.warn('Auth expired or missing; redirecting to login', { url: response.url });
        break;
      case 403:
        errorMessage = 'You do not have permission to perform this action.';
        break;
      case 404:
        errorMessage = 'The requested resource was not found.';
        break;
      case 409:
        errorMessage = 'This operation could not be completed due to a conflict (resource may already exist).';
        break;
    }
    
    if (response.status !== 401) {
      console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
    }
    throw new Error(errorMessage);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  
  // For debugging purposes, log the response data
  console.debug(`API Response from ${response.url}:`, data);
  
  return data;
};

// UPDATED: Login now supports email OR username via identifier field
export const loginUser = async (credentials: { identifier: string; password: string }): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  
  const data = await handleResponse(response);
  // Normalize user casing if present
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const registerUser = async (userDetails: {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userDetails),
  });

  const data = await handleResponse(response);
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const refreshToken = async (token: string): Promise<AuthResponse> => {
  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const data = await handleResponse(response);
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const logout = (): void => {
  localStorage.removeItem('token');
};

// UTILITY: Check if user is currently authenticated
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
};

// UTILITY: Safe function to check authentication status
export const checkAuthStatus = async (): Promise<{ isAuthenticated: boolean; user?: User }> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return { isAuthenticated: false };
    }
    
    const user = await getCurrentUser();
    return { isAuthenticated: true, user };
  } catch (error) {
    // Token might be expired or invalid
    localStorage.removeItem('token');
    return { isAuthenticated: false };
  }
};

// User API
export const getCurrentUser = async (): Promise<User> => {
  const response = await fetch(`${API_URL}/api/users/me`, {
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
  });
  const raw = await handleResponse(response);
  return normalizeUser(raw);
};

export const updateCurrentUser = async (userData: {
  username?: string;
  email?: string;
  password?: string;
  // Some endpoints may require the current password when changing password
  currentPassword?: string;
  firstName?: string;
  lastName?: string;
}): Promise<User> => {
  const response = await fetch(`${API_URL}/api/users/me`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  
  return handleResponse(response);
};

// Domain API
export const getPublicDomains = async (): Promise<Domain[]> => {
  try {
    const response = await fetch(`${API_URL}/api/domains/public`);
    
    if (!response.ok) {
      console.warn(`Failed to fetch public domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching public domains:', error);
    return []; // Return empty array on error
  }
};

export const getAllDomains = async (): Promise<Domain[]> => {
  const response = await fetch(`${API_URL}/api/domains`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getMyDomains = async (): Promise<Domain[]> => {
  try {
    const response = await fetch(`${API_URL}/api/domains/my`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch my domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching my domains:', error);
    return []; // Return empty array on error
  }
};

export const getEnrolledDomains = async (): Promise<Domain[]> => {
  try {
    const response = await fetch(`${API_URL}/api/domains/enrolled`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      // Return empty array for errors instead of throwing
      console.warn(`Failed to fetch enrolled domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching enrolled domains:', error);
    return []; // Return empty array on error
  }
};

export const getDomain = async (id: number): Promise<Domain> => {
  const response = await fetch(`${API_URL}/api/domains/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Enhanced createDomain function with better error handling
export const createDomain = async (domain: {
  name: string;
  privacy: 'public' | 'private';
  description?: string;
}): Promise<Domain> => {
  console.log("Creating domain:", domain);
  
  try {
    const response = await fetch(`${API_URL}/api/domains`, {
      method: 'POST',
      headers: { 
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(domain),
    });
    
    const data = await handleResponse(response);
    
    // Verify the response has the expected shape
    if (!data || typeof data.id === 'undefined') {
      console.error("Invalid domain response:", data);
      throw new Error("Server returned incomplete domain data");
    }
    
    console.log("Domain created successfully:", data);
    return data as Domain;
  } catch (error) {
    console.error("Error creating domain:", error);
    throw error;
  }
};

export const updateDomain = async (id: number, domain: {
  name?: string;
  privacy?: 'public' | 'private';
  description?: string;
}): Promise<Domain> => {
  const response = await fetch(`${API_URL}/api/domains/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(domain),
  });
  
  return handleResponse(response);
};

export const deleteDomain = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Archive domain (soft delete). Alias for deleteDomain for clearer semantics in UI
export const archiveDomain = async (id: number): Promise<void> => {
  return deleteDomain(id);
};

// List archived domains owned by current user
export const getMyArchivedDomains = async (): Promise<Domain[]> => {
  const response = await fetch(`${API_URL}/api/domains/archived/my`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Restore a soft-deleted domain
export const restoreDomain = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${id}/restore`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Permanently delete a domain and all related data
export const purgeDomain = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${id}/purge`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const enrollInDomain = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${id}/enroll`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Definition API
export const getDomainDefinitions = async (domainId: number): Promise<Definition[]> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/definitions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const createDefinition = async (domainId: number, definition: DefinitionRequest): Promise<Definition> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/definitions`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(definition),
  });
  
  return handleResponse(response);
};

export const getDefinition = async (id: number): Promise<Definition> => {
  const response = await fetch(`${API_URL}/api/definitions/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Utility functions for definition updates
export const updateDefinition = async (id: number, definitionData: {
  name?: string;
  description?: string;
  notes?: string;
  references?: string[];
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: include weights
  xPosition?: number;
  yPosition?: number;
}): Promise<Definition> => {
  const response = await fetch(`${API_URL}/api/definitions/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(definitionData),
  });
  
  const result = await handleResponse(response);

  // Ensure prerequisites are included as string codes - fallback if API doesn't return them
  if (result && !result.prerequisites && definitionData.prerequisiteIds) {
    result.prerequisites = []; // Handled in calling code by converting IDs to codes
  }

  return result;
};

export const deleteDefinition = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/definitions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getDefinitionByCode = async (code: string, opts?: { domainId?: number }): Promise<Definition> => {
  const domainQuery = opts?.domainId ? `?domainId=${opts.domainId}` : '';
  const url = `${API_URL}/api/definitions/code/${encodeURIComponent(code)}${domainQuery}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

/**
 * Gets the ID of a definition by its code
 * @param code The code of the definition
 * @returns Promise resolving to the ID of the definition
 */
export const getDefinitionIdByCode = async (code: string): Promise<number> => {
  try {
    const response = await getDefinitionByCode(code);
    // Handle array response (API might return array of matching definitions)
    const definition = Array.isArray(response) ? response[0] : response;
    if (!definition || !definition.id) {
      throw new Error(`No definition found with code: ${code}`);
    }
    return definition.id;
  } catch (error) {
    console.error('Error getting definition ID by code:', error);
    throw error;
  }
};

/**
 * Gets the ID of an exercise by its code
 * @param code The code of the exercise
 * @returns Promise resolving to the ID of the exercise
 */
export const getExerciseIdByCode = async (code: string): Promise<number> => {
  try {
    const response = await getExerciseByCode(code);
    // Handle array response (API might return array of matching exercises)
    const exercise = Array.isArray(response) ? response[0] : response;
    if (!exercise || !exercise.id) {
      throw new Error(`No exercise found with code: ${code}`);
    }
    return exercise.id;
  } catch (error) {
    console.error('Error getting exercise ID by code:', error);
    throw error;
  }
};

// Exercise API
export const getDomainExercises = async (domainId: number): Promise<Exercise[]> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/exercises`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// New: Meta-exercises API
export const getDomainMetaExercises = async (domainId: number): Promise<MetaExercise[]> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/meta-exercises`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const createMetaExercise = async (domainId: number, data: {
  code: string; name: string; xPosition?: number; yPosition?: number;
  prerequisiteIds?: number[]; prerequisiteWeights?: Record<number, number>;
  initialVersion?: { statement: string; description?: string; notes?: string; hints?: string; verifiable?: boolean; result?: string; difficulty?: number };
}): Promise<MetaExercise> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/meta-exercises`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const getMetaExercise = async (id: number): Promise<MetaExercise> => {
  const response = await fetch(`${API_URL}/api/meta-exercises/${id}`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const addMetaExerciseVersion = async (metaId: number, version: {
  statement: string; description?: string; notes?: string; hints?: string; verifiable?: boolean; result?: string; difficulty?: number;
}): Promise<ExerciseVersion> => {
  const response = await fetch(`${API_URL}/api/meta-exercises/${metaId}/versions`, {
    method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(version)
  });
  return handleResponse(response);
};

export const updateMetaExerciseVersion = async (metaId: number, versionId: number, version: Partial<ExerciseVersion>): Promise<ExerciseVersion> => {
  const response = await fetch(`${API_URL}/api/meta-exercises/${metaId}/versions/${versionId}`, {
    method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(version)
  });
  return handleResponse(response);
};

export const deleteMetaExerciseVersion = async (metaId: number, versionId: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/meta-exercises/${metaId}/versions/${versionId}`, { method: 'DELETE', headers: getAuthHeaders() });
  return handleResponse(response);
};

export const getNextMetaExerciseVersion = async (metaId: number): Promise<ExerciseVersion & { code?: string; name?: string }> => {
  const response = await fetch(`${API_URL}/api/meta-exercises/${metaId}/next-version`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const createExercise = async (domainId: number, exercise: ExerciseRequest): Promise<Exercise> => {
  const exerciseData = { ...exercise };
  const response = await fetch(`${API_URL}/api/domains/${domainId}/exercises`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(exerciseData),
  });
  
  return handleResponse(response);
};

export const getExercise = async (id: number): Promise<Exercise> => {
  const response = await fetch(`${API_URL}/api/exercises/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Utility functions for exercise updates
export const updateExercise = async (id: number, exerciseData: {
  name?: string;
  statement?: string;
  description?: string;
  notes?: string;
  hints?: string;
  difficulty?: number;
  verifiable?: boolean;
  result?: string;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: include weights
  xPosition?: number;
  yPosition?: number;
}): Promise<Exercise> => {
  const dataToSend = { ...exerciseData };
  const response = await fetch(`${API_URL}/api/exercises/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dataToSend),
  });
  
  const result = await handleResponse(response);
  
  // Ensure prerequisites are included as string codes - fallback if API doesn't return them
  if (result && !result.prerequisites && exerciseData.prerequisiteIds) {
    result.prerequisites = []; // Handled in calling code by converting IDs to codes
  }

  return result;
};

export const deleteExercise = async (id: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/exercises/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getExerciseByCode = async (code: string, opts?: { domainId?: number }): Promise<Exercise> => {
  const domainQuery = opts?.domainId ? `?domainId=${opts.domainId}` : '';
  const url = `${API_URL}/api/exercises/code/${encodeURIComponent(code)}${domainQuery}`;
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const verifyExerciseAnswer = async (id: number, answer: string): Promise<{ correct: boolean; message: string }> => {
  const response = await fetch(`${API_URL}/api/exercises/${id}/verify`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ answer }),
  });
  
  return handleResponse(response);
};

// Progress API
export const getDomainProgress = async (): Promise<any[]> => {
  const response = await fetch(`${API_URL}/api/progress/domains`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getDefinitionProgress = async (domainId: number): Promise<any[]> => {
  const response = await fetch(`${API_URL}/api/progress/domains/${domainId}/definitions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getExerciseProgress = async (domainId: number): Promise<any[]> => {
  const response = await fetch(`${API_URL}/api/progress/domains/${domainId}/exercises`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const reviewDefinition = async (definitionId: number, reviewRequest: ReviewRequest): Promise<any> => {
  const response = await fetch(`${API_URL}/api/progress/definitions/${definitionId}/review`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reviewRequest),
  });
  
  return handleResponse(response);
};

export const attemptExercise = async (exerciseId: number, attemptRequest: ExerciseAttemptRequest): Promise<any> => {
  const response = await fetch(`${API_URL}/api/progress/exercises/${exerciseId}/attempt`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(attemptRequest),
  });
  
  return handleResponse(response);
};

export const getDefinitionsForReview = async (domainId: number, limit?: number): Promise<Definition[]> => {
  const url = limit 
    ? `${API_URL}/api/progress/domains/${domainId}/review?limit=${limit}` 
    : `${API_URL}/api/progress/domains/${domainId}/review`;
    
  const response = await fetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Study Session API
export const startSession = async (domainId: number): Promise<any> => {
  const response = await fetch(`${API_URL}/api/sessions/start`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domainId }),
  });
  
  return handleResponse(response);
};

export const endSession = async (sessionId: number): Promise<any> => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/end`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getSessions = async (): Promise<any[]> => {
  const response = await fetch(`${API_URL}/api/sessions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getSessionDetails = async (sessionId: number): Promise<any> => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Graph API
export const getVisualGraph = async (domainId: number): Promise<VisualGraph> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/graph`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const updateGraphPositions = async (domainId: number, positions: Record<string, { x: number; y: number }>): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/graph/positions`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(positions),
  });
  
  return handleResponse(response);
};

export const exportDomain = async (domainId: number): Promise<GraphData> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/export`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const importDomain = async (domainId: number, graphData: GraphData): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/import`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphData),
  });
  
  return handleResponse(response);
};

// NEW: Import/Export API Functions

/**
 * Exports a domain as JSON data
 * @param domainId The ID of the domain to export
 * @returns Promise resolving to the export data
 */
export const exportDomainAsJson = async (domainId: number): Promise<DomainExportData> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/export-data`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

/**
 * Imports data into an existing domain
 * @param domainId The ID of the domain to import into
 * @param data The import data
 * @param opts Options for the import, including duplicate handling strategy
 * @returns Promise resolving when import is complete
 */
export const importToDomain = async (
  domainId: number,
  data: DomainExportData,
  opts?: { onDuplicate?: 'rename' | 'update' }
): Promise<void> => {
  const url = opts?.onDuplicate
    ? `${API_URL}/api/domains/${domainId}/import?onDuplicate=${opts.onDuplicate}`
    : `${API_URL}/api/domains/${domainId}/import`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return handleResponse(response);
};

/**
 * Creates a new domain with imported data
 * @param name Domain name
 * @param privacy Domain privacy setting
 * @param description Domain description
 * @param importData The data to import
 * @returns Promise resolving to the created domain
 */
export const createDomainWithImport = async (
  name: string, 
  privacy: 'public' | 'private', 
  description: string, 
  importData: DomainExportData
): Promise<Domain> => {
  const requestData: CreateDomainWithImportRequest = {
    name,
    privacy,
    description,
    importData,
  };

  const response = await fetch(`${API_URL}/api/domains`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  });
  
  return handleResponse(response);
};

// NEW: File Handling Utilities

/**
 * Downloads data as a JSON file
 * @param data The data to download
 * @param filename The name of the file (without extension)
 */
export const downloadJsonFile = (data: any, filename: string): void => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
};

/**
 * UPDATED: Enhanced JSON file upload with format standardization
 * @returns Promise resolving to the parsed and standardized JSON data
 */
export const uploadJsonFile = (): Promise<DomainExportData> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      
      if (!file.name.toLowerCase().endsWith('.json')) {
        reject(new Error('Please select a JSON file'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const rawData = JSON.parse(text);
          
          // Basic validation (accepts metaExercises or exercises)
          if (!rawData.definitions || ( !rawData.exercises && !rawData.metaExercises )) {
            reject(new Error('Invalid JSON format: missing definitions and either exercises or metaExercises'));
            return;
          }
          
          // STANDARDIZE THE DATA FORMAT
          const standardizedData: DomainExportData = {
            definitions: {},
            exercises: undefined,
            metaExercises: undefined,
          } as any;
          
          // Process definitions - ensure description is always an array and carry weights
          for (const [key, def] of Object.entries(rawData.definitions || {})) {
            const definition = def as any;
            let descriptions: string[] = [];
            
            if (Array.isArray(definition.description)) {
              descriptions = definition.description;
            } else if (typeof definition.description === 'string') {
              // Check if it contains the ||| delimiter
              if (definition.description.includes('|||')) {
                descriptions = definition.description.split('|||');
              } else {
                descriptions = [definition.description];
              }
            } else {
              descriptions = ['No description'];
            }
            
            const defWeights = (definition.prerequisiteWeights && typeof definition.prerequisiteWeights === 'object') ? definition.prerequisiteWeights as Record<string, number> : undefined;
            standardizedData.definitions[key] = {
              code: definition.code || key,
              name: definition.name || 'Unnamed',
              description: descriptions, // Always array
              notes: definition.notes || '',
              references: Array.isArray(definition.references) ? definition.references : [],
              prerequisites: Array.isArray(definition.prerequisites) ? definition.prerequisites : [],
              prerequisiteWeights: defWeights,
              xPosition: Number(definition.xPosition) || 0,
              yPosition: Number(definition.yPosition) || 0,
            };
          }
          
          if (rawData.metaExercises && typeof rawData.metaExercises === 'object') {
            // Prefer metaExercises if provided
            standardizedData.metaExercises = {};
            for (const [key, me] of Object.entries(rawData.metaExercises || {})) {
              const node = me as any;
              const vlist: any[] = Array.isArray(node.versions) ? node.versions : [];
              standardizedData.metaExercises[key] = {
                code: node.code || key,
                name: node.name || 'Unnamed',
                prerequisites: Array.isArray(node.prerequisites) ? node.prerequisites : [],
                prerequisiteWeights: (node.prerequisiteWeights && typeof node.prerequisiteWeights === 'object') ? node.prerequisiteWeights : undefined,
                xPosition: Number(node.xPosition) || 0,
                yPosition: Number(node.yPosition) || 0,
                versions: vlist.map((vv: any) => ({
                  statement: vv.statement || 'No statement',
                  description: vv.description || '',
                  hints: vv.hints || '',
                  verifiable: Boolean(vv.verifiable),
                  result: vv.result || '',
                  difficulty: typeof vv.difficulty === 'number' ? vv.difficulty : (parseInt(vv.difficulty, 10) || 3),
                  notes: vv.notes || '',
                }))
              };
            }
          } else {
            // Legacy flat exercises
            standardizedData.exercises = {};
            for (const [key, ex] of Object.entries(rawData.exercises || {})) {
              const exercise = ex as any;
              let difficulty: number = 3; // Default
              if (typeof exercise.difficulty === 'number') difficulty = exercise.difficulty; else if (typeof exercise.difficulty === 'string') { const parsed = parseInt(exercise.difficulty, 10); if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) difficulty = parsed; }
              const exWeights = (exercise.prerequisiteWeights && typeof exercise.prerequisiteWeights === 'object') ? exercise.prerequisiteWeights as Record<string, number> : undefined;
              (standardizedData.exercises as any)[key] = {
                code: exercise.code || key,
                name: exercise.name || 'Unnamed',
                statement: exercise.statement || 'No statement',
                description: exercise.description || '',
                hints: exercise.hints || '',
                difficulty,
                verifiable: Boolean(exercise.verifiable),
                result: exercise.result || '',
                prerequisites: Array.isArray(exercise.prerequisites) ? exercise.prerequisites : [],
                prerequisiteWeights: exWeights,
                xPosition: Number(exercise.xPosition) || 0,
                yPosition: Number(exercise.yPosition) || 0,
              };
            }
          }
          
          resolve(standardizedData);
        } catch (error) {
          reject(new Error('Invalid JSON file: ' + (error instanceof Error ? error.message : 'Unknown error')));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  });
};

/**
 * UPDATED: Enhanced validation with standardized format support
 * @param data The data to validate
 * @returns Object with isValid boolean and errors array
 */
export const validateImportData = (data: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { isValid: false, errors };
  }
  
  if (!data.definitions || typeof data.definitions !== 'object') {
    errors.push('Missing or invalid definitions object');
  }
  
  if ((!data.exercises || typeof data.exercises !== 'object') && (!data.metaExercises || typeof data.metaExercises !== 'object')) {
    errors.push('Missing exercises or metaExercises object');
  }
  
  // Validate definitions structure
  if (data.definitions) {
    for (const [key, def] of Object.entries(data.definitions)) {
      const definition = def as any;
      if (!definition.code || !definition.name) {
        errors.push(`Definition ${key} is missing required fields (code, name)`);
      }
      
      // Check description format - should be array in standardized format
      if (!definition.description) {
        errors.push(`Definition ${key} is missing description`);
      } else if (Array.isArray(definition.description)) {
        if (definition.description.length === 0) {
          errors.push(`Definition ${key} has empty description array`);
        }
      } else if (typeof definition.description === 'string') {
        if (!definition.description.trim()) {
          errors.push(`Definition ${key} has empty description string`);
        }
      } else {
        errors.push(`Definition ${key} has invalid description format`);
      }
      // Optional: validate prerequisiteWeights if present
      if (definition.prerequisiteWeights && typeof definition.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(definition.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Definition ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
    }
  }
  // Build known code sets for cross-reference
  const knownDefCodes = new Set<string>(Object.values<any>(data.definitions || {}).map((d: any) => d.code || ''));
  const knownMetaCodes = new Set<string>(Object.values<any>(data.metaExercises || {}).map((m: any) => m.code || ''));
  
  // Validate metaExercises or legacy exercises
  if (data.metaExercises) {
    for (const [key, node] of Object.entries<any>(data.metaExercises)) {
      if (!node.code || !node.name) {
        errors.push(`Meta-exercise ${key} is missing required fields (code, name)`);
      }
      if (!Array.isArray(node.versions) || node.versions.length === 0) {
        errors.push(`Meta-exercise ${key} has no versions`);
      }
      if (node.prerequisiteWeights && typeof node.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(node.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Meta-exercise ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
      // Cross-check prerequisite codes exist in definitions or metaExercises
      const pre: string[] = Array.isArray(node.prerequisites) ? node.prerequisites : [];
      pre.forEach((p) => {
        if (!knownDefCodes.has(p) && !knownMetaCodes.has(p)) {
          errors.push(`Meta-exercise ${key} references unknown prerequisite code: ${p}`);
        }
      });
    }
  } else if (data.exercises) {
    for (const [key, ex] of Object.entries(data.exercises)) {
      const exercise = ex as any;
      if (!exercise.code || !exercise.name || !exercise.statement) {
        errors.push(`Exercise ${key} is missing required fields (code, name, statement)`);
      }
      if (exercise.difficulty !== undefined) {
        const difficulty = typeof exercise.difficulty === 'number' ? exercise.difficulty : parseInt(exercise.difficulty, 10);
        if (isNaN(difficulty) || difficulty < 1 || difficulty > 7) {
          errors.push(`Exercise ${key} has invalid difficulty (must be 1-7)`);
        }
      }
      if (exercise.prerequisiteWeights && typeof exercise.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(exercise.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Exercise ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
      // Cross-check prerequisite codes exist in definitions (legacy shape only supports defs)
      const pre: string[] = Array.isArray((ex as any).prerequisites) ? (ex as any).prerequisites : [];
      pre.forEach((p) => {
        if (!knownDefCodes.has(p)) {
          errors.push(`Exercise ${key} references unknown prerequisite code: ${p}`);
        }
      });
    }
  }
  
  return { isValid: errors.length === 0, errors };
};

// Health check API
export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await fetch(`${API_URL}/health`);
  return handleResponse(response);
};

/**
 * Parses a description string that may contain multiple descriptions separated by '|||'
 * The backend stores descriptions as a single string, but the frontend can display
 * them as multiple alternatives.
 * 
 * @param description Description string potentially containing multiple parts
 * @returns An array of individual description strings
 */
export const parseDescriptions = (description: string): string[] => {
  if (description.includes('|||')) {
    return description.split('|||');
  }
  return [description];
};

/**
 * Fetches updated graph data from the backend
 * This is useful after making updates to ensure the UI reflects the current state
 * 
 * @param domainId The ID of the domain to refresh graph data for
 * @returns Promise resolving to the updated VisualGraph data
 */
export const refreshGraphData = async (domainId: number): Promise<VisualGraph> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/graph`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// DOMAIN NETWORK API

/**
 * Lists user-defined domain links, optionally filtered to certain domain IDs
 */
export const getDomainLinks = async (domainIds?: number[]): Promise<DomainLink[]> => {
  const params = domainIds && domainIds.length > 0 ? `?domainIds=${domainIds.join(',')}` : '';
  const response = await fetch(`${API_URL}/api/network/links${params}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Creates a user-defined link between two domains
 */
export const createDomainLink = async (domainId1: number, domainId2: number): Promise<DomainLink> => {
  const response = await fetch(`${API_URL}/api/network/links`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domainId1, domainId2 }),
  });
  return handleResponse(response);
};

/**
 * Deletes a user-defined link by ID
 */
export const deleteDomainLink = async (linkId: number): Promise<void> => {
  const response = await fetch(`${API_URL}/api/network/links/${linkId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};
