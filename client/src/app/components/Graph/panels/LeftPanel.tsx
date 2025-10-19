// client/src/app/components/Graph/panels/LeftPanel.tsx
// Enhanced with multi-node selection and improved visual feedback

"use client";

import React, { useState, useCallback, useMemo } from 'react';
import { Search, Filter, X, CheckSquare, Square, Trash2, Eye, MousePointer, Users } from 'lucide-react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { InlineMarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { useSRS } from '@/contexts/SRSContext';
import { GraphNode, FilteredNodeType } from '../utils/types';
import { getStatusColor, getStatusIcon } from '@/lib/srs-api';

interface LeftPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredNodeType: FilteredNodeType;
  onFilterChange: (type: FilteredNodeType) => void;
  filteredNodes: GraphNode[];
  activeNodeIds: Set<string>;
  selectedNodeIds: Set<string>; // NEW: Selected nodes for operations
  onNodeClick: (node: GraphNode) => void;
  onNodeSelect: (nodeId: string, isSelected: boolean) => void; // NEW: Selection handler
  onClearSelection: () => void; // NEW: Clear selection handler
  mode: 'study' | 'practice';
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  isVisible,
  onToggle,
  searchQuery,
  onSearchChange,
  filteredNodeType,
  onFilterChange,
  filteredNodes,
  activeNodeIds,
  selectedNodeIds,
  onNodeClick,
  onNodeSelect,
  onClearSelection,
  mode
}) => {
  const srs = useSRS();
  const [selectionMode, setSelectionMode] = useState(false);

  // Enhanced node click handler with selection mode support
  const handleNodeItemClick = useCallback((node: GraphNode, event: React.MouseEvent) => {
    if (selectionMode) {
      // In selection mode, toggle selection
      event.preventDefault();
      event.stopPropagation();
      const isSelected = selectedNodeIds.has(node.id);
      onNodeSelect(node.id, !isSelected);
    } else {
      // Normal mode, open detail window
      onNodeClick(node);
    }
  }, [selectionMode, selectedNodeIds, onNodeSelect, onNodeClick]);

  // Dedicated checkbox handler
  const handleCheckboxClick = useCallback((node: GraphNode, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const isSelected = selectedNodeIds.has(node.id);
    onNodeSelect(node.id, !isSelected);
  }, [selectedNodeIds, onNodeSelect]);

  // Bulk selection handlers
  const handleSelectAll = useCallback(() => {
    const allNodeIds = filteredNodes.map(node => node.id);
    allNodeIds.forEach(id => {
      if (!selectedNodeIds.has(id)) {
        onNodeSelect(id, true);
      }
    });
  }, [filteredNodes, selectedNodeIds, onNodeSelect]);

  const handleDeselectAll = useCallback(() => {
    selectedNodeIds.forEach(id => {
      onNodeSelect(id, false);
    });
  }, [selectedNodeIds, onNodeSelect]);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => !prev);
    if (selectionMode) {
      // Exiting selection mode, clear selections
      onClearSelection();
    }
  }, [selectionMode, onClearSelection]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'a':
          event.preventDefault();
          if (selectionMode) {
            handleSelectAll();
          }
          break;
        case 'Escape':
          if (selectionMode) {
            onClearSelection();
          }
          break;
      }
    }
  }, [selectionMode, handleSelectAll, onClearSelection]);

  // Statistics for selection
  const selectionStats = useMemo(() => {
    const selectedNodes = filteredNodes.filter(node => selectedNodeIds.has(node.id));
    const definitions = selectedNodes.filter(node => node.type === 'definition').length;
    const exercises = selectedNodes.filter(node => node.type === 'exercise').length;
    const due = selectedNodes.filter(node => {
      const progress = (node as any).progress || null;
      return !!progress?.isDue;
    }).length;
    
    return { total: selectedNodes.length, definitions, exercises, due };
  }, [filteredNodes, selectedNodeIds, srs]);

  // Enhanced node rendering with better visual feedback
  const renderNodeItem = useCallback((node: GraphNode) => {
    const isActive = activeNodeIds.has(node.id);
    const isSelected = selectedNodeIds.has(node.id);
    const nodeProgress = (node as any).progress || null;
    
    // Enhanced styling based on state
    let itemClasses = "px-3 py-2 text-sm rounded-lg cursor-pointer border-2 transition-all duration-200 relative ";
    
    if (isSelected) {
      itemClasses += "bg-blue-100 text-blue-900 border-blue-300 shadow-md transform scale-[1.02] ";
    } else if (isActive) {
      itemClasses += node.type === 'definition'
        ? "bg-blue-50 text-blue-800 border-blue-200 shadow-sm "
        : "bg-orange-50 text-orange-800 border-orange-200 shadow-sm ";
    } else {
      itemClasses += "border-transparent hover:bg-gray-50 hover:border-gray-200 hover:shadow-sm ";
    }
    
    // Add pulse animation for due items
    if (nodeProgress?.isDue && !isSelected) {
      itemClasses += "animate-pulse ";
    }

    return (
      <li
        key={node.id}
        className={itemClasses}
        onClick={(e) => handleNodeItemClick(node, e)}
        onKeyDown={handleKeyDown}
        title={`${node.id}: ${node.name}${nodeProgress?.isDue ? ' (Due for review)' : ''}`}
        tabIndex={0}
      >
        <div className="flex items-center space-x-3">
          {/* Selection Checkbox with enhanced styling */}
          {selectionMode && (
            <button
              onClick={(e) => handleCheckboxClick(node, e)}
              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 hover:scale-110 ${
                isSelected 
                  ? 'bg-blue-500 border-blue-500 text-white' 
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
            >
              {isSelected && <CheckSquare size={14} />}
            </button>
          )}
          
          {/* Node Status Indicator with enhanced styling */}
          <div className="flex-shrink-0 relative">
            {nodeProgress && (
              <div 
                className={`w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold shadow-sm border-2 border-white ${
                  nodeProgress.isDue ? 'animate-pulse' : ''
                }`}
                style={{ backgroundColor: getStatusColor(nodeProgress.status) }}
                title={`Status: ${nodeProgress.status}${nodeProgress.isDue ? ' (Due)' : ''}`}
              >
                <span className="text-white text-xs leading-none">
                  {getStatusIcon(nodeProgress.status)}
                </span>
              </div>
            )}
            
            {/* Due indicator overlay */}
            {nodeProgress?.isDue && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
          
          {/* Node Content with enhanced typography */}
          <div className="flex-1 min-w-0">
            <div className={`font-medium truncate ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
              <InlineMarkdownKatex>{`${node.id}: ${node.name}`}</InlineMarkdownKatex>
            </div>
            
            {/* Enhanced metadata display */}
            <div className="flex items-center space-x-2 text-xs text-gray-500 mt-1">
              <span className={`capitalize px-2 py-0.5 rounded text-xs font-medium ${
                node.type === 'definition' 
                  ? 'bg-blue-100 text-blue-700' 
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {node.type}
              </span>
              
              {node.type === 'exercise' && node.difficulty !== undefined && (
                <span className="flex items-center">
                  <span className="mr-1">★</span>
                  <span>{node.difficulty}/7</span>
                </span>
              )}
              
              {nodeProgress?.isDue && (
                <span className="text-red-600 font-medium bg-red-100 px-2 py-0.5 rounded animate-pulse">
                  Due
                </span>
              )}
              
              {nodeProgress && (
                <span className="text-gray-400">
                  {nodeProgress.totalReviews} reviews
                </span>
              )}
            </div>
          </div>
          
          {/* Visual indicators for active/selected state */}
          {isActive && (
            <div className="flex-shrink-0" aria-label="Detail window open">
              <Eye size={14} className="text-blue-500" />
            </div>
          )}
        </div>
        
        {/* Selection highlight border */}
        {isSelected && (
          <div className="absolute inset-0 border-2 border-blue-400 rounded-lg pointer-events-none animate-pulse" />
        )}
      </li>
    );
  }, [
    activeNodeIds, 
    selectedNodeIds, 
    srs, 
    selectionMode, 
    handleNodeItemClick, 
    handleCheckboxClick,
    handleKeyDown
  ]);

  if (!isVisible) return null;

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200 shadow-lg">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
        <div className="flex items-center space-x-2">
          <h2 className="text-lg font-semibold text-gray-800">Nodes</h2>
          <div className="text-sm text-gray-500">
            ({filteredNodes.length})
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Enhanced Selection Mode Toggle */}
          <Button
            variant={selectionMode ? "default" : "ghost"}
            size="sm"
            onClick={toggleSelectionMode}
            className={`h-8 px-3 transition-all duration-200 ${
              selectionMode 
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md" 
                : "hover:bg-gray-100"
            }`}
            title={selectionMode ? "Exit selection mode" : "Enter selection mode"}
          >
            {selectionMode ? <Users size={14} /> : <MousePointer size={14} />}
            <span className="ml-1 text-xs">
              {selectionMode ? "Select" : "Browse"}
            </span>
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="h-8 w-8 hover:bg-gray-100"
            title="Close panel"
          >
            <X size={16} />
          </Button>
        </div>
      </div>

      {/* Enhanced Selection Controls */}
      {selectionMode && (
        <div className="p-3 border-b border-gray-200 bg-blue-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-sm font-medium text-blue-900">
                {selectionStats.total} selected
              </div>
              {selectionStats.total > 0 && (
                <div className="text-xs text-blue-700 bg-blue-100 px-2 py-1 rounded">
                  {selectionStats.definitions}D • {selectionStats.exercises}E
                  {selectionStats.due > 0 && ` • ${selectionStats.due} due`}
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-100"
                title="Select all visible nodes"
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeselectAll}
                className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-100"
                title="Deselect all nodes"
              >
                Clear
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="h-7 px-2 text-xs text-red-600 hover:bg-red-100"
                title="Exit selection mode and clear all selections"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
          
          {/* Selection Statistics */}
          {selectionStats.total > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <div className="text-xs text-blue-600">
                <span className="font-medium">Selected:</span>
                <span className="ml-2">
                  {Array.from(selectedNodeIds).slice(0, 3).join(', ')}
                  {selectedNodeIds.size > 3 && ` and ${selectedNodeIds.size - 3} more`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enhanced Search */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9 text-sm border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSearchChange('')}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0 hover:bg-gray-200"
            >
              <X size={12} />
            </Button>
          )}
        </div>
      </div>

      {/* Enhanced Filter */}
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <select
            value={filteredNodeType}
            onChange={(e) => onFilterChange(e.target.value as FilteredNodeType)}
            className="flex-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Nodes</option>
            <option value="definition">Definitions Only</option>
            <option value="exercise">Exercises Only</option>
          </select>
        </div>
      </div>

      {/* Enhanced Node List */}
      <div className="flex-1 overflow-y-auto px-2 py-1 min-h-0">
        {filteredNodes.length > 0 ? (
          <ul className="space-y-2 py-2">
            {filteredNodes.map(renderNodeItem)}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-6">
            <Search size={32} className="mb-3 text-gray-400" />
            <p className="text-sm text-center">
              {searchQuery ? 'No matching nodes found' : 'No nodes to display'}
            </p>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSearchChange('')}
                className="mt-2 text-xs"
              >
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Enhanced Footer with Selection Info */}
      <div className="border-t border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between text-xs text-gray-600">
          <div className="flex items-center space-x-4">
            <span>
              <span className="font-medium">{filteredNodes.length}</span> nodes
            </span>
            {activeNodeIds.size > 0 && (
              <span className="text-blue-600">
                <span className="font-medium">{activeNodeIds.size}</span> active
              </span>
            )}
          </div>
          
          {selectedNodeIds.size > 0 && (
            <div className="text-blue-600 font-medium">
              {selectedNodeIds.size} selected
            </div>
          )}
        </div>
        
        {/* Keyboard shortcuts hint */}
        {selectionMode && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
            <span className="font-medium">Shortcuts:</span>
            <span className="ml-2">Ctrl+A (Select all) • Esc (Clear)</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
