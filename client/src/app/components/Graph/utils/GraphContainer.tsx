// client/src/app/components/Graph/utils/GraphContainer.tsx
// Refactored as pure renderer with fine-grained reactivity

"use client";

import React, { useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GraphNode, GraphLink, FilteredNodeType } from './types';
import { getStatusColor as getSRSStatusColor } from '@/lib/srs-api';
import { CreditFlowAnimation } from '@/types/srs';
import CreditFlowOverlay from '../components/CreditFlowOverlay';
import { LabelRenderer, RenderedLabel } from './HybridLatexRenderer';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

export type LabelDisplayMode = 'off' | 'codes' | 'names';

interface GraphContainerProps {
  graphNodes: GraphNode[];
  graphLinks: GraphLink[];
  highlightNodes: Set<string>;
  highlightLinks: Set<string>;
  filteredNodeType: FilteredNodeType;
  selectedNodeId: string | null;
  labelDisplayMode: LabelDisplayMode;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeDragEnd: (node: GraphNode) => void;
  onLinkClick?: (link: GraphLink) => void;
  onBackgroundClick?: () => void;
  onEngineStop?: () => void;
  graphRef: React.MutableRefObject<any>;
  creditFlowAnimations?: CreditFlowAnimation[];
  requiresPhysicsReset?: boolean;
  structureVersion?: number;
}

