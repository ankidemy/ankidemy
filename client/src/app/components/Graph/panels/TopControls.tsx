// FILE: src/app/components/Graph/panels/TopControls.tsx
"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { ArrowLeft, Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play, Users, AlertTriangle } from 'lucide-react';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';

interface TopControlsProps {
  subjectMatterId: string; // This prop holds the domain NAME
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onBack: () => void;
  showNodeLabels: boolean;
  onToggleNodeLabels: () => void;
  onZoomToFit: () => void;
  onCreateDefinition: () => void;
  onCreateExercise: () => void;
  onStartStudy: () => void;
  positionsChanged: boolean;
  isSavingPositions: boolean;
  onSavePositions: () => void;
  isEnrolled?: boolean;
  onEnroll?: () => void;
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
  onStartStudy,
  positionsChanged,
  isSavingPositions,
  onSavePositions,
  isEnrolled = true,
  onEnroll
}) => {
  const srs = useSRS();

  return (
    <div className="bg-white border-b p-3 flex justify-between items-center shadow-sm flex-shrink-0">
      {/* Left: Back Button + Title + Domain Selector */}
      <div className="flex items-center flex-shrink-0 mr-4 space-x-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9">
          <ArrowLeft size={18} />
        </Button>
        <h2 className="text-lg font-semibold truncate" title={subjectMatterId}>
          {subjectMatterId || "Knowledge Graph"}
        </h2>
        
        {/* Pass the domain NAME to the selector */}
        <DomainSelector currentDomainName={subjectMatterId} />

      </div>

      {/* Center: Mode Buttons & Study Button */}
      <div className="flex items-center space-x-2">
        {/* Enrollment status indicator */}
        {!isEnrolled && (
          <div className="flex items-center space-x-2 mr-4">
            <div className="flex items-center px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs">
              <AlertTriangle size={12} className="mr-1" />
              Limited Access
            </div>
            {onEnroll && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEnroll}
                className="text-xs bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
              >
                <Users size={14} className="mr-1" />
                Enroll
              </Button>
            )}
          </div>
        )}

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
        
        {/* Study button - disabled if not enrolled */}
        <Button
          variant="default"
          size="sm"
          onClick={onStartStudy}
          disabled={!isEnrolled}
          className="flex items-center bg-orange-500 hover:bg-orange-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
          title={!isEnrolled ? "Enroll in domain to access study features" : `Start a study session (${srs.state.domainStats?.dueReviews || srs.state.dueReviews.length || 0} due)`}
        >
          <Play size={14} className="mr-1" />
          Review ({isEnrolled ? (srs.state.domainStats?.dueReviews || srs.state.dueReviews.length || 0) : 0})
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
        {/* Creation buttons - disabled if not enrolled */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateDefinition}
          disabled={!isEnrolled}
          title={!isEnrolled ? "Enroll in domain to create definitions" : "Add Definition"}
          className="flex items-center disabled:bg-gray-100 disabled:text-gray-400"
        >
          <Plus size={14} className="mr-1" /> Def
        </Button>
        {mode === 'practice' && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateExercise}
            disabled={!isEnrolled}
            title={!isEnrolled ? "Enroll in domain to create exercises" : "Add Exercise"}
            className="flex items-center disabled:bg-gray-100 disabled:text-gray-400"
          >
            <Plus size={14} className="mr-1" /> Ex
          </Button>
        )}
      </div>
    </div>
  );
};

export default TopControls;
