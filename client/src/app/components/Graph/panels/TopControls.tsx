// TopControls.tsx - Enhanced version with import/export functionality
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { ArrowLeft, Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play, Users, AlertTriangle, Type, Maximize, Download, Upload } from 'lucide-react';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';
import { LabelDisplayMode } from '../utils/GraphContainer';
import { 
  exportDomainAsJson, 
  downloadJsonFile, 
  uploadJsonFile, 
  importToDomain,
  validateImportData,
  DomainExportData 
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

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

  // NEW: Import/Export props
  currentDomainId?: number;
  currentDomainName?: string;
  isOwner?: boolean;
  onDataImported?: () => void;
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
  rightPanelOpen,
  currentDomainId,
  currentDomainName,
  isOwner = false,
  onDataImported,
}) => {
  const srs = useSRS();
  
  // NEW: Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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

  // NEW: Handle export functionality
  const handleExport = async () => {
    if (!currentDomainId || !currentDomainName) {
      showToast('No domain selected for export', 'error');
      return;
    }

    setIsExporting(true);
    try {
      showToast('Exporting domain...', 'info', 2000);
      const exportData = await exportDomainAsJson(currentDomainId);
      
      // Generate filename with domain name and timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `${currentDomainName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;
      
      downloadJsonFile(exportData, filename);
      showToast(`Domain "${currentDomainName}" exported successfully!`, 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to export domain', 
        'error'
      );
    } finally {
      setIsExporting(false);
    }
  };

  // NEW: Handle import functionality
  const handleImport = async () => {
    if (!currentDomainId || !isOwner) {
      showToast('Only domain owners can import data', 'error');
      return;
    }

    if (!isEnrolled) {
      showToast('You must be enrolled in the domain to import data', 'error');
      return;
    }

    setIsImporting(true);
    try {
      showToast('Select JSON file to import...', 'info', 2000);
      const importData: DomainExportData = await uploadJsonFile();
      
      // Validate import data
      const validation = validateImportData(importData);
      if (!validation.isValid) {
        throw new Error(`Invalid import data: ${validation.errors.join(', ')}`);
      }

      // Confirm import action
      const definitionCount = Object.keys(importData.definitions || {}).length;
      const exerciseCount = Object.keys(importData.exercises || {}).length;
      
      const confirmMessage = `Import ${definitionCount} definitions and ${exerciseCount} exercises to "${currentDomainName}"?\n\nThis will add to existing content (not replace).`;
      
      if (!window.confirm(confirmMessage)) {
        setIsImporting(false);
        return;
      }

      showToast('Importing data...', 'info', 3000);
      await importToDomain(currentDomainId, importData);
      
      showToast(`Successfully imported ${definitionCount} definitions and ${exerciseCount} exercises!`, 'success');
      
      // Trigger refresh callback
      if (onDataImported) {
        onDataImported();
      }
    } catch (error) {
      console.error('Import error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to import data', 
        'error'
      );
    } finally {
      setIsImporting(false);
    }
  };

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
        {/* NEW: Import/Export buttons */}
        {currentDomainId && (
          <div className="flex items-center space-x-1 border rounded-md p-1 mr-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              title="Export domain to JSON file"
              className="h-7 px-2 text-xs"
            >
              {isExporting ? (
                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-gray-600 mr-1"></div>
              ) : (
                <Download size={12} className="mr-1" />
              )}
              Export
            </Button>
            
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleImport}
                disabled={isImporting || !isEnrolled}
                title={!isEnrolled ? "Enroll in domain to import data" : "Import JSON file to domain"}
                className="h-7 px-2 text-xs disabled:bg-gray-100 disabled:text-gray-400"
              >
                {isImporting ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-gray-600 mr-1"></div>
                ) : (
                  <Upload size={12} className="mr-1" />
                )}
                Import
              </Button>
            )}
          </div>
        )}

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
