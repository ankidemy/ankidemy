// src/app/components/Graph/SubjectMatterGraph.tsx
"use client";

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

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
}

const SubjectMatterGraph: React.FC<SubjectMatterGraphProps> = ({ 
  subjectMatters, 
  onSelectSubjectMatter 
}) => {
  const graphRef = useRef<any>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<any>(null);

  useEffect(() => {
    // Convert subject matters to graph data
    const nodes = subjectMatters.map(subject => ({
      id: subject.id,
      name: subject.name,
      nodeCount: subject.nodeCount || 0,
      exerciseCount: subject.exerciseCount || 0,
      val: 20 // Base size for each subject node
    }));
    
    // Create minimal links between nodes to form a connected structure
    const links = [];
    if (nodes.length > 1) {
      for (let i = 1; i < nodes.length; i++) {
        links.push({
          source: nodes[0].id,
          target: nodes[i].id
        });
      }
    }
    
    setGraphData({ nodes, links });
  }, [subjectMatters]);

  // Zoom to fit when first rendered
  useEffect(() => {
    if (graphRef.current && graphData.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400);
      }, 500);
    }
  }, [graphData]);

  // Custom node renderer
  const nodeCanvasObject = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, nodeCount, exerciseCount, x, y } = node;
    const fontSize = 14/globalScale;
    const isHovered = hoveredNode && hoveredNode.id === id;
    
    // Draw node background
    ctx.beginPath();
    ctx.fillStyle = isHovered ? 'rgba(249, 115, 22, 0.8)' : 'rgba(249, 115, 22, 0.6)';
    ctx.arc(x, y, isHovered ? 18 : 15, 0, 2 * Math.PI, false);
    ctx.fill();

    // Draw node border
    ctx.strokeStyle = isHovered ? 'rgba(249, 115, 22, 1)' : 'rgba(249, 115, 22, 0.8)';
    ctx.lineWidth = isHovered ? 2/globalScale : 1.5/globalScale;
    ctx.stroke();
    
    // Draw node label
    ctx.fillStyle = 'white';
    ctx.font = `${isHovered ? fontSize + 1 : fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y);

    // Draw stats below the node
    if (isHovered && (nodeCount !== undefined || exerciseCount !== undefined)) {
      ctx.font = `${fontSize * 0.8}px Arial`;
      ctx.fillStyle = 'black';
      ctx.fillText(
        `${nodeCount || 0} definitions, ${exerciseCount || 0} exercises`, 
        x, 
        y + 25
      );
    }
  };

  return (
    <div className="w-full h-full bg-gray-50 relative">
      <div className="absolute top-4 left-4 z-10 p-4 bg-white rounded shadow-md max-w-md">
        <h2 className="text-xl font-bold mb-2 text-orange-500">Subject Matters</h2>
        <p className="text-gray-600 mb-4">
          Click on a subject matter node to explore its knowledge graph.
        </p>
      </div>
      
      {graphData.nodes.length > 0 ? (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          nodeLabel="name"
          nodeVal="val"
          nodeCanvasObject={nodeCanvasObject}
          nodeAutoColorBy="id"
          nodeRelSize={6}
          linkWidth={2}
          linkColor={() => "rgba(249, 115, 22, 0.2)"}
          onNodeClick={(node) => onSelectSubjectMatter(node.id)}
          onNodeHover={setHoveredNode}
          cooldownTicks={100}
          cooldownTime={2000}
        />
      ) : (
        <div className="h-full flex items-center justify-center">
          <p className="text-xl text-gray-500">No subject matters available. Create one using the "+" button.</p>
        </div>
      )}
    </div>
  );
};

export default SubjectMatterGraph;
