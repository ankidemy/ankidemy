// client/src/lib/api.ts
// Updated to point directly to the server port instead of through nginx
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const fetchItems = async () => {
  const response = await fetch(`${API_URL}/api/items`);
  if (!response.ok) {
    throw new Error('Failed to fetch items');
  }
  return response.json();
};

export const createItem = async (itemData: { name: string; description: string }) => {
    const response = await fetch(`${API_URL}/api/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify(itemData),
    });
    
    if (!response.ok) {
        throw new Error('Failed to create item');
    }
    
    return response.json();
};

export const checkHealth = async () => {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) {
    throw new Error('Server is not responding');
  }
  return response.json();
};

export const loginUser = async (credentials: { email: string; password: string }) => {
  const response = await fetch(`${API_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  
  return response.json();
};

type UserRegistrationDetails = {
  id: string;
  name: string;
  email: string;
  password: string;
};

export const registerUser = async (userDetails: UserRegistrationDetails) => {
  const response = await fetch(`${API_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userDetails),
  });

  if (!response.ok) {
    // Handle HTTP errors
    const errorDetails = await response.json();
    throw new Error(errorDetails.message || 'Failed to register user.');
  }

  return response.json();
};
