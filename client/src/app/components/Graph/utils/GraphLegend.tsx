"use client";

import React from 'react';
import { AppMode } from './types';
import { cn } from '@/lib/utils';

interface GraphLegendProps {
  mode: AppMode;
  hasExercises: boolean;
  className?: string;
}

const GraphLegend: React.FC<GraphLegendProps> = ({ mode, hasExercises, className }) => {
  return (
    <div className={cn("absolute bottom-3 left-3 bg-white p-2 rounded shadow-md text-xs border max-w-[150px] z-10", className)}>
      <div className="font-semibold mb-1">Legend</div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-400 flex-shrink-0" style={{ backgroundColor: '#94A3B8' }}></div>
        <span className="truncate">Fresh</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-400 flex-shrink-0" style={{ backgroundColor: '#F97316' }}></div>
        <span className="truncate">Tackling</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-400 flex-shrink-0" style={{ backgroundColor: '#22C55E' }}></div>
        <span className="truncate">Grasped</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-400 flex-shrink-0" style={{ backgroundColor: '#93C5FD' }}></div>
        <span className="truncate">Learned</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border-2 flex-shrink-0" style={{ borderColor: 'rgb(139, 92, 246)' }}></div>
        <span className="truncate">Selected</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border-2 flex-shrink-0" style={{ borderColor: 'rgb(236, 72, 153)' }}></div>
        <span className="truncate">New</span>
      </div>
      <div className="flex items-center mb-1">
        <div
          className="w-3 h-3 rounded-full mr-1.5 border-2 flex-shrink-0"
          style={{ borderColor: 'rgb(245, 158, 11)' }}
        ></div>
        <span className="truncate">Due</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-400 flex-shrink-0" style={{ backgroundColor: 'rgba(148, 163, 184, 0.4)' }}></div>
        <span className="truncate">External</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-red-300 flex-shrink-0" style={{ backgroundColor: 'rgba(248, 113, 113, 0.45)' }}></div>
        <span className="truncate">External Missing</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-300 flex-shrink-0" style={{ backgroundColor: 'rgba(16, 185, 129, 0.35)' }}></div>
        <span className="truncate">Source</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full mr-1.5 border border-gray-300 flex-shrink-0" style={{ backgroundColor: 'rgba(245, 158, 11, 0.35)' }}></div>
        <span className="truncate">Quest</span>
      </div>
      <div className="flex items-center mt-1 pt-1 border-t">
        <div style={{width: '12px', height: '2px', backgroundColor: '#aaa', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Prereq. Link</span>
       </div>
      <div className="flex items-center">
        <div style={{width: '12px', height: '2px', backgroundColor: '#1f2937', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Relation</span>
       </div>
      {(mode !== 'study' || hasExercises) && (
       <div className="flex items-center">
        <div style={{width: '12px', height: '2px', backgroundColor: '#ff4500', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Exercise Link</span>
       </div>
      )}
    </div>
  );
};

export default GraphLegend;
