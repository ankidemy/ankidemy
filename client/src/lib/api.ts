// client/src/lib/api.ts
// Complete API client for Ankidemy with support for all backend features

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
}

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
}

export interface DefinitionRequest {
  code: string;
  name: string;
  description: string;
  notes?: string;
  references?: string[];
  prerequisiteIds?: number[];
  domainId: number;
  xPosition?: number;
  yPosition?: number;
}

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
    xPosition?: number;
    yPosition?: number;
    domainId?: number;
  }>;
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

// Authentication API
export const loginUser = async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
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
  const response = await fetch(`${API_URL}/api/domains/public`);
  return handleResponse(response);
};

export const getAllDomains = async (): Promise<Domain[]> => {
  const response = await fetch(`${API_URL}/api/domains`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getMyDomains = async (): Promise<Domain[]> => {
  const response = await fetch(`${API_URL}/api/domains/my`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getEnrolledDomains = async (): Promise<Domain[]> => {
  const response = await fetch(`${API_URL}/api/domains/enrolled`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
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
  
  return handleResponse(response);
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
  
  return handleResponse(response);
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
