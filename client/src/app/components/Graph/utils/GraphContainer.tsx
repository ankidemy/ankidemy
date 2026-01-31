// client/src/app/components/Graph/utils/GraphContainer.tsx
// Refactored as pure renderer with fine-grained reactivity

"use client";

import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { AppMode, GraphNode, GraphLink, FilteredNodeType } from './types';
import { getStatusColor as getSRSStatusColor } from '@/lib/srs-api';
import { CreditFlowAnimation } from '@/types/srs';
import CreditFlowOverlay from '../components/CreditFlowOverlay';
import { LabelRenderer } from './HybridLatexRenderer';
import * as d3 from 'd3';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

const NEW_NODE_HIGHLIGHT_COLOR = '236, 72, 153';
const SELECTED_HIGHLIGHT_COLOR = '139, 92, 246';
const HOVER_HIGHLIGHT_COLOR = '14, 165, 233';

export type LabelDisplayMode = 'off' | 'codes' | 'names';

interface GraphContainerProps {
  graphNodes: GraphNode[];
  graphLinks: GraphLink[];
  highlightNodes: Set<string>;
  highlightLinks: Set<string>;
  filteredNodeType: FilteredNodeType;
  mode: AppMode;
  width?: number;
  height?: number;
  selectedNodeIds: Set<string>;
  newlyCreatedNodeId: string | null;
  labelDisplayMode: LabelDisplayMode;
  onNodeClick: (node: GraphNode, event?: MouseEvent) => void;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeDrag?: (node: GraphNode) => void;
  onNodeDragEnd: (node: GraphNode) => void;
  onLinkClick?: (link: GraphLink) => void;
  onNodeRightClick?: (node: GraphNode, event: MouseEvent) => void;
  onLinkRightClick?: (link: GraphLink, event: MouseEvent) => void;
  onBackgroundClick?: (event?: MouseEvent) => void;
  onEngineStop?: () => void;
  graphRef: React.MutableRefObject<any>;
  creditFlowAnimations?: CreditFlowAnimation[];
  requiresPhysicsReset?: boolean;
  structureVersion?: number;
  dagMode?: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin' | null;
  onDagError?: (loop: (string | number)[]) => void;
}

