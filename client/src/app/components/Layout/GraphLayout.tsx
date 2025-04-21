// src/app/components/Layout/GraphLayout.tsx
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from "@/app/components/core/button";
import { Menu, X, LogOut, Settings, Plus } from 'lucide-react';

interface GraphLayoutProps {
  children: React.ReactNode;
}

const GraphLayout: React.FC<GraphLayoutProps> = ({ children }) => {
  // State for panel visibility
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightMenu, setShowRightMenu] = useState(false);
  
  // Mock data for subject matters (will be fetched from API in production)
  const [subjectMatters, setSubjectMatters] = useState([
    { id: 'algebra', name: 'Algebra' },
    { id: 'calculus', name: 'Calculus' },
    { id: 'geometry', name: 'Geometry' }
  ]);
  
  // Selected subject matter
  const [selectedSubjectMatter, setSelectedSubjectMatter] = useState<string | null>(null);
  
  // Handle subject matter selection
  const handleSelectSubjectMatter = (id: string) => {
    setSelectedSubjectMatter(id);
    // On mobile, close the panel after selection
    if (window.innerWidth < 768) {
      setShowLeftPanel(false);
    }
  };
  
  // Handle adding new subject matter
  const handleAddSubjectMatter = () => {
    // In production, this would open a modal or navigate to a form
    const newId = `subject-${Date.now()}`;
    const newName = prompt("Enter name for new subject matter:");
    
    if (newName) {
      setSubjectMatters([...subjectMatters, { id: newId, name: newName }]);
      setSelectedSubjectMatter(newId);
    }
  };
  
  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Top Navigation Bar */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left Side - Toggle Button */}
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowLeftPanel(!showLeftPanel)} 
                  aria-label="Toggle subject menu"
                >
                  {showLeftPanel ? <X size={20} /> : <Menu size={20} />}
                </Button>
                <span className="ml-3 text-xl font-bold text-gray-900">Ankidemy</span>
              </div>
            </div>
            
            {/* Right Side - User Menu */}
            <div className="flex items-center">
              <div className="relative">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowRightMenu(!showRightMenu)} 
                  aria-label="User menu"
                >
                  <Menu size={20} />
                </Button>
                
                {/* Dropdown Menu */}
                {showRightMenu && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link href="/settings" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        <Settings size={16} className="mr-2" />
                        Settings
                      </Link>
                      <Link href="/logout" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        <LogOut size={16} className="mr-2" />
                        Logout
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Subject Matter Navigation */}
        <div 
          className={`bg-white shadow-md transition-all duration-300 ${
            showLeftPanel ? 'w-64' : 'w-0'
          } overflow-hidden`}
        >
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Subject Matters</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleAddSubjectMatter}
              >
                <Plus size={18} />
              </Button>
            </div>
            
            <div className="space-y-2">
              {subjectMatters.map((subject) => (
                <Button
                  key={subject.id}
                  variant={selectedSubjectMatter === subject.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => handleSelectSubjectMatter(subject.id)}
                >
                  {subject.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Main Content - Graph Canvas */}
        <main className="flex-1 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

export default GraphLayout;
