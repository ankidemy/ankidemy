"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/app/components/core/card";
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import * as api from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const [currentUser, setCurrentUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    lastName: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
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
          username: userData.username || '',
          email: userData.email || '',
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching user:', err);
        setError(`Failed to fetch user: ${err.message}`);
        setLoading(false);
        // Redirect to login if not authenticated
        router.push('/login');
      }
    };
    
    fetchCurrentUser();
  }, [router]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setActionStatus('Updating profile...');
    
    try {
      // Only include basic profile data (not password)
      const updateData = {
        username: formData.username,
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName
      };
      
      const updatedUser = await api.updateCurrentUser(updateData);
      setCurrentUser(updatedUser);
      setActionStatus('Profile updated successfully');
    } catch (err) {
      console.error('Error updating profile:', err);
      setActionStatus(`Failed to update profile: ${err.message}`);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    
    // Validate passwords
    if (formData.newPassword !== formData.confirmPassword) {
      setActionStatus('New passwords do not match');
      return;
    }
    
    if (!formData.currentPassword) {
      setActionStatus('Current password is required');
      return;
    }
    
    if (formData.newPassword.length < 8) {
      setActionStatus('New password must be at least 8 characters long');
      return;
    }
    
    setActionStatus('Changing password...');
    
    try {
      // Call password change API (assuming it exists)
      await api.updateCurrentUser({
        password: formData.newPassword,
        currentPassword: formData.currentPassword
      });
      
      setActionStatus('Password changed successfully');
      
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (err) {
      console.error('Error changing password:', err);
      setActionStatus(`Failed to change password: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl mt-20">
        <div className="text-center py-10">
          <div className="text-lg">Loading profile information...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl mt-20">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">My Profile</h1>
        <Button 
          variant="ghost" 
          className="flex items-center gap-2"
          onClick={() => router.push('/dashboard')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6"></path>
          </svg>
          Back to Dashboard
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User info card */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center mb-4">
              <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mb-2">
                <span className="text-3xl font-bold text-orange-500">
                  {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <h2 className="text-xl font-semibold">{currentUser?.username || 'User'}</h2>
              <p className="text-gray-500">{currentUser?.email || 'No email'}</p>
            </div>
            
            <div className="space-y-2 border-t pt-4">
              <div>
                <span className="font-semibold">Member since:</span>{' '}
                {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString() : 'N/A'}
              </div>
              <div>
                <span className="font-semibold">Level:</span>{' '}
                {currentUser?.level || 'Beginner'}
              </div>
              <div>
                <span className="font-semibold">Status:</span>{' '}
                <span className={`px-2 py-0.5 rounded text-xs ${
                  currentUser?.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {currentUser?.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {currentUser?.isAdmin && (
                <div>
                  <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800">
                    Administrator
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit profile form */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Username</label>
                  <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                    {currentUser?.username || 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                    {currentUser?.email || 'N/A'}
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">First Name</label>
                  <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                    {currentUser?.firstName || 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Last Name</label>
                  <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
                    {currentUser?.lastName || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Change password card */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Current Password</label>
                  <Input
                    name="currentPassword"
                    type="password"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">New Password</label>
                  <Input
                    name="newPassword"
                    type="password"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                  <Input
                    name="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              
              <Button type="submit" variant="outline" className="mt-2">
                Change Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      
      {actionStatus && (
        <div className={`mt-6 p-4 rounded-md ${
          actionStatus.includes('success') 
            ? 'bg-green-100 text-green-800 border border-green-200' 
            : 'bg-orange-100 text-orange-800 border border-orange-200'
        }`}>
          {actionStatus}
        </div>
      )}
    </div>
  );
}
