// File: ./src/app/components/Graph/utils/GraphContainer.tsx
"use client";

import React, { useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { GraphNode, GraphLink, FilteredNodeType } from './types';
import { getStatusColor as getSRSStatusColor } from '@/lib/srs-api';
import { CreditFlowAnimation } from '@/types/srs';
import CreditFlowOverlay from '../components/CreditFlowOverlay';

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

  useEffect(() => {
    const newPositions = new Map<string, {x: number, y: number}>();
    graphNodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        newPositions.set(node.id, { x: node.x, y: node.y });
      }
    });
    nodePositions.current = newPositions;
  }, [graphNodes]);

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0, status, isDue } = node;
    const nodeSizeBase = type === 'definition' ? 7 : 6;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const labelOffset = nodeSize + 4 / globalScale;
    const fontSize = Math.max(5, 12 / globalScale);
    const isSelected = selectedNodeId === id;
    const isHighlighted = highlightNodes.has(id);

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
    
    const srsColor = status ? getSRSStatusColor(status) : baseColor;

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

    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = srsColor;
    ctx.fill();
    
    ctx.strokeStyle = status ? 'rgba(0,0,0,0.5)' : (type === 'definition' ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.4)');
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();

    if (isDue) {
      const pulseRadius = nodeSize + 2.5 / globalScale;
      const pulseAlpha = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 250));
      ctx.beginPath();
      ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI, false);
      ctx.strokeStyle = `rgba(255, 80, 80, ${pulseAlpha})`;
      ctx.lineWidth = 2.5 / globalScale;
      ctx.stroke();

      const iconSize = nodeSize * 0.6;
      const iconX = x + nodeSize * 0.5;
      const iconY = y - nodeSize * 0.5;

      ctx.beginPath();
      ctx.arc(iconX, iconY, iconSize / 2, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(50, 50, 50, 0.9)';
      ctx.lineWidth = 0.5 / globalScale;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(iconX, iconY);
      ctx.lineTo(iconX, iconY - iconSize * 0.35);
      ctx.moveTo(iconX, iconY);
      ctx.lineTo(iconX + iconSize * 0.25, iconY + iconSize * 0.1);
      ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
      ctx.lineWidth = 0.7 / globalScale;
      ctx.stroke();
    }

    // Add node type icon/symbol
    if (globalScale > 1 && globalScale < 20) {
      const visualNodeSize = nodeSize * globalScale;
      const fontSize = Math.max(
        3,
        Math.min(
          visualNodeSize * 0.9,
          nodeSize * 0.9
        )
      );
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = Math.max(1, fontSize * 0.08);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      const text = type === 'definition' ? 'D' : 'E';
      ctx.fillText(text, x, y);
      
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

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
        ctx.font = `${fontSize}px Sans-Serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textMetrics = ctx.measureText(labelText);
        const textWidth = textMetrics.width;
        const textHeight = fontSize;

        ctx.fillStyle = 'rgba(243, 244, 246, 0.85)';
        ctx.fillRect(x - textWidth / 2 - 2/globalScale, y + labelOffset - 1/globalScale, textWidth + 4/globalScale, textHeight + 2/globalScale);

        ctx.fillStyle = '#333';
        const truncatedLabel = labelText.length > 25 ? labelText.substring(0, 22) + '...' : labelText;
        ctx.fillText(truncatedLabel, x, y + labelOffset + textHeight / 2);
      }
    }
  }, [selectedNodeId, highlightNodes, labelDisplayMode]);

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

  const getLinkCurvature = useCallback((link: GraphLink) => {
    return 0.1;
  }, []);

  // Custom link renderer with FIXED ARROW SIZE AND POSITIONING
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { source, target, weight = 1.0 } = link;
    
    if (!source || !target || typeof source.x !== 'number' || typeof source.y !== 'number' || 
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
    
    // Calculate curve path
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    // Get target node size for arrow positioning
    const targetNode = graphNodes.find(n => n.id === targetId);
    const targetNodeSize = (targetNode?.type === 'definition' ? 7 : 6) / Math.sqrt(globalScale);
    
    // Calculate curve control point
    const curvature = 0.1;
    const midX = (source.x + target.x) / 2;
    const midY = (source.y + target.y) / 2;
    const perpX = -dy / distance * curvature * distance;
    const perpY = dx / distance * curvature * distance;
    const controlX = midX + perpX;
    const controlY = midY + perpY;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    
    if (isPartial) {
      const dashSize = Math.max(3, 5 / globalScale);
      const gapSize = Math.max(2, 3 / globalScale);
      ctx.setLineDash([dashSize, gapSize]);
    } else {
      ctx.setLineDash([]);
    }
    
    // Draw curved path
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.quadraticCurveTo(controlX, controlY, target.x, target.y);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // FIXED: Improved arrow size and positioning
    // Arrow should be larger and closer to the target node
    const arrowLength = Math.max(12 / globalScale, Math.min(25 / globalScale, distance * 0.15)); // Larger arrow
    const arrowAngle = Math.PI / 6;
    
    // Position arrow much closer to target node (95% instead of 85%)
    // Calculate point on curve that's exactly targetNodeSize distance from target center
    const nodeRadius = targetNodeSize + 2 / globalScale; // Small buffer
    const distanceFromTarget = nodeRadius;
    
    // Find the parameter t where the curve is distanceFromTarget away from target
    let t = 0.95; // Start close to target
    let iterations = 0;
    const maxIterations = 10;
    
    while (iterations < maxIterations) {
      const curveX = (1-t)*(1-t)*source.x + 2*(1-t)*t*controlX + t*t*target.x;
      const curveY = (1-t)*(1-t)*source.y + 2*(1-t)*t*controlY + t*t*target.y;
      const distToCurve = Math.sqrt((target.x - curveX)**2 + (target.y - curveY)**2);
      
      if (Math.abs(distToCurve - distanceFromTarget) < 1) break;
      
      if (distToCurve > distanceFromTarget) {
        t += 0.01;
      } else {
        t -= 0.01;
      }
      
      t = Math.max(0.5, Math.min(0.98, t)); // Keep t in reasonable range
      iterations++;
    }
    
    const arrowX = (1-t)*(1-t)*source.x + 2*(1-t)*t*controlX + t*t*target.x;
    const arrowY = (1-t)*(1-t)*source.y + 2*(1-t)*t*controlY + t*t*target.y;
    
    // Calculate arrow direction using tangent at the arrow position
    const t2 = Math.min(0.99, t + 0.02); // Look slightly ahead for direction
    const dirX = ((1-t2)*(1-t2)*source.x + 2*(1-t2)*t2*controlX + t2*t2*target.x) - arrowX;
    const dirY = ((1-t2)*(1-t2)*source.y + 2*(1-t2)*t2*controlY + t2*t2*target.y) - arrowY;
    const dirLength = Math.sqrt(dirX*dirX + dirY*dirY);
    
    if (dirLength > 0) {
      const unitDirX = dirX / dirLength;
      const unitDirY = dirY / dirLength;
      
      // Calculate arrowhead points
      const arrowX1 = arrowX - arrowLength * (unitDirX * Math.cos(arrowAngle) - unitDirY * Math.sin(arrowAngle));
      const arrowY1 = arrowY - arrowLength * (unitDirX * Math.sin(arrowAngle) + unitDirY * Math.cos(arrowAngle));
      const arrowX2 = arrowX - arrowLength * (unitDirX * Math.cos(-arrowAngle) - unitDirY * Math.sin(-arrowAngle));
      const arrowY2 = arrowY - arrowLength * (unitDirX * Math.sin(-arrowAngle) + unitDirY * Math.cos(-arrowAngle));
      
      // Draw thicker arrow lines
      ctx.lineWidth = Math.max(1.5 / globalScale, width * 1.5);
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX1, arrowY1);
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX2, arrowY2);
      ctx.stroke();
    }
    
    // Draw weight label for partial prerequisites
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={graphRef}
        graphData={{ nodes: graphNodes, links: graphLinks }}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeVal={node => (node.type === 'definition' ? 8 : 6) * (node.isDue ? 1.2 : 1)}
        nodeCanvasObject={nodeCanvasObject}
        
        linkCanvasObject={linkCanvasObject}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkCurvature={getLinkCurvature}
        
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
        
        onNodeClick={onNodeClick}
        onNodeHover={onNodeHover}
        onNodeDragEnd={onNodeDragEnd}
        d3AlphaDecay={0.0228}
        d3VelocityDecay={0.4}
        warmupTicks={graphNodes.length < 100 ? 50 : 10}
        cooldownTicks={0}
        nodeRelSize={1} 
        nodeVisibility={(node: GraphNode) => 
          filteredNodeType === 'all' || 
          node.type === filteredNodeType || 
          selectedNodeId === node.id || 
          highlightNodes.has(node.id)
        }
      />
      <CreditFlowOverlay 
        animations={creditFlowAnimations} 
        nodePositions={nodePositions.current}
        graphRef={graphRef} 
      />
    </div>
  );
};

export default GraphContainer;
