"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Search, X } from 'lucide-react';
import { GraphNode, FilteredNodeType } from '../utils/types';
import { MathJaxContent } from '@/app/components/core/MathJaxWrapper';

interface LeftPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  filteredNodeType: FilteredNodeType;
  onFilterChange: (type: FilteredNodeType) => void;
  filteredNodes: GraphNode[];
  selectedNodeId: string | null;
  onNodeClick: (node: GraphNode) => void;
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
  selectedNodeId,
  onNodeClick,
  mode
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="p-4 flex flex-col h-full">
      {/* Header + Close Button */}
      <div className="flex justify-between items-center mb-3 flex-shrink-0">
        <h3 className="font-semibold text-base">Browse Nodes</h3>
        <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7">
          <X size={16} />
        </Button>
      </div>

      {/* Search */}
      <div className="mb-3 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            type="search"
            placeholder="Search..."
            className="pl-8 text-sm h-9"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex space-x-1 mb-3 flex-shrink-0">
        <Button
          size="sm"
          variant={filteredNodeType === 'all' ? 'secondary' : 'ghost'}
          className="flex-1 text-xs h-7"
          onClick={() => onFilterChange('all')}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={filteredNodeType === 'definition' ? 'secondary' : 'ghost'}
          className="flex-1 text-xs h-7"
          onClick={() => onFilterChange('definition')}
        >
          Defs
        </Button>
        {(mode === 'practice' || filteredNodes.some(n => n.type === 'exercise')) && (
          <Button
            size="sm"
            variant={filteredNodeType === 'exercise' ? 'secondary' : 'ghost'}
            className="flex-1 text-xs h-7"
            onClick={() => onFilterChange('exercise')}
          >
            Exer
          </Button>
        )}
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0">
        {filteredNodes.length > 0 ? (
          <ul className="space-y-1">
            {filteredNodes.map(node => (
              <li
                key={node.id}
                className={`px-2 py-1.5 text-sm rounded cursor-pointer border ${
                  selectedNodeId === node.id
                    ? (node.type === 'definition'
                       ? 'bg-blue-100 text-blue-800 border-blue-300'
                       : 'bg-orange-100 text-orange-800 border-orange-300')
                    : 'border-transparent hover:bg-gray-100'
                }`}
                onClick={() => onNodeClick(node)}
                title={`${node.id}: ${node.name}`}
              >
                <div className="font-medium truncate">
                  <MathJaxContent inline={true} className="text-sm">
                    {node.id}: {node.name}
                  </MathJaxContent>
                </div>
                {node.type === 'exercise' && (
                  <div className="text-xs text-gray-500">
                    Diff: {node.difficulty ? "★".repeat(parseInt(node.difficulty, 10)) : "?"}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm p-4 text-center italic">No matching nodes.</p>
        )}
      </div>
    </div>
  );
};

export default LeftPanel;
