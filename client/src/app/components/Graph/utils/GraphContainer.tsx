// GraphContainer.tsx - Refactored with a Stable, State-Decoupled LaTeX Renderer
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  graphRef: React.MutableRefObject<any>;
  creditFlowAnimations?: CreditFlowAnimation[];
}

const GraphContainer: React.FC<GraphContainerProps> = ({
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
  graphRef,
  creditFlowAnimations = [],
}) => {
  const nodePositions = useRef(new Map<string, {x: number, y: number}>());
  const lastNodeCountRef = useRef(0);
  const simulationStableRef = useRef(false);

  // Use a ref to hold the renderer instance. This decouples its lifecycle from React's state.
  const labelRendererRef = useRef(new LabelRenderer());
  // State to simply trigger re-renders when an async label is ready.
  const [_, setRenderTrigger] = useState(0);

  // Track node positions for credit flow overlay
  useEffect(() => {
    const newPositions = new Map<string, {x: number, y: number}>();
    graphNodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        newPositions.set(node.id, { x: node.x, y: node.y });
      }
    });
    nodePositions.current = newPositions;
  }, [graphNodes]);

  // Detect structural changes vs metadata changes
  const structuralChange = useMemo(() => {
    const currentNodeCount = graphNodes.length;
    const changed = currentNodeCount !== lastNodeCountRef.current;
    lastNodeCountRef.current = currentNodeCount;
    
    if (changed) {
      console.log(`Structural change detected: ${currentNodeCount} nodes`);
      simulationStableRef.current = false;
    }
    
    return changed;
  }, [graphNodes.length]);

  // Optimized node renderer with stable, high-quality LaTeX label support
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue, color } = node;
    const nodeSizeBase = type === 'definition' ? 7 : 6;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const isSelected = selectedNodeId === id;
    const isHighlighted = highlightNodes.has(id);

    // Use color from metadata if available, otherwise calculate
    let finalColor = color;
    if (!finalColor) {
      let baseColor;
      if (type === 'definition') {
        baseColor = node.isRootDefinition ? '#28a745' : '#007bff';
      } else {
        const difficultyColors = ['#66bb6a', '#9ccc65', '#d4e157', '#ffee58', '#ffa726', '#ff7043', '#ef5350'];
        let difficultyLevel = 2;
        if (node.difficulty) {
          const parsedDifficulty = parseInt(node.difficulty, 10);
          if (!isNaN(parsedDifficulty)) {
            difficultyLevel = Math.max(0, Math.min(6, parsedDifficulty - 1));
          }
        }
        baseColor = difficultyColors[difficultyLevel];
      }
      finalColor = status ? getSRSStatusColor(status) : baseColor;
    }

    // Selection highlight
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 5 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.6)';
      ctx.fill();
    } else if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 4 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(0, 123, 255, 0.4)';
      ctx.fill();
    }

    // Main node circle
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = finalColor;
    ctx.fill();
    
    ctx.strokeStyle = status ? 'rgba(0,0,0,0.5)' : (type === 'definition' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)');
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();

    // Due indicator with pulsing animation
    if (isDue) {
      const pulseRadius = nodeSize + 2.5 / globalScale;
      const pulseAlpha = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 250));
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 80, 80, ${pulseAlpha})`;
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();
    }

    // Node type icon
    if (globalScale > 1 && globalScale < 20) {
      const iconFontSize = Math.max(3, Math.min(nodeSize * 0.9, 12 / Math.sqrt(globalScale)));
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = `bold ${iconFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = Math.max(1, iconFontSize * 0.08);
      
      const text = type === 'definition' ? 'D' : 'E';
      ctx.fillText(text, x, y);
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // HIGH-QUALITY LABEL RENDERING
    const labelThreshold = 0.6;
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
        const cachedLabel = labelRendererRef.current.getCache(labelText);

        if (cachedLabel) {
          // Draw the cached high-quality image
          const { image, width, height } = cachedLabel;
          const scale = 1 / Math.sqrt(globalScale); // Adjust scale for zoom
          const labelWidth = width * scale;
          const labelHeight = height * scale;
          const labelOffset = nodeSize + 4 / globalScale; // Position below the node
          
          ctx.drawImage(
            image,
            x - labelWidth / 2,
            y + labelOffset,
            labelWidth,
            labelHeight
          );
        } else {
          // Request rendering, which happens async.
          // The callback will trigger a re-render once the image is ready.
          labelRendererRef.current.render(labelText, () => {
            // This callback is key. It updates a dummy state variable
            // to force the ForceGraph component to re-paint.
            setRenderTrigger(c => c + 1);
          });
          
          // Draw a placeholder while the real label is being rendered.
          const placeholderSize = 10 / globalScale;
          ctx.font = `${placeholderSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
          ctx.fillText('...', x, y + nodeSize + (10 / globalScale));
        }
      }
    }
  }, [selectedNodeId, highlightNodes, labelDisplayMode]);

  // Effect to manage the renderer's lifecycle.
  useEffect(() => {
    const renderer = labelRendererRef.current;

    // On structural change, clear the renderer's cache.
    if (structuralChange) {
      console.log("Structural change detected, clearing label cache.");
      renderer.clearCache();
    }

    return () => {
      // Final cleanup when the component unmounts.
      renderer.clearCache();
    };
  }, [structuralChange]);

  // Optimized link color calculation
  const getLinkColor = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) return 'rgba(245, 158, 11, 0.9)';
    
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
  }, [graphNodes, highlightLinks]);

  // Optimized link width calculation
  const getLinkWidth = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    const weight = link.weight || 1.0;
    
    let baseWidth = 1.0;
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') baseWidth = 1.8;
    
    const minWidthRatio = 0.3;
    const scaledWidth = baseWidth * (minWidthRatio + (1 - minWidthRatio) * weight);
    
    return highlightLinks.has(linkId) ? Math.max(3, scaledWidth * 2) : scaledWidth;
  }, [graphNodes, highlightLinks]);

  // Stable link curvature
  const getLinkCurvature = useCallback(() => 0.1, []);

  // Optimized link renderer (keeping existing implementation)
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
    const isPartial = weight < 1.0;
    
    const color = getLinkColor(link);
    const width = getLinkWidth(link) / globalScale;
    
    // Calculate curve parameters
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    const targetNode = graphNodes.find(n => n.id === targetId);
    const targetNodeSize = (targetNode?.type === 'definition' ? 7 : 6) / Math.sqrt(globalScale);
    
    // Curve control point
    const curvature = 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / distance * curvature * distance;
    const perpY = dx / distance * curvature * distance;
    const controlX = midX + perpX;
    const controlY = midY + perpY;
    
    // Draw link
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
    
    // Draw arrow
    const arrowLength = 8 / Math.sqrt(globalScale);
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
      const fontSize = Math.max(8, 9 / globalScale);
      ctx.font = `${fontSize}px Sans-Serif`;
      const text = weight.toFixed(2);
      const textMetrics = ctx.measureText(text);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(
        controlX - textMetrics.width / 2 - 2,
        controlY - fontSize / 2 - 1,
        textMetrics.width + 4,
        fontSize + 2
      );
      
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, controlX, controlY);
    }
  }, [getLinkColor, getLinkWidth, highlightLinks, graphNodes]);

  // Simulation stability tracking
  const handleEngineStop = useCallback(() => {
    simulationStableRef.current = true;
    console.log('Graph simulation stabilized');
  }, []);

  // Memoized graph data to prevent unnecessary re-renders
  const memoizedGraphData = useMemo(() => {
    return { nodes: graphNodes, links: graphLinks };
  }, [graphNodes, graphLinks]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={memoizedGraphData}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeVal={node => (node.type === 'definition' ? 8 : 6) * (node.isDue ? 1.2 : 1)}
        nodeCanvasObject={nodeCanvasObject}
        
        linkCanvasObject={linkCanvasObject}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature={getLinkCurvature}
        
        // Optimized directional particles
        linkDirectionalParticles={link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
          const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
          const linkId = `${sourceId}-${targetId}`;
          return highlightLinks.has(linkId) ? 3 : 0;
        }}
        linkDirectionalParticleWidth={link => {
          const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
          const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
          const linkId = `${sourceId}-${targetId}`;
          return highlightLinks.has(linkId) ? 3 : 0;
        }}
        linkDirectionalParticleSpeed={0.01}
        
        // Event handlers
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onNodeDragEnd={onNodeDragEnd}
        onEngineStop={handleEngineStop}
        
        // OPTIMIZED SIMULATION PARAMETERS FOR STABILITY
        d3AlphaDecay={0.02}        // Slower decay for natural stabilization
        d3VelocityDecay={0.7}      // Higher decay for stability
        
        // CRITICAL: Conditional simulation control
        warmupTicks={structuralChange ? 150 : 0}     // Only warmup on structural changes
        cooldownTicks={structuralChange ? 300 : 0}   // Only cooldown on structural changes
        
        // Node sizing and visibility
        nodeRelSize={1}
        nodeVisibility={(node: GraphNode) => 
          filteredNodeType === 'all' || 
          node.type === filteredNodeType || 
          selectedNodeId === node.id || 
          highlightNodes.has(node.id)
        }
        
        // Interaction controls
        enableNodeDrag={true}
        enableZoomPanInteraction={true}
        enablePointerInteraction={true}
        
        // Performance optimizations
        autoPauseRedraw={false}
        minZoom={0.1}
        maxZoom={8}
      />
      
      {/* Credit Flow Overlay */}
      <CreditFlowOverlay 
        animations={creditFlowAnimations} 
        nodePositions={nodePositions.current}
        graphRef={graphRef} 
      />
    </div>
  );
};

export default GraphContainer;
