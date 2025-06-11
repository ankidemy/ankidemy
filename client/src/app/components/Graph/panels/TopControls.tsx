// File: ./src/app/components/Graph/panels/TopControls.tsx
"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { ArrowLeft, Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play } from 'lucide-react';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext'; // Import useSRS hook

interface TopControlsProps {
  subjectMatterId: string;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onBack: () => void;
  showNodeLabels: boolean;
  onToggleNodeLabels: () => void;
  onZoomToFit: () => void;
  onCreateDefinition: () => void;
  onCreateExercise: () => void;
  onStartStudy: () => void; // Added prop for starting study mode
  positionsChanged: boolean;
  onSavePositions: () => void;
  isSavingPositions: boolean;
}

const TopControls: React.FC<TopControlsProps> = ({
  subjectMatterId,
  mode,
  onModeChange,
  onBack,
  showNodeLabels,
  onToggleNodeLabels,
  onZoomToFit,
  onCreateDefinition,
  onCreateExercise,
  onStartStudy, // Use the new prop
  positionsChanged,
  onSavePositions,
  isSavingPositions
}) => {
  const srs = useSRS(); // Get SRS context

  return (
    <div className="bg-white border-b p-3 flex justify-between items-center shadow-sm flex-shrink-0">
      {/* Left: Back Button + Title */}
      <div className="flex items-center flex-shrink-0 mr-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="mr-2 h-9 w-9">
          <ArrowLeft size={18} />
        </Button>
        <h2 className="text-lg font-semibold truncate" title={subjectMatterId}>
          {subjectMatterId || "Knowledge Graph"}
        </h2>
      </div>

      {/* Center: Mode Buttons & Study Button */}
      <div className="flex items-center space-x-2">
        <Button
          variant={mode === 'study' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('study')}
          className="flex items-center"
        >
          <Book size={14} className="mr-1" />
          Study
        </Button>
        <Button
          variant={mode === 'practice' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('practice')}
          className="flex items-center"
        >
          <BarChart size={14} className="mr-1" />
          Practice
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onStartStudy} // Call onStartStudy passed from KnowledgeGraph
          className="flex items-center bg-orange-500 hover:bg-orange-600 text-white"
          title="Start a study session"
        >
          <Play size={14} className="mr-1" />
          Review ({srs.state.domainStats?.dueReviews || srs.state.dueReviews.length || 0}) {/* Display due review count */}
        </Button>
      </div>

      {/* Right: View/Action Buttons */}
      <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleNodeLabels}
          title={showNodeLabels ? 'Hide Labels' : 'Show Labels'}
          className="flex items-center"
        >
          {showNodeLabels ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />} Labels
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onZoomToFit}
          title="Fit Graph"
          className="flex items-center"
        >
          <ZoomIn size={14} className="mr-1" /> Fit
        </Button>
        {positionsChanged && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSavePositions}
            disabled={isSavingPositions}
            title="Save current node positions to server"
            className={`flex items-center ${positionsChanged ? 'bg-blue-100 hover:bg-blue-200 border-blue-300' : ''}`}
          >
            {isSavingPositions ? "Saving..." : "Save Layout"}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateDefinition}
          title="Add Definition"
          className="flex items-center"
        >
          <Plus size={14} className="mr-1" /> Def
        </Button>
        {mode === 'practice' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateExercise}
            title="Add Exercise"
            className="flex items-center"
          >
            <Plus size={14} className="mr-1" /> Ex
          </Button>
        )}
      </div>
    </div>
  );
};

export default TopControls;
