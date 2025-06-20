// FILE: src/lib/api.ts
// Complete API client for Ankidemy with standardized import/export handling

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

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
  difficulty?: string;
  xPosition?: number;
  yPosition?: number;
  createdAt: string;
  updatedAt: string;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>; // ADDED: weights for each prerequisite
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
  difficulty?: string;
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
    difficulty?: string;
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
      xPosition?: number;
      yPosition?: number;
    };
  };
  exercises: {
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
      xPosition?: number;
      yPosition?: number;
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
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
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
    
    console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
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
  
  return handleResponse(response);
};

export const updateCurrentUser = async (userData: {
  username?: string;
  email?: string;
  password?: string;
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

export const getDefinitionByCode = async (code: string): Promise<Definition> => {
  const response = await fetch(`${API_URL}/api/definitions/code/${code}`, {
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

export const createExercise = async (domainId: number, exercise: ExerciseRequest): Promise<Exercise> => {
  // Convert difficulty from string to number for API compatibility
  const exerciseData = {
    ...exercise,
    difficulty: exercise.difficulty ? parseInt(exercise.difficulty, 10) : undefined
  };
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
  difficulty?: string;
  verifiable?: boolean;
  result?: string;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: include weights
  xPosition?: number;
  yPosition?: number;
}): Promise<Exercise> => {
  // Convert difficulty from string to number for API compatibility
  const dataToSend = {
    ...exerciseData,
    difficulty: exerciseData.difficulty ? parseInt(exerciseData.difficulty, 10) : undefined
  };
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

export const getExerciseByCode = async (code: string): Promise<Exercise> => {
  const response = await fetch(`${API_URL}/api/exercises/code/${code}`, {
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
  const response = await fetch(`${API_URL}/api/domains/${domainId}/export`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

/**
 * Imports data into an existing domain
 * @param domainId The ID of the domain to import into
 * @param data The import data
 * @returns Promise resolving when import is complete
 */
export const importToDomain = async (domainId: number, data: DomainExportData): Promise<void> => {
  const response = await fetch(`${API_URL}/api/domains/${domainId}/import`, {
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
          
          // Basic validation
          if (!rawData.definitions || !rawData.exercises) {
            reject(new Error('Invalid JSON format: missing definitions or exercises'));
            return;
          }
          
          // STANDARDIZE THE DATA FORMAT
          const standardizedData: DomainExportData = {
            definitions: {},
            exercises: {}
          };
          
          // Process definitions - ensure description is always an array
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
            
            standardizedData.definitions[key] = {
              code: definition.code || key,
              name: definition.name || 'Unnamed',
              description: descriptions, // Always array
              notes: definition.notes || '',
              references: Array.isArray(definition.references) ? definition.references : [],
              prerequisites: Array.isArray(definition.prerequisites) ? definition.prerequisites : [],
              xPosition: Number(definition.xPosition) || 0,
              yPosition: Number(definition.yPosition) || 0,
            };
          }
          
          // Process exercises - ensure difficulty is a number
          for (const [key, ex] of Object.entries(rawData.exercises || {})) {
            const exercise = ex as any;
            let difficulty: number = 3; // Default
            
            if (typeof exercise.difficulty === 'number') {
              difficulty = exercise.difficulty;
            } else if (typeof exercise.difficulty === 'string') {
              const parsed = parseInt(exercise.difficulty, 10);
              if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) {
                difficulty = parsed;
              }
            }
            
            standardizedData.exercises[key] = {
              code: exercise.code || key,
              name: exercise.name || 'Unnamed',
              statement: exercise.statement || 'No statement',
              description: exercise.description || '',
              hints: exercise.hints || '',
              difficulty: difficulty, // Always number
              verifiable: Boolean(exercise.verifiable),
              result: exercise.result || '',
              prerequisites: Array.isArray(exercise.prerequisites) ? exercise.prerequisites : [],
              xPosition: Number(exercise.xPosition) || 0,
              yPosition: Number(exercise.yPosition) || 0,
            };
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
  
  if (!data.exercises || typeof data.exercises !== 'object') {
    errors.push('Missing or invalid exercises object');
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
    }
  }
  
  // Validate exercises structure
  if (data.exercises) {
    for (const [key, ex] of Object.entries(data.exercises)) {
      const exercise = ex as any;
      if (!exercise.code || !exercise.name || !exercise.statement) {
        errors.push(`Exercise ${key} is missing required fields (code, name, statement)`);
      }
      
      // Validate difficulty if present
      if (exercise.difficulty !== undefined) {
        const difficulty = typeof exercise.difficulty === 'number' ? 
          exercise.difficulty : 
          parseInt(exercise.difficulty, 10);
        
        if (isNaN(difficulty) || difficulty < 1 || difficulty > 7) {
          errors.push(`Exercise ${key} has invalid difficulty (must be 1-7)`);
        }
      }
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
