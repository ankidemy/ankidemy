// src/app/components/Graph/SubjectMatterGraph.tsx
"use client";

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/app/components/core/button";
import { Plus } from 'lucide-react';

// Import ForceGraph dynamically to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

interface SubjectMatter {
  id: string;
  name: string;
  nodeCount?: number;
  exerciseCount?: number;
}

interface SubjectMatterGraphProps {
  subjectMatters: SubjectMatter[];
  onSelectSubjectMatter: (id: string) => void;
  onCreateSubjectMatter?: () => void;
}

const SubjectMatterGraph: React.FC<SubjectMatterGraphProps> = ({ 
  subjectMatters, 
  onSelectSubjectMatter,
  onCreateSubjectMatter
}) => {
  const graphRef = useRef<any>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Convert subject matters to graph data
      const nodes = subjectMatters.map(subject => ({
        id: subject.id,
        name: subject.name,
        nodeCount: subject.nodeCount || 0,
        exerciseCount: subject.exerciseCount || 0,
        val: 20 + (subject.nodeCount || 0) / 5 // Size based on definition count
      }));
      
      // Create minimal links between nodes to form an interesting structure
      const links = [];
      if (nodes.length > 1) {
        // Create a star-like structure for most domains
        const centerIndex = Math.floor(Math.random() * nodes.length);
        
        for (let i = 0; i < nodes.length; i++) {
          if (i !== centerIndex) {
            links.push({
              source: nodes[centerIndex].id,
              target: nodes[i].id,
              // Make link strength weaker for larger graphs to spread out more
              value: 1 / Math.log(nodes.length + 1)
            });
          }
        }
        
        // Add a few random connections for more interest
        const extraLinks = Math.min(Math.floor(nodes.length / 3), 5);
        for (let i = 0; i < extraLinks; i++) {
          const source = Math.floor(Math.random() * nodes.length);
          let target = Math.floor(Math.random() * nodes.length);
          // Ensure no self-links
          while (target === source) {
            target = Math.floor(Math.random() * nodes.length);
          }
          links.push({
            source: nodes[source].id,
            target: nodes[target].id,
            value: 0.5 // Weaker links for these random connections
          });
        }
      }
      
      setGraphData({ nodes, links });
    } catch (err) {
      console.error("Error preparing graph data:", err);
      setError("Error visualizing domains. Please try again.");
    }
  }, [subjectMatters]);

  // Zoom to fit when first rendered
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400);
      }, 500);
    }
  }, [graphData]);

  // Custom node renderer with error handling
  const nodeCanvasObject = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    try {
      // Validate coordinates to prevent non-finite values
      const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
      const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
      const name = node.name || 'Unknown';
      const nodeCount = node.nodeCount || 0;
      const exerciseCount = node.exerciseCount || 0;
      
      const fontSize = 14/globalScale;
      const isHovered = hoveredNode && hoveredNode.id === node.id;
      
      // Draw node background with gradient
      const size = isHovered ? 18 : 15;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, 'rgba(249, 115, 22, 0.8)'); // Orange core
      gradient.addColorStop(1, 'rgba(249, 115, 22, 0.4)'); // Faded edge
      
      ctx.beginPath();
      ctx.fillStyle = gradient;
      ctx.arc(x, y, size, 0, 2 * Math.PI, false);
      ctx.fill();

      // Draw node border
      ctx.strokeStyle = isHovered ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.6)';
      ctx.lineWidth = isHovered ? 2/globalScale : 1.5/globalScale;
      ctx.stroke();
      
      // Draw node label with shadow for better visibility
      ctx.font = `${isHovered ? fontSize + 1 : fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Add shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillText(name, x + 1, y + 1);
      
      // Draw actual text
      ctx.fillStyle = 'white';
      ctx.fillText(name, x, y);

      // Draw stats below the node if hovered
      if (isHovered) {
        ctx.font = `${fontSize * 0.8}px sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(
          `${nodeCount} definitions, ${exerciseCount} exercises`, 
          x, 
          y + 25
        );
        ctx.shadowColor = 'transparent';
      }
    } catch (err) {
      // Fallback rendering if an error occurs
      console.error("Error rendering node:", err);
      
      // Use safe values for coordinates
      const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
      const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
      
      ctx.beginPath();
      ctx.fillStyle = 'rgba(249, 115, 22, 0.6)';
      ctx.arc(x, y, 10, 0, 2 * Math.PI);
      ctx.fill();
    }
  };
  
  // Link styling with safety checks
  const getLinkColor = (link: any) => {
    try {
      const source = typeof link.source === 'object' ? link.source.id : link.source;
      const target = typeof link.target === 'object' ? link.target.id : link.target;
      
      const sourceNode = graphData.nodes.find(n => n.id === source);
      const targetNode = graphData.nodes.find(n => n.id === target);
      
      const isHovered = hoveredNode && 
        (hoveredNode.id === source || hoveredNode.id === target);
      
      return isHovered ? 'rgba(249, 115, 22, 0.6)' : 'rgba(249, 115, 22, 0.2)';
    } catch (err) {
      return 'rgba(249, 115, 22, 0.2)'; // Default color on error
    }
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-red-500 max-w-md p-6 bg-white rounded shadow-md">
          <h3 className="text-xl font-semibold mb-2">Error Loading Visualization</h3>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-50 relative">
      <div className="absolute top-4 left-4 z-10 p-4 bg-white rounded shadow-md max-w-md">
        <h2 className="text-xl font-bold mb-2 text-orange-500">Knowledge Domains</h2>
        <p className="text-gray-600 mb-4">
          Click on a knowledge domain to explore its graph. 
          {subjectMatters.length === 0 && " You haven't created any domains yet."}
        </p>
        
        {onCreateSubjectMatter && (
          <Button 
            onClick={onCreateSubjectMatter}
            className="flex items-center"
          >
            <Plus size={16} className="mr-1" />
            Create Domain
          </Button>
        )}
      </div>
      
      {graphData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          nodeLabel="name"
          nodeVal="val"
          nodeCanvasObject={nodeCanvasObject}
          nodeRelSize={6}
          linkWidth={2}
          linkColor={getLinkColor}
          onNodeClick={(node) => {
            if (node && node.id) {
              onSelectSubjectMatter(node.id)
            }
          }}
          onNodeHover={setHoveredNode}
          cooldownTicks={100}
          cooldownTime={2000}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          // Make nodes repel each other more for better spacing
          d3Force={(d3Force) => {
            d3Force('charge').strength(-200);
            d3Force('link').distance(100);
          }}
        />
      ) : (
        <div className="h-full flex items-center justify-center">
          <p className="text-xl text-gray-500">
            {subjectMatters.length === 0 
              ? "No knowledge domains available. Create one to get started." 
              : "Loading domains..."}
          </p>
        </div>
      )}
    </div>
  );
};

export default SubjectMatterGraph;