// Pure renderer with memoized calculations
const GraphContainer: React.FC<GraphContainerProps> = React.memo(({
  graphNodes,
  graphLinks,
  highlightNodes,
  highlightLinks,
  filteredNodeType,
  selectedNodeId,
  labelDisplayMode,
  onNodeClick,
  onNodeHover,
  onNodeDragEnd,
  onLinkClick,
  onBackgroundClick,
  onEngineStop,
  graphRef,
  creditFlowAnimations = [],
  requiresPhysicsReset = false,
  structureVersion,
}) => {
  // Position tracking and incremental repaint scheduling
  const nodePositions = useRef(new Map<string, {x: number, y: number}>());
  const lastNodeCountRef = useRef(0);
  const simulationStableRef = useRef(false);
  const labelRendererRef = useRef(new LabelRenderer());
  const rafRefreshRef = useRef<number | null>(null);
  const prewarmKeyRef = useRef<string>('');

  const scheduleRafRefresh = useCallback(() => {
    if (rafRefreshRef.current != null) return;
    rafRefreshRef.current = requestAnimationFrame(() => {
      rafRefreshRef.current = null;
      try { graphRef.current?.refresh?.(); } catch {}
    });
  }, [graphRef]);

  // Pre-warm label cache to avoid first-hover flicker
  // We derive a coarse key from label mode + node set identity (length + edge ids)
  const prewarmKey = useMemo(() => {
    const first = graphNodes[0]?.id || '';
    const last = graphNodes[graphNodes.length - 1]?.id || '';
    return `${labelDisplayMode}|${graphNodes.length}|${first}|${last}`;
  }, [graphNodes, labelDisplayMode]);

  if (prewarmKeyRef.current !== prewarmKey) {
    prewarmKeyRef.current = prewarmKey;
    const renderer = labelRendererRef.current;
    // Prewarm up to a budget to keep app responsive; renderer enforces concurrency
    const BUDGET = Math.min(300, graphNodes.length);
    for (let i = 0; i < BUDGET; i++) {
      const n = graphNodes[i];
      if (!n) break;
      let text = '';
      if (labelDisplayMode === 'codes') text = n.id;
      else if (labelDisplayMode === 'names') text = n.name;
      else if (labelDisplayMode === 'off') text = `${n.id}: ${n.name}`; // used on hover; prewarm to avoid flicker
      if (!text) continue;
      if (!renderer.getCache(text)) {
        renderer.render(text, scheduleRafRefresh);
      }
    }
  }

  // Memoized graph data to prevent unnecessary re-renders
  // Only change graphData reference on structural change to avoid reheating on hover
  const memoizedGraphData = useMemo(() => {
    console.log(`GraphContainer: Creating graph data with ${graphNodes.length} nodes, ${graphLinks.length} links`);
    return { nodes: graphNodes, links: graphLinks };
  }, [graphNodes, graphLinks, structureVersion]);

  // Derive node positions map without effects (consumed by overlay on animation creation)
  const computedNodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    graphNodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        map.set(node.id, { x: node.x, y: node.y });
      }
    });
    // Keep ref in sync for any internal access while avoiding effects
    nodePositions.current = map;
    return map;
  }, [graphNodes]);

  // Detect structural changes for physics reset
  // IMPORTANT: We only reheat physics if there are nodes without known positions.
  // This preserves "no drift" behavior described in KNOWLEDGE_GRAPH.md when switching modes.
  const structuralChange = useMemo(() => {
    const callerRequested = !!requiresPhysicsReset;
    lastNodeCountRef.current = graphNodes.length;

    // Check if all nodes have x/y coordinates
    const allHavePositions = graphNodes.every(n => typeof n.x === 'number' && typeof n.y === 'number');

    // Reheat only when requested AND we have unpositioned nodes
    const shouldReset = callerRequested && !allHavePositions;
    if (shouldReset) {
      console.log(`GraphContainer: Physics reset (unpositioned nodes present). Nodes: ${graphNodes.length}`);
      simulationStableRef.current = false;
    } else if (callerRequested && allHavePositions) {
      console.log('GraphContainer: Suppressing physics reset — all nodes have positions.');
    }
    return shouldReset;
  }, [requiresPhysicsReset, graphNodes.length, graphNodes]);

  // Memoized node renderer for better performance
  // Per-node persistent label cache to avoid transient cache misses on hover
  type NodeWithCache = GraphNode & { __labelCache?: Map<string, RenderedLabel> };

  const getNodeLabelCache = (n: GraphNode): Map<string, RenderedLabel> => {
    const nn = n as NodeWithCache;
    if (!nn.__labelCache) nn.__labelCache = new Map();
    return nn.__labelCache;
  };

  const makeLabelKey = (mode: LabelDisplayMode, id: string, text: string, highlighted: boolean) => {
    // For 'off', labels only show on hover/highlight — key separately to avoid clashes
    const scope = mode === 'off' ? (highlighted ? 'hover' : 'none') : mode;
    return `${scope}|${id}|${text}`;
  };

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue, color } = node;
    const nodeSizeBase = type === 'definition' ? 7 : 6;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const isSelected = selectedNodeId === id;
    const isHighlighted = highlightNodes.has(id);

    // Calculate final color with SRS status consideration
    let finalColor = color;
    if (!finalColor) {
      let baseColor;
      if (type === 'definition') {
        baseColor = node.isRootDefinition ? '#28a745' : '#007bff';
      } else {
        const difficultyColors = ['#66bb6a', '#9ccc65', '#d4e157', '#ffee58', '#ffa726', '#ff7043', '#ef5350'];
        let difficultyLevel = 2;
        if (node.difficulty !== undefined && node.difficulty !== null) {
          const parsed = typeof node.difficulty === 'number' ? node.difficulty : parseInt(String(node.difficulty), 10);
          if (!isNaN(parsed)) {
            difficultyLevel = Math.max(0, Math.min(6, parsed - 1));
          }
        }
        baseColor = difficultyColors[difficultyLevel];
      }
      finalColor = status ? getSRSStatusColor(status) : baseColor;
    }

    // Render selection highlight
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 8 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    } else if (isHighlighted) {
      const highlightIntensity = highlightNodes.size > 10 ? 0.3 : 0.5;
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 6 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = `rgba(0, 123, 255, ${highlightIntensity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(0, 123, 255, ${highlightIntensity + 0.3})`;
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    // Main node circle
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = finalColor;
    ctx.fill();
    
    // Node border
    if (isSelected) {
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)';
      ctx.lineWidth = 2 / globalScale;
    } else if (isHighlighted) {
      ctx.strokeStyle = 'rgba(0, 123, 255, 0.8)';
      ctx.lineWidth = 1.5 / globalScale;
    } else {
      ctx.strokeStyle = status ? 'rgba(0,0,0,0.5)' : (type === 'definition' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)');
      ctx.lineWidth = 1 / globalScale;
    }
    ctx.stroke();

    // Due indicator animation
    if (isDue) {
      const time = Date.now();
      const pulseRadius = nodeSize + 2.5 / globalScale;
      const pulseAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time / 400));
      
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 80, 80, ${pulseAlpha})`;
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
      
      // Secondary pulse ring
      const secondaryPulse = nodeSize + 4 / globalScale;
      const secondaryAlpha = 0.2 + 0.4 * Math.abs(Math.sin(time / 600));
      ctx.beginPath();
      ctx.arc(x, y, secondaryPulse, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 120, 120, ${secondaryAlpha})`;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Node type icon
    if (globalScale > 1 && globalScale < 20) {
      const iconFontSize = Math.max(4, Math.min(nodeSize * 0.8, 14 / Math.sqrt(globalScale)));
      
      ctx.fillStyle = isHighlighted ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.95)';
      ctx.font = `bold ${iconFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = Math.max(1, iconFontSize * 0.1);
      
      const text = type === 'definition' ? 'D' : 'E';
      ctx.fillText(text, x, y);
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Label rendering with caching
    const labelThreshold = 0.5;
    const shouldShowLabel = (labelDisplayMode !== 'off' && globalScale > labelThreshold) || isSelected || isHighlighted;

    if (shouldShowLabel) {
      let labelText = '';
      if (labelDisplayMode === 'codes') {
        labelText = id;
      } else if (labelDisplayMode === 'names') {
        labelText = name;
      }
      
      if (labelDisplayMode === 'off' && (isSelected || isHighlighted)) {
        labelText = `${id}: ${name}`;
      }

      if (labelText) {
        const key = makeLabelKey(labelDisplayMode, id, labelText, isHighlighted || isSelected);
        const nodeCache = getNodeLabelCache(node);
        // Try fast per-node cache first, then global cache
        let cachedLabel = nodeCache.get(key) || labelRendererRef.current.getCache(labelText);

        if (cachedLabel) {
          // Persist into node cache for future frames
          if (!nodeCache.has(key)) nodeCache.set(key, cachedLabel);
          const { image, width, height } = cachedLabel;
          const scale = 1 / Math.sqrt(globalScale);
          const labelWidth = width * scale;
          const labelHeight = height * scale;
          const labelOffset = nodeSize + 6 / globalScale;
          
          ctx.drawImage(
            image,
            x - labelWidth / 2,
            y + labelOffset,
            labelWidth,
            labelHeight
          );
        } else {
          // Request render; on completion schedule a single RAF-based refresh
          labelRendererRef.current.render(labelText, scheduleRafRefresh);
          // No placeholder to avoid noticeable flicker; label will appear when ready
        }
      }
    }
  }, [selectedNodeId, highlightNodes, labelDisplayMode, scheduleRafRefresh]);

  // Memoized link color calculation
  const getLinkColor = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 'rgba(245, 158, 11, 0.9)';
    }
    
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      const weight = link.weight || 1.0;
      const opacity = 0.6 + 0.3 * weight;
      return `rgba(0, 123, 255, ${opacity})`;
    }
    
    const targetNode = graphNodes.find(n => n.id === targetId);
    const weight = link.weight || 1.0;
    
    if (targetNode?.type === 'exercise') {
      const minOpacity = 0.3;
      const maxOpacity = 0.8;
      const opacity = minOpacity + (maxOpacity - minOpacity) * weight;
      return `rgba(255, 69, 0, ${opacity})`;
    }
    
    const minOpacity = 0.25;
    const maxOpacity = 0.7;
    const opacity = minOpacity + (maxOpacity - minOpacity) * weight;
    
    if (weight < 1.0) {
      return `rgba(100, 120, 180, ${opacity})`;
    } else {
      return `rgba(120, 120, 120, ${opacity})`;
    }
  }, [graphNodes, highlightLinks, highlightNodes]);

  // Memoized link width calculation
  const getLinkWidth = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    const weight = link.weight || 1.0;
    
    let baseWidth = 1.0;
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') baseWidth = 1.8;
    
    const minWidthRatio = 0.3;
    const scaledWidth = baseWidth * (minWidthRatio + (1 - minWidthRatio) * weight);
    
    if (highlightLinks.has(linkId)) {
      return Math.max(3, scaledWidth * 2.5);
    }
    
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      return Math.max(scaledWidth, scaledWidth * 1.5);
    }
    
    return scaledWidth;
  }, [graphNodes, highlightLinks, highlightNodes]);

  // Optimized link renderer
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { source, target, weight = 1.0 } = link;
    
    if (!source || !target || 
        typeof source.x !== 'number' || typeof source.y !== 'number' || 
        typeof target.x !== 'number' || typeof target.y !== 'number') {
      return;
    }
    
    const sourceId = typeof source === 'object' ? source.id : String(source);
    const targetId = typeof target === 'object' ? target.id : String(target);
    const linkId = `${sourceId}-${targetId}`;
    const isHighlighted = highlightLinks.has(linkId);
    const isConnectedHighlighted = highlightNodes.has(sourceId) || highlightNodes.has(targetId);
    const isPartial = weight < 1.0;
    
    const color = getLinkColor(link);
    const width = getLinkWidth(link) / globalScale;
    
    // Calculate curve
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    const targetNode = graphNodes.find(n => n.id === targetId);
    const targetNodeSize = (targetNode?.type === 'definition' ? 7 : 6) / Math.sqrt(globalScale);
    
    const curvature = 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / distance * curvature * distance;
    const perpY = dx / distance * curvature * distance;
    const controlX = midX + perpX;
    const controlY = midY + perpY;
    
    // Glow effect for highlights
    if (isHighlighted || isConnectedHighlighted) {
      ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)');
      ctx.lineWidth = width * 3;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
      ctx.stroke();
    }
    
    // Main link
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    
    if (isPartial) {
      const dashSize = Math.max(3, 5 / globalScale);
      const gapSize = Math.max(2, 3 / globalScale);
      ctx.setLineDash([dashSize, gapSize]);
    } else {
      ctx.setLineDash([]);
    }
    
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Arrow calculation and rendering
    const arrowLength = isHighlighted ? 12 / Math.sqrt(globalScale) : 8 / Math.sqrt(globalScale);
    const arrowAngle = Math.PI / 6;
    const nodeRadius = targetNodeSize + 2 / globalScale;
    
    // Find arrow position
    let t = 0.95;
    let iterations = 0;
    const maxIterations = 10;
    
    while (iterations < maxIterations) {
      const curveX = (1-t)*(1-t)*source.x + 2*(1-t)*t*controlX + t*t*target.x;
      const curveY = (1-t)*(1-t)*source.y + 2*(1-t)*t*controlY + t*t*target.y;
      const distToCurve = Math.sqrt((target.x - curveX)**2 + (target.y - curveY)**2);
      
      if (Math.abs(distToCurve - nodeRadius) < 1) break;
      
      t += distToCurve > nodeRadius ? 0.01 : -0.01;
      t = Math.max(0.5, Math.min(0.98, t));
      iterations++;
    }
    
    const arrowX = (1-t)*(1-t)*source.x + 2*(1-t)*t*controlX + t*t*target.x;
    const arrowY = (1-t)*(1-t)*source.y + 2*(1-t)*t*controlY + t*t*target.y;
    
    // Arrow direction
    const t2 = Math.min(0.99, t + 0.02);
    const dirX = ((1-t2)*(1-t2)*source.x + 2*(1-t2)*t2*controlX + t2*t2*target.x) - arrowX;
    const dirY = ((1-t2)*(1-t2)*source.y + 2*(1-t2)*t2*controlY + t2*t2*target.y) - arrowY;
    const dirLength = Math.sqrt(dirX*dirX + dirY*dirY);
    
    if (dirLength > 0) {
      const unitDirX = dirX / dirLength;
      const unitDirY = dirY / dirLength;
      
      const arrowX1 = arrowX - arrowLength * (unitDirX * Math.cos(arrowAngle) - unitDirY * Math.sin(arrowAngle));
      const arrowY1 = arrowY - arrowLength * (unitDirX * Math.sin(arrowAngle) + unitDirY * Math.cos(arrowAngle));
      const arrowX2 = arrowX - arrowLength * (unitDirX * Math.cos(-arrowAngle) - unitDirY * Math.sin(-arrowAngle));
      const arrowY2 = arrowY - arrowLength * (unitDirX * Math.sin(-arrowAngle) + unitDirY * Math.cos(-arrowAngle));
      
      ctx.lineWidth = Math.max(1.5 / globalScale, width * 1.5);
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX1, arrowY1);
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX2, arrowY2);
      ctx.stroke();
    }
    
    // Weight label for partial prerequisites
    if (isPartial && globalScale > 0.6 && distance > 40) {
      const fontSize = Math.max(8, 10 / globalScale);
      ctx.font = `${fontSize}px Sans-Serif`;
      const text = weight.toFixed(2);
      const textMetrics = ctx.measureText(text);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(
        controlX - textMetrics.width / 2 - 3,
        controlY - fontSize / 2 - 2,
        textMetrics.width + 6,
        fontSize + 4
      );
      
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, controlX, controlY);
    }
  }, [getLinkColor, getLinkWidth, highlightLinks, highlightNodes, graphNodes]);

  // Handle simulation stop
  const handleEngineStop = useCallback(() => {
    simulationStableRef.current = true;
    console.log('GraphContainer: Simulation stabilized');
    onEngineStop?.();
  }, [onEngineStop]);

  // Cache management for structural changes (no effects)
  if (structuralChange) {
    // Clear expensive text/LaTeX label cache when topology changes
    labelRendererRef.current.clearCache();
  }

  // Directional particles for animated links
  const getDirectionalParticles = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
    const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 4;
    }
    
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      return 2;
    }
    
    return 0;
  }, [highlightLinks, highlightNodes]);

  const getDirectionalParticleWidth = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
    const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 4;
    }
    
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      return 2;
    }
    
    return 0;
  }, [highlightLinks, highlightNodes]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={memoizedGraphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeVal={node => (node.type === 'definition' ? 8 : 6) * (node.isDue ? 1.3 : 1)}
        nodeCanvasObject={nodeCanvasObject}
        
        linkCanvasObject={linkCanvasObject}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature={0.1}
        
        linkDirectionalParticles={getDirectionalParticles}
        linkDirectionalParticleWidth={getDirectionalParticleWidth}
        linkDirectionalParticleSpeed={0.008}
        
        // Event handlers
        onNodeClick={(node) => onNodeClick(node as any)}
        onNodeHover={(node) => onNodeHover(node as any)}
        onNodeDragEnd={(node) => onNodeDragEnd(node as any)}
        onLinkClick={(link) => onLinkClick?.(link as any)}
        onBackgroundClick={() => onBackgroundClick?.()}
        onEngineStop={handleEngineStop}
        
        // Physics simulation parameters
        // If we didn't trigger a structural reset (or all nodes are positioned),
        // keep alpha decay aggressive to avoid any drift.
        d3AlphaDecay={structuralChange ? 0.015 : 1}
        d3VelocityDecay={0.75}
        
        // Conditional simulation control based on structural changes
        warmupTicks={structuralChange ? 200 : 0}
        cooldownTicks={structuralChange ? 400 : 0}
        
        // Node display settings
        nodeRelSize={1.2}
        nodeVisibility={(node: any) => 
          filteredNodeType === 'all' || 
          node.type === filteredNodeType || 
          selectedNodeId === node.id || 
          highlightNodes.has(node.id)
        }
        
        // Interaction settings
        enableNodeDrag={true}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        enablePointerInteraction={true}
        
        // Performance settings
        autoPauseRedraw={false}
        minZoom={0.1}
        maxZoom={8}
      />
      
      <CreditFlowOverlay
        animations={creditFlowAnimations}
        nodePositions={computedNodePositions}
        graphRef={graphRef}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for fine-grained reactivity
  // Only re-render when essential props change
  return (
    prevProps.graphNodes === nextProps.graphNodes &&
    prevProps.graphLinks === nextProps.graphLinks &&
    prevProps.highlightNodes === nextProps.highlightNodes &&
    prevProps.highlightLinks === nextProps.highlightLinks &&
    prevProps.selectedNodeId === nextProps.selectedNodeId &&
    prevProps.labelDisplayMode === nextProps.labelDisplayMode &&
    prevProps.filteredNodeType === nextProps.filteredNodeType &&
    prevProps.onLinkClick === nextProps.onLinkClick &&
    prevProps.onBackgroundClick === nextProps.onBackgroundClick &&
    prevProps.creditFlowAnimations === nextProps.creditFlowAnimations &&
    prevProps.requiresPhysicsReset === nextProps.requiresPhysicsReset &&
    prevProps.structureVersion === nextProps.structureVersion
  );
});

GraphContainer.displayName = 'GraphContainer';

export default GraphContainer;
