// TopControls.tsx - Enhanced version with better graph control integration
"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { ArrowLeft, Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play, Users, AlertTriangle, Type, Maximize } from 'lucide-react';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';
import { LabelDisplayMode } from '../utils/GraphContainer';

interface TopControlsProps {
  subjectMatterId: string;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onBack: () => void;
  labelDisplayMode: LabelDisplayMode;
  onCycleLabelDisplay: () => void;
  onZoomToFit: () => void;
  onCreateDefinition: () => void;
  onCreateExercise: () => void;
  onStartStudy: () => void;
  positionsChanged: boolean;
  isSavingPositions: boolean;
  onSavePositions: () => void;
  isEnrolled?: boolean;
  onEnroll?: () => void;
  
  // NEW: Enhanced graph control props
  onResetView?: () => void;
  onCenterSelected?: () => void;
  selectedNodeId?: string | null;
  
  // NEW: Graph state info
  graphDimensions?: { width: number; height: number; availableWidth: number; availableHeight: number };
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
}

const TopControls: React.FC<TopControlsProps> = ({
  subjectMatterId,
  mode,
  onModeChange,
  onBack,
  labelDisplayMode,
  onCycleLabelDisplay,
  onZoomToFit,
  onCreateDefinition,
  onCreateExercise,
  onStartStudy,
  positionsChanged,
  isSavingPositions,
  onSavePositions,
  isEnrolled = true,
  onEnroll,
  onResetView,
  onCenterSelected,
  selectedNodeId,
  graphDimensions,
  leftPanelOpen,
  rightPanelOpen
}) => {
  const srs = useSRS();

  let labelButtonText: string;
  let LabelIconComponent: React.ElementType = Type;
  let labelButtonTitle: string;

  switch (labelDisplayMode) {
    case 'names':
      labelButtonText = "Names";
      LabelIconComponent = Eye;
      labelButtonTitle = "Showing Names. Click to show Codes.";
      break;
    case 'codes':
      labelButtonText = "Codes";
      LabelIconComponent = Eye;
      labelButtonTitle = "Showing Codes. Click to hide labels.";
      break;
    case 'off':
      labelButtonText = "Off";
      LabelIconComponent = EyeOff;
      labelButtonTitle = "Labels Hidden. Click to show Names.";
      break;
    default:
      labelButtonText = "Labels";
      labelButtonTitle = "Cycle label display";
  }

  // NEW: Calculate available space info for debugging
  const spaceInfo = graphDimensions ? 
    `${graphDimensions.availableWidth}x${graphDimensions.availableHeight}` : 
    'Loading...';

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
        
        <DomainSelector currentDomainName={subjectMatterId} />

        {/* NEW: Graph space indicator (only in dev mode) */}
        {process.env.NODE_ENV === 'development' && graphDimensions && (
          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded" title="Available graph space">
            {spaceInfo}
          </div>
        )}
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
        {/* NEW: Enhanced view controls */}
        <div className="flex items-center space-x-1 border rounded-md p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCycleLabelDisplay}
            title={labelButtonTitle}
            className="h-7 px-2 text-xs"
          >
            <LabelIconComponent size={12} className="mr-1" /> {labelButtonText}
          </Button>
          
          <div className="w-px h-4 bg-gray-300"></div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onZoomToFit}
            title="Fit graph to available space"
            className="h-7 px-2 text-xs"
          >
            <ZoomIn size={12} className="mr-1" /> Fit
          </Button>
          
          {/* NEW: Center on selected node button */}
          {selectedNodeId && onCenterSelected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCenterSelected}
              title={`Center on selected node: ${selectedNodeId}`}
              className="h-7 px-2 text-xs"
            >
              <Maximize size={12} className="mr-1" /> Center
            </Button>
          )}
          
          {/* NEW: Reset view button */}
          {onResetView && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onResetView}
              title="Reset to default view"
              className="h-7 px-2 text-xs"
            >
              Reset
            </Button>
          )}
        </div>

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

        {/* NEW: Position save indicator */}
        {positionsChanged && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSavePositions}
            disabled={isSavingPositions}
            className="flex items-center bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
            title="Save current node positions"
          >
            {isSavingPositions ? (
              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-yellow-600 mr-1"></div>
            ) : (
              '💾'
            )}
            Save
          </Button>
        )}
      </div>
    </div>
  );
};

export default TopControls;
