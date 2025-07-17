// client/src/app/components/Graph/utils/GraphContainer.tsx
// Enhanced with improved highlighting and credit flow animations

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
  const labelRendererRef = useRef(new LabelRenderer());
  const [_, setRenderTrigger] = useState(0);

  // Enhanced position tracking for credit flow overlay
  useEffect(() => {
    const newPositions = new Map<string, {x: number, y: number}>();
    graphNodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        newPositions.set(node.id, { x: node.x, y: node.y });
      }
    });
    nodePositions.current = newPositions;
  }, [graphNodes]);

  // Enhanced structural change detection
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

  // Enhanced node renderer with better highlighting and visual effects
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue, color } = node;
    const nodeSizeBase = type === 'definition' ? 7 : 6;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const isSelected = selectedNodeId === id;
    const isHighlighted = highlightNodes.has(id);

    // Enhanced color calculation with better highlighting
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

    // Enhanced selection highlight with multiple highlight types
    if (isSelected) {
      // Orange selection highlight (highest priority)
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 8 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.8)';
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
    } else if (isHighlighted) {
      // Blue highlight for various highlight types
      const highlightIntensity = highlightNodes.size > 10 ? 0.3 : 0.5; // Reduce intensity for many highlights
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 6 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = `rgba(0, 123, 255, ${highlightIntensity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(0, 123, 255, ${highlightIntensity + 0.3})`;
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    // Enhanced main node circle with better border
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = finalColor;
    ctx.fill();
    
    // Enhanced border based on state
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

    // Enhanced due indicator with better animation
    if (isDue) {
      const time = Date.now();
      const pulseRadius = nodeSize + 2.5 / globalScale;
      const pulseAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time / 400)); // Slower, more visible pulse
      
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 80, 80, ${pulseAlpha})`;
      ctx.lineWidth = 3 / globalScale;
      ctx.stroke();
      
      // Add a secondary pulse ring
      const secondaryPulse = nodeSize + 4 / globalScale;
      const secondaryAlpha = 0.2 + 0.4 * Math.abs(Math.sin(time / 600));
      ctx.beginPath();
      ctx.arc(x, y, secondaryPulse, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 120, 120, ${secondaryAlpha})`;
      ctx.lineWidth = 1.5 / globalScale;
      ctx.stroke();
    }

    // Enhanced node type icon with better visibility
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

    // Enhanced label rendering with better highlighting awareness
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
          const { image, width, height } = cachedLabel;
          const scale = 1 / Math.sqrt(globalScale);
          const labelWidth = width * scale;
          const labelHeight = height * scale;
          const labelOffset = nodeSize + 6 / globalScale;
          
          // Simple label rendering without glow effects
          
          ctx.drawImage(
            image,
            x - labelWidth / 2,
            y + labelOffset,
            labelWidth,
            labelHeight
          );
        } else {
          labelRendererRef.current.render(labelText, () => {
            setRenderTrigger(c => c + 1);
          });
          
          // Simple placeholder without highlighting effects
          const placeholderSize = 12 / globalScale;
          ctx.font = `${placeholderSize}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillText('...', x, y + nodeSize + (12 / globalScale));
        }
      }
    }
  }, [selectedNodeId, highlightNodes, labelDisplayMode]);

  // Enhanced cache management
  useEffect(() => {
    const renderer = labelRendererRef.current;

    if (structuralChange) {
      console.log("Structural change detected, clearing label cache.");
      renderer.clearCache();
    }

    return () => {
      renderer.clearCache();
    };
  }, [structuralChange]);

  // Enhanced link color calculation with better highlighting
  const getLinkColor = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 'rgba(245, 158, 11, 0.9)'; // Bright highlight
    }
    
    // Enhanced highlighting for connected nodes
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

  // Enhanced link width calculation
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
    
    // Enhanced width for highlighted links
    if (highlightLinks.has(linkId)) {
      return Math.max(3, scaledWidth * 2.5);
    }
    
    // Enhanced width for connected highlighted nodes
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      return Math.max(scaledWidth, scaledWidth * 1.5);
    }
    
    return scaledWidth;
  }, [graphNodes, highlightLinks, highlightNodes]);

  // Enhanced link renderer with better visual effects
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
    
    // Calculate curve parameters
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    const targetNode = graphNodes.find(n => n.id === targetId);
    const targetNodeSize = (targetNode?.type === 'definition' ? 7 : 6) / Math.sqrt(globalScale);
    
    // Enhanced curve control point
    const curvature = 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / distance * curvature * distance;
    const perpY = dx / distance * curvature * distance;
    const controlX = midX + perpX;
    const controlY = midY + perpY;
    
    // Enhanced link rendering with glow effect for highlights
    if (isHighlighted || isConnectedHighlighted) {
      // Draw glow effect
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
    
    // Enhanced arrow with better visibility
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
    
    // Enhanced weight label for partial prerequisites
    if (isPartial && globalScale > 0.6 && distance > 40) {
      const fontSize = Math.max(8, 10 / globalScale);
      ctx.font = `${fontSize}px Sans-Serif`;
      const text = weight.toFixed(2);
      const textMetrics = ctx.measureText(text);
      
      // Simple weight label without glow effects
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

  // Enhanced simulation stability tracking
  const handleEngineStop = useCallback(() => {
    simulationStableRef.current = true;
    console.log('Graph simulation stabilized');
  }, []);

  // Enhanced graph data memoization
  const memoizedGraphData = useMemo(() => {
    return { nodes: graphNodes, links: graphLinks };
  }, [graphNodes, graphLinks]);

  // Enhanced directional particles with better visibility
  const getDirectionalParticles = useCallback((link: any) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : String(link.source);
    const targetId = typeof link.target === 'object' ? link.target.id : String(link.target);
    const linkId = `${sourceId}-${targetId}`;
    
    if (highlightLinks.has(linkId)) {
      return 4; // More particles for highlighted links
    }
    
    const sourceHighlighted = highlightNodes.has(sourceId);
    const targetHighlighted = highlightNodes.has(targetId);
    
    if (sourceHighlighted || targetHighlighted) {
      return 2; // Some particles for connected highlighted nodes
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
        
        // Enhanced directional particles
        linkDirectionalParticles={getDirectionalParticles}
        linkDirectionalParticleWidth={getDirectionalParticleWidth}
        linkDirectionalParticleSpeed={0.008} // Slightly slower for better visibility
        
        // Event handlers
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onNodeDragEnd={onNodeDragEnd}
        onEngineStop={handleEngineStop}
        
        // Enhanced simulation parameters
        d3AlphaDecay={0.015}       // Slower decay for better stability
        d3VelocityDecay={0.75}     // Higher decay for quicker settling
        
        // Conditional simulation control
        warmupTicks={structuralChange ? 200 : 0}
        cooldownTicks={structuralChange ? 400 : 0}
        
        // Node sizing and visibility
        nodeRelSize={1.2} // Slightly larger for better visibility
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
      
      {/* Enhanced Credit Flow Overlay */}
      <CreditFlowOverlay 
        animations={creditFlowAnimations} 
        nodePositions={nodePositions.current}
        graphRef={graphRef} 
      />
    </div>
  );
};

export default GraphContainer;
