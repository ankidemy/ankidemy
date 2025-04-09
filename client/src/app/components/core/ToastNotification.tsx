// src/app/components/core/ToastNotification.tsx
"use client";

import React, { useState, useEffect, createContext, useContext } from 'react';
import { X } from 'lucide-react';

// Define toast types
type ToastType = 'success' | 'error' | 'info' | 'warning';

// Define toast message structure
interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

// Create context for global toast access
const ToastContext = createContext<{
  toasts: Toast[];
  addToast: (message: string, type: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});

// Export toast provider
export const ToastProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const addToast = (message: string, type: ToastType = 'info', duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast = { id, message, type, duration };
    
    setToasts((prevToasts) => [...prevToasts, newToast]);
  };
  
  const removeToast = (id: string) => {
    setToasts((prevToasts) => prevToasts.filter(toast => toast.id !== id));
  };
  
  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
};

// Custom hook to use toasts from any component
export const useToast = () => {
  return useContext(ToastContext);
};

// Helper function for easier toast creation
export const showToast = (message: string, type: ToastType = 'info', duration?: number) => {
  // Initialize an empty array for toasts if none exists
  if (typeof window !== 'undefined') {
    if (!window.__toastQueue) {
      window.__toastQueue = [];
    }
    
    // Add the toast to the queue
    window.__toastQueue.push({ message, type, duration });
    
    // Dispatch a custom event that the ToastContainer will listen for
    window.dispatchEvent(new CustomEvent('toast-add'));
  }
};

// Toast Container Component
export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Process queue when component mounts
  useEffect(() => {
    // Initialize if needed
    if (typeof window !== 'undefined' && !window.__toastQueue) {
      window.__toastQueue = [];
    }
    
    // Function to add toast from queue
    const processQueue = () => {
      if (typeof window !== 'undefined' && window.__toastQueue && window.__toastQueue.length > 0) {
        const { message, type, duration = 5000 } = window.__toastQueue.shift();
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts(prev => [...prev, { id, message, type, duration }]);
      }
    };
    
    // Listen for custom events
    window.addEventListener('toast-add', processQueue);
    
    // Initial process
    processQueue();
    
    // Cleanup
    return () => {
      window.removeEventListener('toast-add', processQueue);
    };
  }, []);
  
  // Remove toast after duration
  useEffect(() => {
    if (toasts.length > 0) {
      const timers = toasts.map(toast => {
        return setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, toast.duration);
      });
      
      return () => {
        timers.forEach(timer => clearTimeout(timer));
      };
    }
  }, [toasts]);
  
  // Manual remove toast function
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };
  
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <div 
          key={toast.id} 
          className={`rounded-md shadow-lg p-4 flex items-start animate-in slide-in-from-right duration-300 ${
            toast.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
            toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
            toast.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
            'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          <div className="flex-grow mr-2">
            <p>{toast.message}</p>
          </div>
          <button 
            onClick={() => removeToast(toast.id)}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

// Add type definition for the window object
declare global {
  interface Window {
    __toastQueue?: Array<{ message: string; type: ToastType; duration?: number }>;
  }
}
