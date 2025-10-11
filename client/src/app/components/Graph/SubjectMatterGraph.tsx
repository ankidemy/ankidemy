"use client";

import React, { useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/app/components/core/button";
import { Plus, Info } from 'lucide-react';
import { getEnrolledDomains } from '@/lib/api';

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
  onSelectSubjectMatter: (id: string) => void;
  onCreateSubjectMatter?: () => void;
}

const SubjectMatterGraph: React.FC<SubjectMatterGraphProps> = ({ 
  onSelectSubjectMatter,
  onCreateSubjectMatter
}) => {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Subject matters and derived graph data (no effects)
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1100, height: 400 });
  const [subjectMatters, setSubjectMatters] = useState<SubjectMatter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasBeenFitted, setHasBeenFitted] = useState(false);
  const graphData = useMemo(() => {
    try {
      const nodes = subjectMatters.map(subject => ({
        id: subject.id,
        name: subject.name,
        nodeCount: subject.nodeCount || 0,
        exerciseCount: subject.exerciseCount || 0,
        val: Math.max(8, Math.min(25, 8 + (subject.nodeCount || 0) / 3))
      }));

      const links: { source: string; target: string; value: number }[] = [];
      if (nodes.length > 1) {
        const centerIndex = Math.floor(Math.random() * nodes.length);
        for (let i = 0; i < nodes.length; i++) {
          if (i !== centerIndex) {
            links.push({ source: nodes[centerIndex].id, target: nodes[i].id, value: 1 / Math.log(nodes.length + 1) });
          }
        }
        const extraLinks = Math.min(Math.floor(nodes.length / 3), 5);
        for (let i = 0; i < extraLinks; i++) {
          const source = Math.floor(Math.random() * nodes.length);
          let target = Math.floor(Math.random() * nodes.length);
          while (target === source) target = Math.floor(Math.random() * nodes.length);
          links.push({ source: nodes[source].id, target: nodes[target].id, value: 0.5 });
        }
      }

      return { nodes, links };
    } catch (err) {
      console.error('Error preparing graph data:', err);
      setError('Error visualizing domains. Please try again.');
      return { nodes: [], links: [] };
    }
  }, [subjectMatters]);

  // Fit graph to view - only on first render
  const fitGraphToView = useCallback(() => {
    if (!graphRef.current || hasBeenFitted) return;
    if (graphData.nodes.length === 0) return;
    if (dimensions.width <= 0 || dimensions.height <= 0) return;
    setTimeout(() => {
      try {
        if (!graphRef.current || hasBeenFitted) return;
        graphRef.current.zoom(2, 500);
        graphRef.current.centerAt(0, 0, 500);
        setHasBeenFitted(true);
        console.log('Graph positioned with zoom 2');
      } catch (error) {
        console.error('Error positioning graph:', error);
      }
    }, 100);
  }, [graphData.nodes.length, dimensions.width, dimensions.height, hasBeenFitted]);

  // Handle engine stop
  const handleEngineStop = useCallback(() => {
    fitGraphToView();
  }, [fitGraphToView]);

  // Lifecycle to replace effects: fetch domains, track size, and initial fit
  class SMGraphLifecycle {
    private fetched = false;
    private attachedEl: HTMLElement | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private resizeHandler = () => this.measure();
    private fitScheduled = false;

    async ensureData() {
      if (this.fetched) return;
      this.fetched = true;
      try {
        setIsLoading(true);
        const domains = await getEnrolledDomains();
        const mapped = domains.map((domain: any) => ({
          id: String(domain.id),
          name: domain.name,
          nodeCount: domain.nodeCount || 0,
          exerciseCount: domain.exerciseCount || 0,
        }));
        setSubjectMatters(mapped);
      } catch (err) {
        console.error('Error fetching domains:', err);
        setError('Error loading domains. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    attachResize(el: HTMLElement | null) {
      if (!el || this.attachedEl === el) return;
      this.detachResize();
      this.attachedEl = el;
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(el);
      window.addEventListener('resize', this.resizeHandler);
      this.measure();
    }

    private measure() {
      if (!this.attachedEl) return;
      const rect = this.attachedEl.getBoundingClientRect();
      setDimensions({ width: rect.width || 800, height: rect.height || 400 });
      if (!this.fitScheduled) {
        this.fitScheduled = true;
        setTimeout(() => {
          this.fitScheduled = false;
          fitGraphToView();
          if (graphRef.current) {
            try {
              graphRef.current.resumeAnimation();
              graphRef.current.zoom(2, 100);
              graphRef.current.centerAt(0, 0, 100);
            } catch {}
          }
        }, 100);
      }
    }

    detachResize() {
      if (this.resizeObserver && this.attachedEl) {
        try { this.resizeObserver.disconnect(); } catch {}
      }
      if (this.resizeObserver) this.resizeObserver = null;
      if (this.attachedEl) this.attachedEl = null;
      window.removeEventListener('resize', this.resizeHandler);
    }
  }

  const lifecycleRef = useRef<SMGraphLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new SMGraphLifecycle();
  }
  void lifecycleRef.current.ensureData();
  lifecycleRef.current.attachResize(containerRef.current);

  // Custom node renderer with simplified, faster rendering
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
    const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
    const name = node.name || 'Unknown';
    const nodeCount = node.nodeCount || 0;
    const exerciseCount = node.exerciseCount || 0;
    
    // Simplified text scaling
    const fontSize = Math.max(8, Math.min(16, 12 / Math.sqrt(globalScale)));
    const isHovered = hoveredNode && hoveredNode.id === node.id;
    
    // Simplified node sizing
    const baseSize = Math.max(8, Math.min(15, 8 + (nodeCount + exerciseCount) / 4));
    const size = isHovered ? baseSize * 1.1 : baseSize;
    
    // Draw node circle
    ctx.fillStyle = isHovered ? '#10B981' : '#6B7280';
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
    
    // Thinner border
    ctx.strokeStyle = isHovered ? '#FFFFFF' : '#D1D5DB';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    
    // Text rendering (on top of nodes)
    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Main text (no stroke border since text is already dark)
    ctx.fillStyle = '#1F2937';
    ctx.fillText(name, x, y - size - 10);
    
    // Stats rendering
    if (globalScale > 0.5) { // Only show stats when zoomed in enough
      const statsText = `${nodeCount}d, ${exerciseCount}e`;
      const statsSize = Math.max(6, fontSize * 0.75);
      ctx.font = `${statsSize}px Arial`;
      
      // Stats text (no stroke border)
      ctx.fillStyle = '#6B7280';
      ctx.fillText(statsText, x, y + size + 12);
    }
  }, [hoveredNode]);

  // Handle node click
  const handleNodeClick = useCallback((node: any) => {
    if (node && node.id) {
      onSelectSubjectMatter(node.id);
    }
  }, [onSelectSubjectMatter]);

  // Handle node hover
  const handleNodeHover = useCallback((node: any) => {
    setHoveredNode(node);
  }, []);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading subject matters...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full w-full flex items-center justify-center">
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
    );
  }

  return (
    <div className="h-full w-full relative" ref={containerRef}>
      {/* Info Panel */}
      {showInfo && (
        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-lg z-10 max-w-sm">
          <h3 className="font-semibold text-gray-800 mb-2">Subject Matter Graph</h3>
          <p className="text-sm text-gray-600 mb-2">
            This visualization shows your enrolled domains as connected nodes. Each node represents a subject matter domain.
          </p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>• Node size reflects the number of definitions</li>
            <li>• Click a node to explore its knowledge graph</li>
            <li>• Hover to see definition and exercise counts</li>
          </ul>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowInfo(!showInfo)}
        >
          <Info className="w-4 h-4" />
        </Button>
        {onCreateSubjectMatter && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateSubjectMatter}
          >
            <Plus className="w-4 h-4" />
            Create Domain
          </Button>
        )}
      </div>

      {/* Empty State */}
      {graphData.nodes.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl text-gray-300 mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Domains Yet</h3>
            <p className="text-gray-500 mb-4">
              You haven't enrolled in any domains yet. Create your first domain or explore public ones to get started!
            </p>
            {onCreateSubjectMatter && (
              <Button onClick={onCreateSubjectMatter}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Domain
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Force Graph */}
      {graphData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            const x = node.x || 0;
            const y = node.y || 0;
            const nodeCount = node.nodeCount || 0;
            const exerciseCount = node.exerciseCount || 0;
            const size = Math.max(8, Math.min(15, 8 + (nodeCount + exerciseCount) / 4)) * 1.3;
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, 2 * Math.PI);
            ctx.fill();
          }}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onEngineStop={handleEngineStop}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalParticleWidth={0.5}
          linkColor={() => 'rgba(156, 163, 175, 0.5)'}
          linkWidth={3}
          linkDistance={200000}
          nodeRepulsion={2000}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.05}
          cooldownTicks={200}
          enableZoomPanInteraction={true}
          minZoom={0.5}
          maxZoom={8}
          warmupTicks={10}
          enablePointerInteraction={true}
          autoPauseRedraw={false}
        />
      )}
    </div>
  );
};

export default SubjectMatterGraph;
