"use client";

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/app/components/core/button";
import { Plus, Link as LinkIcon, Trash2 } from 'lucide-react';
import { getEnrolledDomains, getDomainLinks, createDomainLink, deleteDomainLink, DomainLink } from '@/lib/api';
import { showToast } from "@/app/components/core/ToastNotification";
import * as d3 from 'd3';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

interface SubjectMatter {
  id: string;
  name: string;
  nodeCount?: number;
  exerciseCount?: number;
}

interface SubjectMatterGraphProps {
  onSelectSubjectMatter: (id: string) => void;
  onCreateSubjectMatter?: () => void;
  subjectMatters?: SubjectMatter[];
  autoFitOnLoad?: boolean; // if true, fit graph to view on initial load
}

const SubjectMatterGraph: React.FC<SubjectMatterGraphProps> = ({ onSelectSubjectMatter, onCreateSubjectMatter, subjectMatters: subjectMattersProp, autoFitOnLoad = true }) => {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // UI/State
  const [hoveredNode, setHoveredNode] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1100, height: 400 });
  const [subjectMatters, setSubjectMatters] = useState<SubjectMatter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasBeenFitted, setHasBeenFitted] = useState(false);
  const [links, setLinks] = useState<DomainLink[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editAction, setEditAction] = useState<'connect' | 'delete'>('connect');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Choose subjects: prefer provided; else fetch enrolled
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        if (subjectMattersProp && subjectMattersProp.length) {
          setSubjectMatters(subjectMattersProp);
        } else {
          const domains = await getEnrolledDomains();
          const mapped = domains.map((domain: any) => ({
            id: String(domain.id),
            name: domain.name,
            nodeCount: domain.nodeCount || 0,
            exerciseCount: domain.exerciseCount || 0,
          }));
          setSubjectMatters(mapped);
        }
      } catch (err) {
        console.error('Error fetching domains:', err);
        setError('Error loading domains. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [subjectMattersProp]);

  // Load links for current subjects
  useEffect(() => {
    const fetchLinks = async () => {
      try {
        if (!subjectMatters.length) { setLinks([]); return; }
        const ids = subjectMatters.map(s => Number(s.id)).filter(Boolean);
        const res = await getDomainLinks(ids);
        setLinks(res || []);
      } catch (err) {
        console.error('Error fetching domain links:', err);
      }
    };
    fetchLinks();
  }, [subjectMatters.map(s => s.id).join(',')]);

  // Derived graph data
  const graphData = useMemo(() => {
    const nodes = subjectMatters.map(subject => ({
      id: String(subject.id),
      name: subject.name,
      nodeCount: subject.nodeCount || 0,
      exerciseCount: subject.exerciseCount || 0,
      val: Math.max(8, Math.min(25, 8 + (subject.nodeCount || 0) / 3))
    }));
    const idSet = new Set(nodes.map(n => String(n.id)));
    const linkObjs = (links || [])
      .map(l => ({ id: l.id, source: String(l.domainAId), target: String(l.domainBId), value: 1 }))
      .filter(l => idSet.has(String(l.source)) && idSet.has(String(l.target)));
    return { nodes, links: linkObjs } as any;
  }, [subjectMatters, links]);

  // Fit graph to view - only on first render
  const fitGraphToView = useCallback(() => {
    if (!graphRef.current || hasBeenFitted) return;
    if (graphData.nodes.length === 0) return;
    if (dimensions.width <= 0 || dimensions.height <= 0) return;
    setTimeout(() => {
      try {
        if (!graphRef.current || hasBeenFitted) return;
        if (typeof graphRef.current.zoomToFit === 'function') {
          graphRef.current.zoomToFit(600, 40);
        } else {
          // Fallback: center and set a reasonable zoom
          graphRef.current.centerAt(0, 0, 600);
          graphRef.current.zoom(1, 600);
        }
        setHasBeenFitted(true);
      } catch (error) {
        console.error('Error positioning graph:', error);
      }
    }, 100);
  }, [graphData.nodes.length, dimensions.width, dimensions.height, hasBeenFitted]);

  const handleEngineStop = useCallback(() => { fitGraphToView(); }, [fitGraphToView]);

  // Also trigger fit once when data and dimensions are ready (independent of engine stop)
  useEffect(() => {
    if (!autoFitOnLoad) return;
    fitGraphToView();
  }, [autoFitOnLoad, graphData.nodes.length, dimensions.width, dimensions.height, fitGraphToView]);

  // Forces for less crowding
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg) return;
    const n = Math.max(1, subjectMatters.length);
    const baseDist = 100 + Math.sqrt(n) * 28;
    try {
      const linkForce = fg.d3Force && fg.d3Force('link');
      if (linkForce && typeof linkForce.distance === 'function') {
        linkForce.distance(() => baseDist).strength(0.6);
      }
      if (fg.d3Force) {
        fg.d3Force('charge', (d3 as any).forceManyBody().strength(-380));
        fg.d3Force('collide', (d3 as any).forceCollide((node: any) => {
          const count = (node.nodeCount || 0) + (node.exerciseCount || 0);
          const r = Math.max(8, Math.min(15, 8 + count / 4));
          return r + 16;
        }));
      }
      fg.d3VelocityDecay(0.25);
      fg.d3ReheatSimulation();
    } catch {}
  }, [subjectMatters.length]);

  // Cleanup on unmount to avoid d3 processing stale links/nodes
  useEffect(() => {
    return () => {
      try {
        if (graphRef.current && typeof graphRef.current.graphData === 'function') {
          graphRef.current.graphData({ nodes: [], links: [] });
        }
      } catch {}
    };
  }, []);

  // Resize tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setDimensions({ width: rect.width || 800, height: rect.height || 400 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Node drawing
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
    const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
    const name = node.name || 'Unknown';
    const nodeCount = node.nodeCount || 0;
    const exerciseCount = node.exerciseCount || 0;
    const fontSize = Math.max(8, Math.min(16, 12 / Math.sqrt(globalScale)));
    const isHovered = hoveredNode && hoveredNode.id === node.id;
    const isSelected = selectedNodeId === node.id;
    const baseSize = Math.max(8, Math.min(15, 8 + (nodeCount + exerciseCount) / 4));
    const size = (isHovered || isSelected) ? baseSize * 1.15 : baseSize;

    ctx.fillStyle = isSelected ? '#F59E0B' : (isHovered ? '#10B981' : '#6B7280');
    ctx.beginPath();
    ctx.arc(x, y, size, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#92400E' : (isHovered ? '#FFFFFF' : '#D1D5DB');
    ctx.lineWidth = isSelected ? 1.2 : 0.6;
    ctx.stroke();

    ctx.font = `${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1F2937';
    ctx.fillText(name, x, y - size - 10);

    if (globalScale > 0.5) {
      const statsText = `${nodeCount}d, ${exerciseCount}e`;
      const statsSize = Math.max(6, fontSize * 0.75);
      ctx.font = `${statsSize}px Arial`;
      ctx.fillStyle = '#6B7280';
      ctx.fillText(statsText, x, y + size + 12);
    }
  }, [hoveredNode, selectedNodeId]);

  // Click/hover handlers
  const handleNodeClick = useCallback(async (node: any) => {
    if (!node?.id) return;
    if (editMode && editAction === 'connect') {
      if (!selectedNodeId) { setSelectedNodeId(node.id); return; }
      if (selectedNodeId === node.id) { setSelectedNodeId(null); return; }
      try {
        const a = Number(selectedNodeId);
        const b = Number(node.id);
        const created = await createDomainLink(a, b);
        setLinks(prev => [created, ...prev.filter(l => !(l.domainAId === Math.min(a,b) && l.domainBId === Math.max(a,b)))]);
        setSelectedNodeId(null);
        showToast('Connection created', 'success', 1200);
      } catch (e:any) {
        showToast(e?.message || 'Failed to create connection', 'error', 2000);
      }
      return;
    }
    onSelectSubjectMatter(String(node.id));
  }, [editMode, editAction, selectedNodeId, onSelectSubjectMatter]);

  const handleLinkClick = useCallback(async (link: any) => {
    if (!editMode || editAction !== 'delete') return;
    if (!link?.id) return;
    const ok = window.confirm('Delete this connection?');
    if (!ok) return;
    try {
      await deleteDomainLink(Number(link.id));
      setLinks(prev => prev.filter(l => l.id !== Number(link.id)));
      showToast('Connection deleted', 'success', 1200);
    } catch (e:any) {
      showToast(e?.message || 'Failed to delete connection', 'error', 2000);
    }
  }, [editMode, editAction]);

  const handleNodeHover = useCallback((node: any) => { setHoveredNode(node); }, []);

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
          <button onClick={() => window.location.reload()} className="block mt-4 px-4 py-2 bg-blue-500 text-white rounded">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative" ref={containerRef}>
      {/* Left Controls */}
      {onCreateSubjectMatter && (
        <div className="absolute top-4 left-4 flex gap-2 z-10">
          <Button variant="outline" size="sm" onClick={onCreateSubjectMatter}>
            <Plus className="w-4 h-4" />
            Create Domain
          </Button>
        </div>
      )}

      {/* Edit Links Controls */}
      <div className="absolute top-4 right-4 flex gap-2 z-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-1">
        <Button
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={() => { setEditMode(!editMode); setSelectedNodeId(null); }}
          title="Toggle edit links mode"
        >
          <LinkIcon className="w-4 h-4 mr-1" />
          {editMode ? 'Editing' : 'Edit Links'}
        </Button>
        {editMode && (
          <>
            <Button variant={editAction === 'connect' ? "default" : "outline"} size="sm" onClick={() => setEditAction('connect')} title="Create connection">
              <LinkIcon className="w-4 h-4" />
            </Button>
            <Button variant={editAction === 'delete' ? "destructive" : "outline"} size="sm" onClick={() => { setEditAction('delete'); setSelectedNodeId(null); }} title="Delete connection">
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {/* Empty State */}
      {graphData.nodes.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl text-gray-300 mb-4">📚</div>
            <h3 className="text-lg font-medium text-gray-600 mb-2">No Domains Yet</h3>
            <p className="text-gray-500 mb-4">You haven't enrolled in any domains yet. Create your first domain or explore public ones to get started!</p>
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
          onLinkClick={handleLinkClick}
          onNodeHover={handleNodeHover}
          onEngineStop={handleEngineStop}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.003}
          linkDirectionalParticleWidth={0.5}
          linkColor={() => 'rgba(156, 163, 175, 0.5)'}
          linkWidth={3}
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.25}
          cooldownTicks={180}
          enableZoomInteraction={true}
          enablePanInteraction={true}
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
