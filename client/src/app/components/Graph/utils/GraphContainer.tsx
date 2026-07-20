// client/src/app/components/Graph/utils/GraphContainer.tsx
// Refactored as pure renderer with fine-grained reactivity

"use client";

import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ForceGraphMethods, NodeObject, LinkObject } from 'react-force-graph-2d';
import { AppMode, GraphNode, GraphLink, FilteredNodeType } from './types';
import { getStatusColor as getSRSStatusColor } from '@/lib/srs-api';
import { CreditFlowAnimation } from '@/types/srs';
import CreditFlowOverlay from '../components/CreditFlowOverlay';
import { LabelRenderer } from './HybridLatexRenderer';
import { MATHJAX_READY_EVENT } from '@/app/components/core/mathjaxReady';
import { escapeNodeIdTooltip, formatNodeIdForDisplay } from './nodeIdDisplay';
import * as d3 from 'd3';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

const NEW_NODE_HIGHLIGHT_COLOR = '236, 72, 153';
const SELECTED_HIGHLIGHT_COLOR = '139, 92, 246';
const HOVER_HIGHLIGHT_COLOR = '14, 165, 233';
const NODE_CONTENT_SIZE_RATIO = 1.3;
const NODE_CONTENT_VERTICAL_OFFSET_RATIO = 0.06;
const LABEL_SIZE_BASE_SCALE = 1;
const LABEL_FADE_START_SCALE = 0.5;
const LABEL_FADE_END_SCALE = 0.3;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export type LabelDisplayMode = 'off' | 'codes' | 'names';
export type LabelBackgroundMode = 'off' | 'behind_links' | 'behind_text';

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
  labelBackgroundMode?: LabelBackgroundMode;
  nodeTagFontScale?: number;
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
  isNightMode?: boolean;
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
  labelBackgroundMode = 'behind_links',
  nodeTagFontScale = 1,
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
  isNightMode = false,
}) => {
  // Position tracking and incremental repaint scheduling
  const nodePositions = useRef(new Map<string, {x: number, y: number}>());
  const lastNodeCountRef = useRef(0);
  const simulationStableRef = useRef(false);
  const labelRendererRef = useRef(new LabelRenderer());
  const rafRefreshRef = useRef<number | null>(null);
  const prewarmKeyRef = useRef<string>('');
  const [graphInstanceNonce, setGraphInstanceNonce] = useState(0);
  const graphRefPropRef = useRef(graphRef);
  graphRefPropRef.current = graphRef;
  const lastGraphInstanceRef = useRef<ForceGraphMethods<NodeObject, LinkObject> | null>(null);
  const graphInstanceRef = useMemo<React.MutableRefObject<ForceGraphMethods<NodeObject, LinkObject> | undefined>>(() => {
    // `react-force-graph-2d` is loaded via `next/dynamic`, so the instance can
    // mount later without re-rendering this component. Use a ref object with a
    // setter to mirror the instance into the shared `graphRef` immediately.
    let current: ForceGraphMethods<NodeObject, LinkObject> | undefined;
    return {
      get current() {
        return current;
      },
      set current(instance) {
        const next = instance ?? undefined;
        current = next;

        const sharedGraphRef = graphRefPropRef.current;
        if (next && next !== lastGraphInstanceRef.current) {
          lastGraphInstanceRef.current = next;
          sharedGraphRef.current = next as any;
          setGraphInstanceNonce(n => n + 1);
        } else if (!next && lastGraphInstanceRef.current) {
          lastGraphInstanceRef.current = null;
          if (sharedGraphRef.current) sharedGraphRef.current = null;
        }
      }
    };
  }, []);

  const graphTheme = useMemo(() => {
    if (!isNightMode) {
      return {
        canvasBackground: '#f9fafb',
        labelText: '#333333',
        labelBackgroundFill: 'rgba(255, 255, 255, 0.95)',
        labelBackgroundStroke: 'rgba(0, 0, 0, 0.12)',
        fallbackLabelText: '#1f2937',
        relationLink: 'rgba(31, 41, 55, 0.55)',
        defaultLink: 'rgba(120, 120, 120, 0.25)',
        weightedLinkLow: 'rgba(100, 120, 180, 0.25)',
        highlightedLink: 'rgba(0, 123, 255, 0.8)',
        exerciseLink: 'rgba(255, 69, 0, 0.3)',
        weightLabelBackground: 'rgba(255, 255, 255, 0.95)',
        weightLabelText: '#333333',
        nodeBorder: {
          group: 'rgba(15, 23, 42, 0.85)',
          defaultStrong: 'rgba(0, 0, 0, 0.5)',
          definition: 'rgba(0, 0, 0, 0.3)',
          exercise: 'rgba(0, 0, 0, 0.4)',
          sourceQuest: 'rgba(0,0,0,0.25)',
        },
      };
    }

    return {
      canvasBackground: '#020617',
      labelText: '#e5e7eb',
      labelBackgroundFill: 'rgba(15, 23, 42, 0.92)',
      labelBackgroundStroke: 'rgba(148, 163, 184, 0.45)',
      fallbackLabelText: '#e2e8f0',
      relationLink: 'rgba(148, 163, 184, 0.75)',
      defaultLink: 'rgba(148, 163, 184, 0.45)',
      weightedLinkLow: 'rgba(125, 211, 252, 0.45)',
      highlightedLink: 'rgba(125, 211, 252, 0.9)',
      exerciseLink: 'rgba(251, 146, 60, 0.6)',
      weightLabelBackground: 'rgba(15, 23, 42, 0.92)',
      weightLabelText: '#f8fafc',
      nodeBorder: {
        group: 'rgba(226, 232, 240, 0.95)',
        defaultStrong: 'rgba(248, 250, 252, 0.65)',
        definition: 'rgba(226, 232, 240, 0.45)',
        exercise: 'rgba(226, 232, 240, 0.55)',
        sourceQuest: 'rgba(226, 232, 240, 0.45)',
      },
    };
  }, [isNightMode]);

  const scheduleRafRefresh = useCallback(() => {
    if (rafRefreshRef.current != null) return;
    rafRefreshRef.current = requestAnimationFrame(() => {
      rafRefreshRef.current = null;
      try { graphRef.current?.refresh?.(); } catch {}
    });
  }, [graphRef]);

  // If any TeX labels were rendered before MathJax finished initializing, clear just
  // those cached images so they are re-rendered with proper typesetting.
  useEffect(() => {
    const onMathJaxReady = () => {
      labelRendererRef.current.invalidateMathLabels();
      scheduleRafRefresh();
    };
    window.addEventListener(MATHJAX_READY_EVENT, onMathJaxReady);
    return () => window.removeEventListener(MATHJAX_READY_EVENT, onMathJaxReady);
  }, [scheduleRafRefresh]);

  useEffect(() => {
    const renderer = labelRendererRef.current;
    renderer.setTheme({
      textColor: graphTheme.labelText,
      backgroundFill: graphTheme.labelBackgroundFill,
      backgroundStroke: graphTheme.labelBackgroundStroke,
      fallbackTextColor: graphTheme.fallbackLabelText,
    });
    renderer.clearCache();
    scheduleRafRefresh();
  }, [
    graphTheme.labelBackgroundStroke,
    graphTheme.fallbackLabelText,
    graphTheme.labelBackgroundFill,
    graphTheme.labelText,
    scheduleRafRefresh,
  ]);

  useEffect(() => {
    scheduleRafRefresh();
  }, [nodeTagFontScale, scheduleRafRefresh]);

  // Pre-warm label cache to avoid first-hover flicker
  // We derive a coarse key from label mode + node set identity (length + edge ids)
  const prewarmKey = useMemo(() => {
    const first = graphNodes[0]?.id || '';
    const last = graphNodes[graphNodes.length - 1]?.id || '';
    return `${labelDisplayMode}|${graphNodes.length}|${first}|${last}|${nodeTagFontScale.toFixed(3)}`;
  }, [graphNodes, labelDisplayMode, nodeTagFontScale]);

  if (prewarmKeyRef.current !== prewarmKey) {
    prewarmKeyRef.current = prewarmKey;
    const renderer = labelRendererRef.current;
    // Prewarm up to a budget to keep app responsive; renderer enforces concurrency
    const BUDGET = Math.min(300, graphNodes.length);
    for (let i = 0; i < BUDGET; i++) {
      const n = graphNodes[i];
      if (!n) break;
      const fullDisplayId = (n as GraphNode).displayId ?? n.id;
      const displayId = n.type === 'group' || n.isExternal
        ? fullDisplayId
        : formatNodeIdForDisplay(fullDisplayId);
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

  // Memoized graph data to prevent unnecessary re-renders.
  // `useStableGraph` preserves node/link array identity for metadata-only updates,
  // so we key this on `structureVersion` to force ForceGraph to rebuild pointer
  // hit maps when topology changes (new node/link insertions).
  const memoizedGraphData = useMemo(() => {
    void structureVersion;
    console.log(`GraphContainer: Creating graph data with ${graphNodes.length} nodes, ${graphLinks.length} links`);
    return { nodes: graphNodes, links: graphLinks };
  }, [graphNodes, graphLinks, structureVersion]);

  // Derive node positions map without effects (consumed by overlay on animation creation)
  const computedNodePositions = useMemo(() => {
    void structureVersion;
    const map = new Map<string, { x: number; y: number }>();
    graphNodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        map.set(node.id, { x: node.x, y: node.y });
      }
    });
    // Keep ref in sync for any internal access while avoiding effects
    nodePositions.current = map;
    return map;
  }, [graphNodes, structureVersion]);

  const nodeById = useMemo(() => {
    void structureVersion;
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
  }, [requiresPhysicsReset, graphNodes]);

  useEffect(() => {
    const labelRenderer = labelRendererRef.current;
    return () => {
      if (rafRefreshRef.current != null) {
        cancelAnimationFrame(rafRefreshRef.current);
      }
      labelRenderer.clearCache();
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
  }, [dagMode, graphNodes.length, labelDisplayMode, structureVersion, graphInstanceNonce, graphRef]);

  // Memoized node renderer for better performance

  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue, color } = node;
    const fullDisplayId = (node as GraphNode).displayId ?? id;
    const displayId = type === 'group' || (node as GraphNode).isExternal
      ? fullDisplayId
      : formatNodeIdForDisplay(fullDisplayId);
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
        baseColor = isNightMode ? '#cbd5e1' : '#111827';
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
        ctx.strokeStyle = graphTheme.nodeBorder.group;
        ctx.lineWidth = 1.5 / globalScale;
      } else if (isExternal) {
        ctx.strokeStyle = externalStatus && externalStatus !== 'ok' ? 'rgba(248, 113, 113, 0.85)' : 'rgba(148, 163, 184, 0.65)';
        ctx.lineWidth = 1 / globalScale;
      } else {
        if (type === 'source' || type === 'quest') {
          ctx.strokeStyle = graphTheme.nodeBorder.sourceQuest;
        } else {
          ctx.strokeStyle = status
            ? graphTheme.nodeBorder.defaultStrong
            : (type === 'definition' ? graphTheme.nodeBorder.definition : graphTheme.nodeBorder.exercise);
        }
        ctx.lineWidth = 1 / globalScale;
      }
    }
    ctx.stroke();

    // Due indicator animation
    if (isDue && !isGroup) {
      const time = Date.now();
      const isQuestDue = type === 'quest';
      if (isQuestDue) {
        const glowRadius = nodeSize + 8 / globalScale;
        const glowAlpha = 0.14 + 0.14 * Math.abs(Math.sin(time / 420));
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI, false);
        ctx.fillStyle = `rgba(239, 68, 68, ${glowAlpha})`;
        ctx.fill();

        const pulseRadius = nodeSize + 4 / globalScale;
        const pulseAlpha = 0.45 + 0.45 * Math.abs(Math.sin(time / 320));
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
        ctx.strokeStyle = `rgba(239, 68, 68, ${pulseAlpha})`;
        ctx.lineWidth = 2.4 / globalScale;
        ctx.stroke();

        const outerRadius = nodeSize + 9 / globalScale;
        const outerAlpha = 0.2 + 0.3 * Math.abs(Math.sin(time / 540));
        ctx.beginPath();
        ctx.arc(x, y, outerRadius, 0, 2 * Math.PI, false);
        ctx.strokeStyle = `rgba(248, 113, 113, ${outerAlpha})`;
        ctx.lineWidth = 1.8 / globalScale;
        ctx.stroke();
      } else {
        const isGraspedDue = status === 'grasped';
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
    }

    // Node type icon: keep a constant ratio with node radius across zoom levels.
    const nodeScreenRadius = nodeSize * globalScale;
    if (globalScale < 20 && nodeScreenRadius >= 5) {
      const iconFontSize = nodeSize * NODE_CONTENT_SIZE_RATIO;
      
      ctx.fillStyle = isHighlighted ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.95)';
      ctx.font = `bold ${iconFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = iconFontSize * 0.1;
      
      const text = type === 'definition'
        ? 'D'
        : type === 'exercise'
          ? 'E'
          : type === 'source'
            ? 'S'
            : type === 'quest'
              ? 'Q'
              : 'G';
      ctx.fillText(text, x, y + iconFontSize * NODE_CONTENT_VERTICAL_OFFSET_RATIO);
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Label rendering with caching
    const isLabelForcedVisible = isSelected || isHighlighted || isNewlyCreated;
    const baseLabelOpacity =
      labelDisplayMode === 'off'
        ? 0
        : globalScale >= LABEL_FADE_START_SCALE
          ? 1
          : globalScale <= LABEL_FADE_END_SCALE
            ? 0
            : (globalScale - LABEL_FADE_END_SCALE) / (LABEL_FADE_START_SCALE - LABEL_FADE_END_SCALE);
    const labelOpacity = isLabelForcedVisible ? 1 : clamp01(baseLabelOpacity);
    const shouldShowLabel = (labelDisplayMode !== 'off' && labelOpacity > 0) || isLabelForcedVisible;

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
          const scale = (1 / Math.sqrt(globalScale)) * (nodeTagFontScale / LABEL_SIZE_BASE_SCALE);
          const labelWidth = width * scale;
          const labelHeight = height * scale;
          const labelOffset = nodeSize + 6 / globalScale;

          ctx.save();
          ctx.globalAlpha = labelOpacity;

          if (labelBackgroundMode !== 'off') {
            const bg = labelRendererRef.current.getLabelBackground(width, height);
            ctx.save();
            if (labelBackgroundMode === 'behind_links') {
              // Draw behind the already-painted scene (including links), but keep
              // text above links.
              ctx.globalCompositeOperation = 'destination-over';
            }
            ctx.drawImage(
              bg.source,
              x - labelWidth / 2,
              y + labelOffset,
              labelWidth,
              labelHeight
            );
            ctx.restore();
          }

          ctx.drawImage(
            image,
            x - labelWidth / 2,
            y + labelOffset,
            labelWidth,
            labelHeight
          );
          ctx.restore();
        } else {
          // Request render; on completion schedule a single RAF-based refresh
          labelRendererRef.current.render(labelText, scheduleRafRefresh);
          // No placeholder to avoid noticeable flicker; label will appear when ready
        }
      }
    }
  }, [selectedNodeIds, newlyCreatedNodeId, highlightNodes, labelDisplayMode, labelBackgroundMode, scheduleRafRefresh, getNodeBaseSize, graphTheme, isNightMode, nodeTagFontScale]);

  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0;
    const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0;
    const safeScale = Math.max(globalScale, 1e-3);
    const baseRadius = getNodeBaseSize(node.type) / Math.sqrt(safeScale);
    const isSelected = selectedNodeIds.has(node.id);
    const isNewlyCreated = newlyCreatedNodeId === node.id;
    const isHighlighted = highlightNodes.has(node.id);
    const isDue = Boolean(node.isDue) && node.type !== 'group';
    const isQuestDue = isDue && node.type === 'quest';

    // Keep pointer hit area aligned with visible node rings and ensure a minimum
    // clickable target when zoomed out.
    let radius = baseRadius;
    if (isDue) radius = Math.max(radius, baseRadius + (isQuestDue ? 9 : 6) / safeScale);
    if (isHighlighted) radius = Math.max(radius, baseRadius + 6 / safeScale);
    if (isSelected) radius = Math.max(radius, baseRadius + 8 / safeScale);
    if (isNewlyCreated) radius = Math.max(radius, baseRadius + 10 / safeScale);

    const minScreenRadiusPx = 5;
    const minGraphRadius = minScreenRadiusPx / safeScale;
    const hitRadius = Math.max(radius, minGraphRadius);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, hitRadius, 0, 2 * Math.PI, false);
    ctx.fill();
  }, [getNodeBaseSize, selectedNodeIds, newlyCreatedNodeId, highlightNodes]);

  // Memoized link color calculation
  const getLinkColor = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 'rgba(245, 158, 11, 0.9)';
    }

    if (link.type === 'relation') return graphTheme.relationLink;

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
      if (isNightMode) return `rgba(125, 211, 252, ${opacity})`;
      return `rgba(0, 123, 255, ${opacity})`;
    }
    
    const targetNode = graphNodes.find(n => n.id === targetId);
    const weight = link.weight || 1.0;
    
    if (targetNode?.type === 'exercise') {
      const minOpacity = 0.3;
      const maxOpacity = 0.8;
      const opacity = minOpacity + (maxOpacity - minOpacity) * weight;
      if (isNightMode) return `rgba(251, 146, 60, ${opacity})`;
      return `rgba(255, 69, 0, ${opacity})`;
    }
    
    const minOpacity = 0.25;
    const maxOpacity = 0.7;
    const opacity = minOpacity + (maxOpacity - minOpacity) * weight;
    
    if (weight < 1.0) {
      if (isNightMode) return `rgba(125, 211, 252, ${opacity})`;
      return `rgba(100, 120, 180, ${opacity})`;
    } else {
      if (isNightMode) return `rgba(148, 163, 184, ${opacity})`;
      return `rgba(120, 120, 120, ${opacity})`;
    }
  }, [graphNodes, graphTheme.relationLink, highlightLinks, highlightNodes, isNightMode]);

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
      
      ctx.fillStyle = graphTheme.weightLabelBackground;
      ctx.fillRect(
        controlX - textMetrics.width / 2 - 3,
        controlY - fontSize / 2 - 2,
        textMetrics.width + 6,
        fontSize + 4
      );
      
      ctx.fillStyle = graphTheme.weightLabelText;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, controlX, controlY);
    }
  }, [getLinkColor, getLinkWidth, highlightLinks, highlightNodes, graphNodes, getLinkCurvePoints, getNodeBaseSize, graphTheme.weightLabelBackground, graphTheme.weightLabelText]);

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
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: graphTheme.canvasBackground }}>
      <ForceGraph2D
        ref={graphInstanceRef}
        graphData={memoizedGraphData}
        width={canvasWidth}
        height={canvasHeight}
        nodeId="id"
        nodeLabel={(node: any) => escapeNodeIdTooltip(String((node as GraphNode).displayId ?? node.id))}
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
        nodePointerAreaPaint={nodePointerAreaPaint}
        
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
    prevProps.labelBackgroundMode === nextProps.labelBackgroundMode &&
    prevProps.nodeTagFontScale === nextProps.nodeTagFontScale &&
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
    prevProps.onDagError === nextProps.onDagError &&
    prevProps.isNightMode === nextProps.isNightMode
  );
});

GraphContainer.displayName = 'GraphContainer';

export default GraphContainer;
