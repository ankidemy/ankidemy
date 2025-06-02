"use client";

import React, { useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GraphNode, GraphLink, FilteredNodeType } from './types';

// Import ForceGraph dynamically to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

interface GraphContainerProps {
  graphNodes: GraphNode[];
  graphLinks: GraphLink[];
  highlightNodes: Set<string>;
  highlightLinks: Set<string>;
  filteredNodeType: FilteredNodeType;
  selectedNodeId: string | null;
  showNodeLabels: boolean;
  onNodeClick: (node: GraphNode) => void;
  onNodeHover: (node: GraphNode | null) => void;
  onNodeDragEnd: (node: GraphNode) => void;
  graphRef: React.MutableRefObject<any>;
}

const GraphContainer: React.FC<GraphContainerProps> = ({
  graphNodes,
  graphLinks,
  highlightNodes,
  highlightLinks,
  filteredNodeType,
  selectedNodeId,
  showNodeLabels,
  onNodeClick,
  onNodeHover,
  onNodeDragEnd,
  graphRef
}) => {
  // Custom node rendering
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0 } = node;
    const nodeSizeBase = type === 'definition' ? 6 : 5;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const labelOffset = nodeSize + 3 / globalScale;
    const fontSize = Math.max(4, 10 / globalScale);
    const isSelected = selectedNodeId === id;
    const isHighlighted = highlightNodes.has(id);

    // Colors
    let color;
    if (type === 'definition') {
      color = node.isRootDefinition ? '#28a745' : '#007bff'; // Green root, Blue def
    } else { // Exercise
      const difficultyColors = ['#66bb6a', '#9ccc65', '#ffee58', '#ffa726', '#ff7043', '#ef5350', '#d32f2f'];
      let difficultyLevel = 2;
      if (node.difficulty) {
        const parsedDifficulty = parseInt(node.difficulty, 10);
        if (!isNaN(parsedDifficulty)) {
          difficultyLevel = Math.max(0, Math.min(6, parsedDifficulty - 1));
        }
      }
      color = difficultyColors[difficultyLevel];
    }

    // Selection/Highlight Glow
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 4 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
      ctx.fill();
    } else if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 3 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(0, 123, 255, 0.3)';
      ctx.fill();
    }

    // Draw node circle
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.5 / globalScale;
    ctx.stroke();

    // Label Rendering
    const labelThreshold = 0.7; // Zoom level to show labels
    if ((showNodeLabels && globalScale > labelThreshold) || isSelected || isHighlighted) {
      const label = `${id}: ${name}`;

      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333';

      // Truncate label if needed
      const truncatedLabel = label.length > 30 ? label.substring(0, 27) + '...' : label;

      // White "halo" for readability
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeText(truncatedLabel, x, y + labelOffset + fontSize * 0.5);
      ctx.fillText(truncatedLabel, x, y + labelOffset + fontSize * 0.5);
    }
  }, [selectedNodeId, highlightNodes, showNodeLabels]);

  // Link color
  const linkColor = useCallback((link: GraphLink) => {
    // Handle both string and object references
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);

    // Check target node type for styling
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') {
      return '#ff4500'; // Bright orange-red for exercise links
    }

    // Highlight or default color
    const linkId = `${sourceId}-${targetId}`;
    return highlightLinks.has(linkId) ? '#f59e0b' : '#aaa';
  }, [graphNodes, highlightLinks]);

  // Link width
  const linkWidth = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);

    // Thicker exercise links
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') {
      return 1.8;
    }

    // Highlight or default width
    const linkId = `${sourceId}-${targetId}`;
    return highlightLinks.has(linkId) ? 2 : 0.8;
  }, [graphNodes, highlightLinks]);

  return (
    <ForceGraph2D
      ref={graphRef}
      graphData={{ nodes: graphNodes, links: graphLinks }}
      key={`graph-${graphNodes.length}-${graphLinks.length}`} // Update key when data changes
      nodeId="id"
      linkSource="source"
      linkTarget="target"
      nodeVal={node => node.type === 'definition' ? 8 : 6}
      nodeCanvasObject={nodeCanvasObject}
      linkColor={linkColor}
      linkWidth={linkWidth}
      linkDirectionalArrowLength={4}
      linkDirectionalArrowRelPos={1}
      linkCurvature={0.15}
      onNodeClick={onNodeClick}
      onNodeHover={onNodeHover}
      onNodeDragEnd={onNodeDragEnd}
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      warmupTicks={50}
      cooldownTicks={0}
      nodeRelSize={1} // Ensure nodeVal is used for size scaling
      nodeVisibility={node => 
        filteredNodeType === 'all' || 
        node.type === filteredNodeType || 
        selectedNodeId === node.id || 
        highlightNodes.has(node.id)
      }
    />
  );
};

export default GraphContainer;
