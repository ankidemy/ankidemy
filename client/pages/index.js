import { useState, useEffect } from 'react';
import axios from 'axios';

export default function Home() {
  const [health, setHealth] = useState('Checking...');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    // Get the API URL from environment or use a default
    const url = process.env.NEXT_PUBLIC_API_URL || 'http://localhost';
    setApiUrl(url);
    
    console.log('Using API URL:', url);

    // Check server health
    axios.get(`${url}/health`)
      .then((response) => {
        console.log('Health check response:', response.data);
        setHealth('Server is running');
        // If server is healthy, fetch items
        return axios.get(`${url}/api/items`);
      })
      .then((response) => {
        console.log('Items response:', response.data);
        setItems(response.data);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error:', error);
        setHealth('Server is not responding: ' + (error.message || 'Unknown error'));
        setLoading(false);
      });
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">My App</h1>
      
      <div className="bg-gray-100 p-4 rounded mb-6">
        <h2 className="text-xl font-semibold mb-2">Server Status</h2>
        <p className={health.includes('running') ? 'text-green-600' : 'text-red-600'}>
          {health}
        </p>
        <p className="text-sm text-gray-600 mt-2">API URL: {apiUrl}</p>
      </div>

      <div className="bg-white shadow rounded p-4">
        <h2 className="text-xl font-semibold mb-4">Items</h2>
        
        {loading ? (
          <p>Loading items...</p>
        ) : items.length > 0 ? (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.ID} className="py-3">
                <h3 className="font-medium">{item.name}</h3>
                <p className="text-gray-600">{item.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No items found. Add some through the API!</p>
        )}
      </div>
    </div>
  );
}