// Pure renderer with memoized calculations
const GraphContainer: React.FC<GraphContainerProps> = React.memo(({
  graphNodes,
  graphLinks,
  highlightNodes,
  highlightLinks,
  filteredNodeType,
  mode,
  width,
  height,
  selectedNodeIds,
  newlyCreatedNodeId,
  labelDisplayMode,
  onNodeClick,
  onNodeHover,
  onNodeDrag,
  onNodeDragEnd,
  onLinkClick,
  onNodeRightClick,
  onLinkRightClick,
  onBackgroundClick,
  onEngineStop,
  graphRef,
  creditFlowAnimations = [],
  requiresPhysicsReset = false,
  structureVersion,
  dagMode = null,
  onDagError,
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
      const displayId = (n as GraphNode).displayId ?? n.id;
      let text = '';
      if (labelDisplayMode === 'codes') text = displayId;
      else if (labelDisplayMode === 'names') text = n.name;
      else if (labelDisplayMode === 'off') text = `${displayId}: ${n.name}`; // used on hover; prewarm to avoid flicker
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

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    graphNodes.forEach(node => map.set(node.id, node));
    return map;
  }, [graphNodes, structureVersion]);

  const getNodeBaseSize = useCallback((type?: string) => {
    switch (type) {
      case 'group':
        return 10;
      case 'definition':
        return 7;
      case 'source':
      case 'quest':
        return 6.5;
      case 'exercise':
      default:
        return 6;
    }
  }, []);

  const isNodeVisible = useCallback((node: GraphNode) => {
    if (mode === 'study' && node.type === 'exercise') return false;
    if (filteredNodeType === 'all') return true;
    if (node.type === filteredNodeType) return true;
    return selectedNodeIds.has(node.id) || highlightNodes.has(node.id);
  }, [filteredNodeType, highlightNodes, mode, selectedNodeIds]);

  const isNodeVisibleById = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    if (!node) return false;
    return isNodeVisible(node);
  }, [isNodeVisible, nodeById]);

  const isLinkVisible = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
    const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
    return isNodeVisibleById(sourceId) && isNodeVisibleById(targetId);
  }, [isNodeVisibleById]);

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

  useEffect(() => {
    return () => {
      if (rafRefreshRef.current != null) {
        cancelAnimationFrame(rafRefreshRef.current);
      }
      labelRendererRef.current.clearCache();
    };
  }, []);

  // Reduce overlap in DAG layouts by strengthening separation forces while DAG mode is active.
  useEffect(() => {
    const fg = graphRef.current;
    if (!fg || typeof fg.d3Force !== 'function') return;

    try {
      const isDag = !!dagMode;
      const nodeCount = Math.max(1, graphNodes.length);

      const linkForce = fg.d3Force('link');
      if (linkForce && typeof linkForce.distance === 'function') {
        const baseDist = isDag ? 80 + Math.sqrt(nodeCount) * 6 : 30;
        linkForce.distance(() => baseDist).strength(isDag ? 0.6 : 1);
      }

      const chargeForce = fg.d3Force('charge');
      if (chargeForce && typeof chargeForce.strength === 'function') {
        const chargeStrength = isDag ? (-160 - Math.min(420, Math.sqrt(nodeCount) * 32)) : -30;
        chargeForce.strength(chargeStrength);
      }

      if (isDag) {
        const labelPadding =
          labelDisplayMode === 'names' ? 36
          : labelDisplayMode === 'codes' ? 30
          : 22;

        fg.d3Force(
          'collide',
          (d3 as any)
            .forceCollide((node: any) => {
              const type = node?.type;
              const base =
                type === 'group' ? 18
                : type === 'definition' ? 14
                : 13;
              return base + labelPadding;
            })
            .iterations(2)
        );
      } else {
        fg.d3Force('collide', null);
      }

      fg.d3ReheatSimulation?.();
    } catch {}
  }, [dagMode, graphNodes.length, labelDisplayMode, structureVersion, graphRef]);

  // Memoized node renderer for better performance

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue, color } = node;
    const displayId = (node as GraphNode).displayId ?? id;
    const isGroup = type === 'group';
    const nodeSizeBase = getNodeBaseSize(type);
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const isSelected = selectedNodeIds.has(id);
    const isNewlyCreated = newlyCreatedNodeId === id;
    const isHighlighted = highlightNodes.has(id);
    const isExternal = !!(node as GraphNode).isExternal;
    const externalStatus = (node as GraphNode).externalStatus;

    // Calculate final color with SRS status consideration
    let finalColor = color;
    if (!finalColor) {
      let baseColor;
      if (isGroup) {
        baseColor = '#111827';
      } else if (type === 'definition') {
        baseColor = node.isRootDefinition ? '#28a745' : '#007bff';
      } else if (type === 'source') {
        baseColor = '#10b981';
      } else if (type === 'quest') {
        baseColor = '#f59e0b';
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
      finalColor = isGroup ? baseColor : (status ? getSRSStatusColor(status) : baseColor);
    }

    // Render newly created highlight
    if (isNewlyCreated) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 10 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = `rgba(${NEW_NODE_HIGHLIGHT_COLOR}, 0.22)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${NEW_NODE_HIGHLIGHT_COLOR}, 0.9)`;
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    }

    // Render selection highlight
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 8 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = `rgba(${SELECTED_HIGHLIGHT_COLOR}, 0.25)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${SELECTED_HIGHLIGHT_COLOR}, 0.9)`;
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    } else if (isHighlighted) {
      const highlightIntensity = highlightNodes.size > 10 ? 0.3 : 0.5;
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 6 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = `rgba(${HOVER_HIGHLIGHT_COLOR}, ${highlightIntensity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${HOVER_HIGHLIGHT_COLOR}, ${highlightIntensity + 0.3})`;
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
      ctx.strokeStyle = `rgba(${SELECTED_HIGHLIGHT_COLOR}, 0.95)`;
      ctx.lineWidth = 2 / globalScale;
    } else if (isHighlighted) {
      ctx.strokeStyle = `rgba(${HOVER_HIGHLIGHT_COLOR}, 0.85)`;
      ctx.lineWidth = 1.5 / globalScale;
    } else {
      if (isGroup) {
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.lineWidth = 1.5 / globalScale;
      } else if (isExternal) {
        ctx.strokeStyle = externalStatus && externalStatus !== 'ok' ? 'rgba(248, 113, 113, 0.85)' : 'rgba(148, 163, 184, 0.65)';
        ctx.lineWidth = 1 / globalScale;
      } else {
        if (type === 'source' || type === 'quest') {
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        } else {
          ctx.strokeStyle = status ? 'rgba(0,0,0,0.5)' : (type === 'definition' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)');
        }
        ctx.lineWidth = 1 / globalScale;
      }
    }
    ctx.stroke();

    // Due indicator animation
    if (isDue && !isGroup) {
      const isGraspedDue = status === 'grasped';
      const time = Date.now();
      const pulseRadius = nodeSize + 2.5 / globalScale;
      const pulseAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time / 400));
      const primaryColor = '245, 158, 11';
      const secondaryColor = '251, 191, 36';
      
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(${primaryColor}, ${pulseAlpha})`;
      ctx.lineWidth = (isGraspedDue ? 3.5 : 3) / globalScale;
      ctx.stroke();
      
      // Secondary pulse ring
      const secondaryPulse = nodeSize + 4 / globalScale;
      const secondaryAlpha = 0.2 + 0.4 * Math.abs(Math.sin(time / 600));
      ctx.beginPath();
      ctx.arc(x, y, secondaryPulse, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(${secondaryColor}, ${secondaryAlpha})`;
      ctx.lineWidth = (isGraspedDue ? 2 : 1.5) / globalScale;
      ctx.stroke();

      if (isGraspedDue) {
        const highlightPulse = nodeSize + 6 / globalScale;
        const highlightAlpha = 0.2 + 0.3 * Math.abs(Math.sin(time / 500));
        ctx.beginPath();
        ctx.arc(x, y, highlightPulse, 0, 2 * Math.PI, false);
        ctx.strokeStyle = `rgba(34, 197, 94, ${highlightAlpha})`;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }
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
      
      const text = type === 'definition'
        ? 'D'
        : type === 'exercise'
          ? 'E'
          : type === 'source'
            ? 'S'
            : type === 'quest'
              ? 'Q'
              : 'G';
      ctx.fillText(text, x, y);
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Label rendering with caching
    const labelThreshold = 0.5;
    const shouldShowLabel = (labelDisplayMode !== 'off' && globalScale > labelThreshold) || isSelected || isHighlighted || isNewlyCreated;

    if (shouldShowLabel) {
      let labelText = '';
      if (labelDisplayMode === 'codes') {
        labelText = displayId;
      } else if (labelDisplayMode === 'names') {
        labelText = name;
      }
      
      if (labelDisplayMode === 'off' && (isSelected || isHighlighted || isNewlyCreated)) {
        labelText = `${displayId}: ${name}`;
      }

      if (labelText) {
        const cachedLabel = labelRendererRef.current.getCache(labelText);

        if (cachedLabel) {
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
  }, [selectedNodeIds, newlyCreatedNodeId, highlightNodes, labelDisplayMode, scheduleRafRefresh, getNodeBaseSize]);

  // Memoized link color calculation
  const getLinkColor = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 'rgba(245, 158, 11, 0.9)';
    }

    if (link.type === 'relation') {
      return 'rgba(31, 41, 55, 0.55)';
    }

    const sourceNode = graphNodes.find(n => n.id === sourceId);
    if (link.type === 'external' || sourceNode?.isExternal) {
      const status = sourceNode?.externalStatus;
      if (status && status !== 'ok') {
        return 'rgba(248, 113, 113, 0.45)';
      }
      return 'rgba(148, 163, 184, 0.35)';
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

    if (link.type === 'external') {
      const baseWidth = 0.9;
      if (highlightLinks.has(linkId)) {
        return Math.max(2, baseWidth * 2.2);
      }
      const sourceHighlighted = highlightNodes.has(sourceId);
      const targetHighlighted = highlightNodes.has(targetId);
      if (sourceHighlighted || targetHighlighted) {
        return Math.max(baseWidth, baseWidth * 1.4);
      }
      return baseWidth;
    }
    
    let baseWidth = link.type === 'relation' ? 1.2 : 1.0;
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

  const getLinkCurvePoints = useCallback((link: any) => {
    const { source, target } = link;

    if (!source || !target ||
        typeof source.x !== 'number' || typeof source.y !== 'number' ||
        typeof target.x !== 'number' || typeof target.y !== 'number') {
      return null;
    }

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) return null;

    const curvature = 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / distance * curvature * distance;
    const perpY = dx / distance * curvature * distance;

    return {
      source,
      target,
      controlX: midX + perpX,
      controlY: midY + perpY,
    };
  }, []);

  // Optimized link renderer
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { source, target, weight = 1.0 } = link;
    const curve = getLinkCurvePoints(link);
    if (!curve) return;
    
    const sourceId = typeof source === 'object' ? source.id : String(source);
    const targetId = typeof target === 'object' ? target.id : String(target);
    const linkId = `${sourceId}-${targetId}`;
    const isHighlighted = highlightLinks.has(linkId);
    const isConnectedHighlighted = highlightNodes.has(sourceId) || highlightNodes.has(targetId);
    const isRelation = link.type === 'relation';
    const isPartial = weight < 1.0 && !isRelation;
    
    const color = getLinkColor(link);
    const width = getLinkWidth(link) / globalScale;
    
    const dx = curve.target.x - curve.source.x;
    const dy = curve.target.y - curve.source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const targetNode = graphNodes.find(n => n.id === targetId);
    const targetNodeSize = getNodeBaseSize(targetNode?.type) / Math.sqrt(globalScale);
    const { controlX, controlY } = curve;
    
    // Glow effect for highlights
    if (isHighlighted || isConnectedHighlighted) {
      ctx.strokeStyle = color.replace(/[\d.]+\)$/, '0.3)');
      ctx.lineWidth = width * 3;
      ctx.beginPath();
      ctx.moveTo(curve.source.x, curve.source.y);
      ctx.quadraticCurveTo(controlX, controlY, curve.target.x, curve.target.y);
      ctx.stroke();
    }
    
    // Main link
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    
    if (isRelation) {
      const dashSize = Math.max(4, 6 / globalScale);
      const gapSize = Math.max(3, 4 / globalScale);
      ctx.setLineDash([dashSize, gapSize]);
    } else if (isPartial) {
      const dashSize = Math.max(3, 5 / globalScale);
      const gapSize = Math.max(2, 3 / globalScale);
      ctx.setLineDash([dashSize, gapSize]);
    } else {
      ctx.setLineDash([]);
    }
    
    ctx.beginPath();
    ctx.moveTo(curve.source.x, curve.source.y);
    ctx.quadraticCurveTo(controlX, controlY, curve.target.x, curve.target.y);
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
    
    const arrowX = (1-t)*(1-t)*curve.source.x + 2*(1-t)*t*controlX + t*t*curve.target.x;
    const arrowY = (1-t)*(1-t)*curve.source.y + 2*(1-t)*t*controlY + t*t*curve.target.y;
    
    // Arrow direction
    const t2 = Math.min(0.99, t + 0.02);
    const dirX = ((1-t2)*(1-t2)*curve.source.x + 2*(1-t2)*t2*controlX + t2*t2*curve.target.x) - arrowX;
    const dirY = ((1-t2)*(1-t2)*curve.source.y + 2*(1-t2)*t2*controlY + t2*t2*curve.target.y) - arrowY;
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
  }, [getLinkColor, getLinkWidth, highlightLinks, highlightNodes, graphNodes, getLinkCurvePoints, getNodeBaseSize]);

  const linkPointerAreaPaint = useCallback((link: any, color: string, ctx: CanvasRenderingContext2D) => {
    const curve = getLinkCurvePoints(link);
    if (!curve) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(8, getLinkWidth(link) + 6);
    ctx.beginPath();
    ctx.moveTo(curve.source.x, curve.source.y);
    ctx.quadraticCurveTo(curve.controlX, curve.controlY, curve.target.x, curve.target.y);
    ctx.stroke();
  }, [getLinkWidth, getLinkCurvePoints]);

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

    if (link.type === 'external') {
      return 0;
    }
    
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

    if (link.type === 'external') {
      return 0;
    }
    
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

  const canvasWidth = width && width > 0 ? width : undefined;
  const canvasHeight = height && height > 0 ? height : undefined;

  // DAG layout requires simulation ticks even when nodes already have positions.
  // In manual layout mode we keep the "no drift" behavior by stopping immediately.
  const dagLevelDistance = dagMode
    ? Math.round(260 + Math.min(160, Math.sqrt(graphNodes.length) * 16))
    : undefined;
  const alphaDecay = structuralChange || !!dagMode ? 0.015 : 1;
  const velocityDecay = dagMode ? 0.4 : 0.75;
  const warmupTicks = structuralChange ? 200 : 0;
  const dagCooldownTicks = dagMode ? Math.min(1200, Math.round(300 + Math.sqrt(graphNodes.length) * 90)) : 0;
  const cooldownTicks = Math.max(structuralChange ? 400 : 0, dagCooldownTicks);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={memoizedGraphData}
        width={canvasWidth}
        height={canvasHeight}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        dagMode={dagMode || undefined}
        dagLevelDistance={dagLevelDistance}
        onDagError={onDagError}
        nodeVal={node => {
          if (node.type === 'group') return 10;
          const base = node.type === 'definition'
            ? 8
            : (node.type === 'source' || node.type === 'quest')
              ? 7
              : 6;
          return base * (node.isDue ? 1.3 : 1);
        }}
        nodeCanvasObject={nodeCanvasObject}
        
        linkCanvasObject={linkCanvasObject}
        linkPointerAreaPaint={linkPointerAreaPaint}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature={0.1}
        
        linkDirectionalParticles={getDirectionalParticles}
        linkDirectionalParticleWidth={getDirectionalParticleWidth}
        linkDirectionalParticleSpeed={0.008}
        
        // Event handlers
        onNodeClick={(node, event) => onNodeClick(node as any, event as MouseEvent)}
        onNodeHover={(node) => onNodeHover(node as any)}
        onNodeDrag={(node) => onNodeDrag?.(node as any)}
        onNodeDragEnd={(node) => onNodeDragEnd(node as any)}
        onLinkClick={(link) => onLinkClick?.(link as any)}
        onNodeRightClick={(node, event) => onNodeRightClick?.(node as any, event as MouseEvent)}
        onLinkRightClick={(link, event) => onLinkRightClick?.(link as any, event as MouseEvent)}
        onBackgroundClick={(event) => onBackgroundClick?.(event as MouseEvent)}
        onEngineStop={handleEngineStop}
        
        // Physics simulation parameters
        // If we didn't trigger a structural reset (or all nodes are positioned),
        // keep alpha decay aggressive to avoid any drift.
        d3AlphaDecay={alphaDecay}
        d3VelocityDecay={velocityDecay}
        
        // Conditional simulation control based on structural changes
        warmupTicks={warmupTicks}
        cooldownTicks={cooldownTicks}
        
        // Node display settings
        nodeRelSize={1.2}
        nodeVisibility={(node: any) => isNodeVisible(node as GraphNode)}
        linkVisibility={(link: any) => isLinkVisible(link as GraphLink)}
        
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
    prevProps.selectedNodeIds === nextProps.selectedNodeIds &&
    prevProps.newlyCreatedNodeId === nextProps.newlyCreatedNodeId &&
    prevProps.labelDisplayMode === nextProps.labelDisplayMode &&
    prevProps.filteredNodeType === nextProps.filteredNodeType &&
    prevProps.mode === nextProps.mode &&
    prevProps.width === nextProps.width &&
    prevProps.height === nextProps.height &&
    prevProps.onNodeDrag === nextProps.onNodeDrag &&
    prevProps.onLinkClick === nextProps.onLinkClick &&
    prevProps.onNodeRightClick === nextProps.onNodeRightClick &&
    prevProps.onLinkRightClick === nextProps.onLinkRightClick &&
    prevProps.onBackgroundClick === nextProps.onBackgroundClick &&
    prevProps.creditFlowAnimations === nextProps.creditFlowAnimations &&
    prevProps.requiresPhysicsReset === nextProps.requiresPhysicsReset &&
    prevProps.structureVersion === nextProps.structureVersion &&
    prevProps.dagMode === nextProps.dagMode &&
    prevProps.onDagError === nextProps.onDagError
  );
});

GraphContainer.displayName = 'GraphContainer';

export default GraphContainer;
