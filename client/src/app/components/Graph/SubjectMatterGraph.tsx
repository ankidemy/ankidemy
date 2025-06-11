"use client";

import React, { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/app/components/core/button";
import { Plus, Info } from 'lucide-react';

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 800, // fallback width
          height: rect.height || 400  // fallback height
        });
      }
    };

    // Initial measurement
    updateDimensions();

    // Use ResizeObserver for more accurate dimension tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Fallback with window resize
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  useEffect(() => {
    try {
      // Convert subject matters to graph data
      const nodes = subjectMatters.map(subject => ({
        id: subject.id,
        name: subject.name,
        nodeCount: subject.nodeCount || 0,
        exerciseCount: subject.exerciseCount || 0,
        val: Math.max(8, Math.min(25, 8 + (subject.nodeCount || 0) / 3))
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
              value: 1 / Math.log(nodes.length + 1)
            });
          }
        }
        
        // Add a few random connections for more interest
        const extraLinks = Math.min(Math.floor(nodes.length / 3), 5);
        for (let i = 0; i < extraLinks; i++) {
          const source = Math.floor(Math.random() * nodes.length);
          let target = Math.floor(Math.random() * nodes.length);
          while (target === source) {
            target = Math.floor(Math.random() * nodes.length);
          }
          links.push({
            source: nodes[source].id,
            target: nodes[target].id,
            value: 0.5
          });
        }
      }
      
      setGraphData({ nodes, links });
    } catch (err) {
      console.error("Error preparing graph data:", err);
      setError("Error visualizing domains. Please try again.");
    }
  }, [subjectMatters]);

  // Fit graph to view - with proper timing and dimension awareness
  const fitGraphToView = useCallback(() => {
    if (graphRef.current && graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      // Small delay to ensure everything is rendered
      setTimeout(() => {
        if (graphRef.current) {
          try {
            // Fit to view with proper padding
            const padding = Math.min(dimensions.width, dimensions.height) * 0.1; // 10% padding
            graphRef.current.zoomToFit(400, padding);
            
            console.log('Graph fitted to view with dimensions:', dimensions);
          } catch (error) {
            console.error('Error fitting graph to view:', error);
          }
        }
      }, 200);
    }
  }, [graphData.nodes.length, dimensions]);

  // Handle engine stop
  const handleEngineStop = useCallback(() => {
    fitGraphToView();
  }, [fitGraphToView]);

  // Fit graph when dimensions change
  useEffect(() => {
    if (graphData.nodes.length > 0) {
      fitGraphToView();
    }
  }, [dimensions, fitGraphToView, graphData.nodes.length]);

  // Custom node renderer with error handling
  const nodeCanvasObject = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    try {
      const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
      const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
      const name = node.name || 'Unknown';
      const nodeCount = node.nodeCount || 0;
      const exerciseCount = node.exerciseCount || 0;
      
      const fontSize = 14/globalScale;
      const isHovered = hoveredNode && hoveredNode.id === node.id;
      
      // Draw node background with gradient
      const baseSize = Math.max(6, Math.min(12, 6 + (nodeCount / 5)));
      const size = isHovered ? baseSize * 1.3 : baseSize;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, 'rgba(249, 115, 22, 0.8)');
      gradient.addColorStop(1, 'rgba(249, 115, 22, 0.4)');
      
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
      console.error("Error rendering node:", err);
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
      
      const isHovered = hoveredNode && 
        (hoveredNode.id === source || hoveredNode.id === target);
      
      return isHovered ? 'rgba(249, 115, 22, 0.6)' : 'rgba(249, 115, 22, 0.2)';
    } catch (err) {
      return 'rgba(249, 115, 22, 0.2)';
    }
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-red-500 max-w-md p-6 bg-white rounded-xl shadow-md">
          <h3 className="text-xl font-semibold mb-2">Error Loading Visualization</h3>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-gray-50 relative"
      style={{ minHeight: '300px' }} // Ensure minimum height
    >
      {/* Minimized info panel - only show when needed */}
      {subjectMatters.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">No Domains Yet</h3>
            <p className="text-gray-600 mb-4">Create your first knowledge domain to get started.</p>
            {onCreateSubjectMatter && (
              <Button 
                onClick={onCreateSubjectMatter}
                className="flex items-center justify-center"
              >
                <Plus size={16} className="mr-1" />
                Create Domain
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Small help button */}
      {subjectMatters.length > 0 && (
        <div className="absolute top-4 left-4 z-10">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="p-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-200"
            title="Help"
          >
            <Info size={16} className="text-gray-600" />
          </button>
          
          {showInfo && (
            <div className="absolute top-12 left-0 p-4 bg-white rounded-lg shadow-lg max-w-xs z-20">
              <p className="text-sm text-gray-600 mb-2">
                Click on a domain to explore its knowledge graph.
              </p>
              {onCreateSubjectMatter && (
                <Button 
                  onClick={onCreateSubjectMatter}
                  size="sm"
                  className="flex items-center w-full"
                >
                  <Plus size={14} className="mr-1" />
                  Create Domain
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-4 right-4 text-xs text-gray-500 bg-white p-2 rounded">
          {dimensions.width} x {dimensions.height}
        </div>
      )}
      
      {graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 ? (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          nodeId="id"
          nodeLabel="name"
          nodeVal="val"
          nodeCanvasObject={nodeCanvasObject}
          nodeRelSize={3}
          linkWidth={1}
          linkColor={getLinkColor}
          onNodeClick={(node) => {
            console.log('Node clicked:', node);
            if (node && node.id) {
              onSelectSubjectMatter(node.id.toString());
            }
          }}
          onNodeHover={setHoveredNode}
          cooldownTicks={100}
          cooldownTime={2000}
          onEngineStop={handleEngineStop}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.4}
          d3Force={(d3Force) => {
            d3Force('charge').strength(-300);
            d3Force('link').distance(80);
            d3Force('center', d3Force.forceCenter().strength(1));
          }}
          enableNodeDrag={true}
          enableZoomPanInteraction={true}
          minZoom={0.1}
          maxZoom={8}
        />
      ) : subjectMatters.length > 0 ? (
        <div className="h-full flex items-center justify-center">
          <p className="text-lg text-gray-500">Loading domains...</p>
        </div>
      ) : null}
    </div>
  );
};

export default SubjectMatterGraph;
