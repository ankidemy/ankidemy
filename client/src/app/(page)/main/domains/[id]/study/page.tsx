// src/app/(page)/main/domains/[id]/study/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import KnowledgeGraph from '@/app/components/Graph/KnowledgeGraph';
import { exportDomain, updateGraphPositions, GraphData } from '@/lib/api';

// Add correct typing for params
interface StudyPageProps {
  params: {
    id: string;
  };
}

export default function StudyPage({ params }: StudyPageProps) {
  const router = useRouter();
  // Unwrap params to access the id safely
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Safely parse the domain ID
        const domainId = parseInt(id);
        if (isNaN(domainId)) {
          throw new Error('Invalid domain ID');
        }
        
        // Fetch domain data
        const data = await exportDomain(domainId);
        setGraphData(data);
      } catch (error) {
        console.error('Error fetching graph data:', error);
        setError('Failed to load domain data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id]);

  const handleBack = () => {
    router.push('/dashboard');
  };

  const handlePositionUpdate = async (positions: Record<string, { x: number; y: number }>) => {
    try {
      const domainId = parseInt(id);
      if (!isNaN(domainId) && positions && Object.keys(positions).length > 0) {
        await updateGraphPositions(domainId, positions);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating positions:', error);
      return false;
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading domain graph...</p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="max-w-md p-6 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error Loading Domain</h2>
          <p className="text-gray-700 mb-4">{error || 'Could not load domain data.'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Note: We don't need to wrap the KnowledgeGraph with MathJaxProvider here
  // because KnowledgeGraph already has its own MathJaxProvider
  return (
    <div className="h-screen">
      <KnowledgeGraph
        graphData={graphData}
        subjectMatterId={id}
        onBack={handleBack}
        onPositionUpdate={handlePositionUpdate}
      />
    </div>
  );
}
