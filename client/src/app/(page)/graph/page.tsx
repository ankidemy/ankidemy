// src/app/(page)/graph/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MathJaxContext } from 'better-react-mathjax';
import GraphLayout from '@/app/components/Layout/GraphLayout';
import SubjectMatterGraph from '@/app/components/Graph/SubjectMatterGraph';
import KnowledgeGraph from '@/app/components/Graph/KnowledgeGraph';
import { 
  getMyDomains, 
  getEnrolledDomains, 
  getPublicDomains,
  exportDomain,
  updateGraphPositions,
  Domain
} from '@/lib/api';

// MathJax configuration
const config = {
  loader: { load: ["input/tex", "output/svg"] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
  }
};

export default function GraphPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Get domain ID from URL if present
  const domainIdParam = searchParams.get('domainId');
  
  // State to track selected subject matter
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(domainIdParam);
  const [domains, setDomains] = useState<Domain[]>([]);
  
  // State to hold the current graph data
  const [graphData, setGraphData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch domains on component mount
  useEffect(() => {
    const fetchDomains = async () => {
      try {
        // Get all available domains
        const myDomains = await getMyDomains();
        const enrolledDomains = await getEnrolledDomains();
        const publicDomains = await getPublicDomains();
        
        // Combine and remove duplicates
        const combinedDomains = [...myDomains];
        
        // Add enrolled domains that aren't already in the list
        enrolledDomains.forEach(domain => {
          if (!combinedDomains.some(d => d.id === domain.id)) {
            combinedDomains.push(domain);
          }
        });
        
        // Add public domains that aren't already in the list
        publicDomains.forEach(domain => {
          if (!combinedDomains.some(d => d.id === domain.id)) {
            combinedDomains.push(domain);
          }
        });
        
        setDomains(combinedDomains);
      } catch (err: any) {
        console.error("Error fetching domains:", err);
        setError("Failed to load domains. Please check your connection and try again.");
      } finally {
        // If we're not loading a specific domain, we can stop loading here
        if (!selectedDomainId) {
          setIsLoading(false);
        }
      }
    };
    
    fetchDomains();
  }, []);

  // Load graph data when a domain is selected
  useEffect(() => {
    if (selectedDomainId) {
      const fetchGraphData = async () => {
        setIsLoading(true);
        
        try {
          // Fetch the domain data using the API
          const data = await exportDomain(parseInt(selectedDomainId));
          setGraphData(data);
          
          // Update URL with selected domain ID
          const url = new URL(window.location.href);
          url.searchParams.set('domainId', selectedDomainId);
          window.history.pushState({}, '', url);
        } catch (err: any) {
          console.error("Error fetching graph data:", err);
          setError("Failed to load graph data. Please try again.");
        } finally {
          setIsLoading(false);
        }
      };
      
      fetchGraphData();
    } else {
      setGraphData(null);
      setIsLoading(false);
      
      // Remove domainId from URL
      const url = new URL(window.location.href);
      url.searchParams.delete('domainId');
      window.history.pushState({}, '', url);
    }
  }, [selectedDomainId]);
  
  // Handle domain selection
  const handleSelectDomain = (id: string) => {
    setSelectedDomainId(id);
  };
  
  // Handle going back to domain selection
  const handleBack = () => {
    setSelectedDomainId(null);
    setGraphData(null);
  };
  
  // Handle position updates from the graph
  const handlePositionUpdate = async (positions: Record<string, { x: number; y: number }>) => {
    if (!selectedDomainId) return;
    
    try {
      await updateGraphPositions(parseInt(selectedDomainId), positions);
    } catch (err: any) {
      console.error("Error updating positions:", err);
      // Don't show an error to the user, just log it
    }
  };
  
  // Convert domains to the format expected by SubjectMatterGraph
  const subjectMatters = domains.map(domain => ({
    id: domain.id.toString(),
    name: domain.name,
    // Estimate node count and exercise count if we don't have the actual data
    nodeCount: domain.definitions?.length || 0,
    exerciseCount: domain.exercises?.length || 0
  }));
  
  // Get selected domain details
  const selectedDomain = domains.find(d => d.id.toString() === selectedDomainId);
  
  return (
    <MathJaxContext config={config}>
      <GraphLayout>
        <div className="h-full w-full flex flex-col">
          {error && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-red-500 text-xl p-8 bg-white rounded shadow-md">
                {error}
                <button
                  onClick={() => window.location.reload()}
                  className="block mt-4 px-4 py-2 bg-blue-500 text-white rounded"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          {!error && selectedDomainId ? (
            isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xl text-gray-500">Loading {selectedDomain?.name || selectedDomainId} graph...</p>
              </div>
            ) : (
              <div className="flex-1">
                {graphData && (
                  <KnowledgeGraph 
                    graphData={graphData} 
                    subjectMatterId={selectedDomain?.name || selectedDomainId}
                    onBack={handleBack}
                    onPositionUpdate={handlePositionUpdate}
                  />
                )}
              </div>
            )
          ) : (
            <div className="flex-1">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xl text-gray-500">Loading domains...</p>
                </div>
              ) : (
                <SubjectMatterGraph 
                  subjectMatters={subjectMatters}
                  onSelectSubjectMatter={handleSelectDomain}
                />
              )}
            </div>
          )}
        </div>
      </GraphLayout>
    </MathJaxContext>
  );
}
