"use client";

import React from 'react';
import { AppMode } from './types';

interface GraphLegendProps {
  mode: AppMode;
  hasExercises: boolean;
}

const GraphLegend: React.FC<GraphLegendProps> = ({ mode, hasExercises }) => {
  return (
    <div className="absolute bottom-3 left-3 bg-white p-2 rounded shadow-md text-xs border max-w-[150px] z-10">
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
      <div className="flex items-center mt-1 pt-1 border-t">
        <div style={{width: '12px', height: '2px', backgroundColor: '#aaa', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Prereq. Link</span>
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
