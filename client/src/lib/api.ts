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
