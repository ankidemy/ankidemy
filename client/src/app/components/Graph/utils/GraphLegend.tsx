"use client";

import React from 'react';

interface GraphLegendProps {
  mode: 'study' | 'practice';
  hasExercises: boolean;
}

const GraphLegend: React.FC<GraphLegendProps> = ({ mode, hasExercises }) => {
  return (
    <div className="absolute bottom-3 left-3 bg-white p-2 rounded shadow-md text-xs border max-w-[150px] z-10">
      <div className="font-semibold mb-1">Legend</div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full bg-[#28a745] mr-1.5 border border-gray-400 flex-shrink-0"></div>
        <span className="truncate">Root Def.</span>
      </div>
      <div className="flex items-center mb-1">
        <div className="w-3 h-3 rounded-full bg-[#007bff] mr-1.5 border border-gray-400 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ fontSize: '6px' }}>D</div>
        <span className="truncate">Definition</span>
      </div>
      {(mode === 'practice' || hasExercises) && (
        <div className="flex items-center mb-1">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 mr-1.5 border border-gray-400 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold" style={{ fontSize: '6px' }}>E</div>
          <span className="truncate">Exercise</span>
        </div>
      )}
      <div className="flex items-center mt-1 pt-1 border-t">
        <div style={{width: '12px', height: '2px', backgroundColor: '#aaa', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Prereq. Link</span>
       </div>
      {(mode === 'practice' || hasExercises) && (
       <div className="flex items-center">
        <div style={{width: '12px', height: '2px', backgroundColor: '#ff4500', marginRight: '6px', flexShrink: 0}}></div>
        <span className="truncate">Exercise Link</span>
       </div>
      )}
    </div>
  );
};

export default GraphLegend;
