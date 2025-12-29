// TopControls.tsx - Enhanced version with import/export functionality
"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play, Users, AlertTriangle, Type, Maximize, Download, Upload, Zap, List, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';
import { LabelDisplayMode } from '../utils/GraphContainer';
import {
  exportDomainAsJson,
  downloadJsonFile
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImportDialog from '../ImportDialog';
import NotificationCenter from '@/app/components/Notifications/NotificationCenter';

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
  onNavigateToNode?: (nodeCode: string) => void;
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
  onNavigateToNode,
}) => {
  const srs = useSRS();

  // NEW: Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [hasNewDue, setHasNewDue] = useState(false);
  const reviewQueueRef = useRef<HTMLDivElement>(null);
  const lastSeenReviewIdsRef = useRef<Set<string>>(new Set());
  const wasReviewQueueOpenRef = useRef(false);
  const canEdit = isOwner;

  const dueReviews = srs.state.dueReviews;
  const dueCount = isEnrolled ? dueReviews.length : 0;
  const loadDueReviews = srs.loadDueReviews;
  const currentSrsDomainId = srs.state.currentDomainId;

  useEffect(() => {
    if (!isEnrolled || !currentDomainId || currentSrsDomainId !== currentDomainId) return;
    const refreshQueue = async () => {
      try {
        await loadDueReviews('mixed');
      } catch (error) {
        console.warn('Failed to refresh review queue:', error);
      }
    };

    refreshQueue();
    const interval = setInterval(refreshQueue, 60000);
    return () => clearInterval(interval);
  }, [isEnrolled, currentDomainId, currentSrsDomainId, loadDueReviews]);

  useEffect(() => {
    if (isEnrolled) return;
    setShowReviewQueue(false);
    setHasNewDue(false);
    lastSeenReviewIdsRef.current = new Set();
  }, [isEnrolled]);

  useEffect(() => {
    if (!isEnrolled) return;
    const currentIds = new Set(dueReviews.map(review => `${review.nodeType}_${review.nodeId}`));
    if (currentIds.size === 0) {
      setHasNewDue(false);
      return;
    }
    const hasNew = Array.from(currentIds).some(id => !lastSeenReviewIdsRef.current.has(id));
    if (hasNew) {
      setHasNewDue(true);
    }
  }, [dueReviews, isEnrolled]);

  useEffect(() => {
    if (!currentDomainId) return;
    lastSeenReviewIdsRef.current = new Set(
      dueReviews.map(review => `${review.nodeType}_${review.nodeId}`)
    );
    setHasNewDue(false);
  }, [currentDomainId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (reviewQueueRef.current && !reviewQueueRef.current.contains(event.target as Node)) {
        setShowReviewQueue(false);
      }
    };

    if (showReviewQueue) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showReviewQueue]);

  useEffect(() => {
    if (!showReviewQueue) {
      wasReviewQueueOpenRef.current = false;
      return;
    }

    if (!wasReviewQueueOpenRef.current) {
      lastSeenReviewIdsRef.current = new Set(
        dueReviews.map(review => `${review.nodeType}_${review.nodeId}`)
      );
      setHasNewDue(false);
      if (isEnrolled && currentDomainId && currentSrsDomainId === currentDomainId) {
        loadDueReviews('mixed').catch(error => {
          console.warn('Failed to refresh review queue:', error);
        });
      }
    }

    wasReviewQueueOpenRef.current = true;
  }, [showReviewQueue, dueReviews, isEnrolled, currentDomainId, currentSrsDomainId, loadDueReviews]);

  const handleToggleReviewQueue = () => {
    setShowReviewQueue(prev => !prev);
  };

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

  // Open import dialog
  const handleOpenImportDialog = () => {
    if (!currentDomainId || !isOwner) {
      showToast('Only domain owners can import data', 'error');
      return;
    }

    if (!isEnrolled) {
      showToast('You must be enrolled in the domain to import data', 'error');
      return;
    }

    setShowImportDialog(true);
  };

  return (
    <div className="bg-white border-b p-3 flex justify-between items-center shadow-sm flex-shrink-0">
      {/* Left: Logo link + Domain Selector */}
      <div className="flex items-center flex-shrink-0 mr-4 space-x-3">
        <Link href="/main" className="text-orange-500 hover:text-orange-600 font-bold text-xl leading-none">
          Ankidemy
        </Link>

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
        <Button
          variant={mode === 'frenzy' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onModeChange('frenzy')}
          className="flex items-center"
        >
          <Zap size={14} className="mr-1" />
          Frenzy
        </Button>
        
        {/* Study button - disabled if not enrolled */}
        <Button
          variant="default"
          size="sm"
          onClick={onStartStudy}
          disabled={!isEnrolled}
          className="flex items-center bg-orange-500 hover:bg-orange-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
          title={!isEnrolled ? "Enroll in domain to access study features" : `Start a study session (${dueCount} due)`}
        >
          <Play size={14} className="mr-1" />
          Review ({isEnrolled ? dueCount : 0})
        </Button>

        <div className="relative" ref={reviewQueueRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleReviewQueue}
            disabled={!isEnrolled}
            className="flex items-center"
            title={!isEnrolled ? "Enroll in domain to view the review queue" : "Review queue"}
          >
            <List size={14} className="mr-1" />
            Queue
            {dueCount > 0 && (
              <span className="ml-2 rounded-full bg-orange-100 text-orange-700 text-[11px] font-semibold px-2 py-0.5">
                {dueCount}
              </span>
            )}
          </Button>

          {hasNewDue && isEnrolled && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500" />
          )}

          {showReviewQueue && (
            <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-30 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div className="text-sm font-semibold text-gray-800">Review Queue</div>
                <button
                  type="button"
                  onClick={() => {
                    if (currentDomainId && currentSrsDomainId === currentDomainId) {
                      loadDueReviews('mixed');
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-orange-500"
                >
                  <RefreshCw size={12} />
                  Refresh
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {dueReviews.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">No items due for review yet.</div>
                ) : (
                  <ul className="py-2">
                    {dueReviews.map((review, index) => (
                      <li key={`${review.nodeType}-${review.nodeId}-${index}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigateToNode && review.nodeCode) {
                              onNavigateToNode(review.nodeCode);
                            }
                            setShowReviewQueue(false);
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-800 truncate">
                              {review.nodeName || review.nodeCode}
                            </span>
                            <span className="text-[10px] font-semibold uppercase text-gray-400">
                              {review.nodeType === 'definition' ? 'Def' : 'Ex'}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                            <span className="truncate">{review.nodeCode}</span>
                            <span>{review.isDue ? 'Due now' : 'Scheduled'}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: View/Action Buttons */}
      <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
        <NotificationCenter suppressDomainId={currentDomainId} />

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
                onClick={handleOpenImportDialog}
                disabled={!isEnrolled}
                title={!isEnrolled ? "Enroll in domain to import data" : "Import JSON file to domain"}
                className="h-7 px-2 text-xs disabled:bg-gray-100 disabled:text-gray-400"
              >
                <Upload size={12} className="mr-1" />
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
          disabled={!canEdit}
          title={!canEdit ? "Only domain owners can create definitions" : "Add Definition"}
          className="flex items-center disabled:bg-gray-100 disabled:text-gray-400"
        >
          <Plus size={14} className="mr-1" /> Def
        </Button>
        {(mode === 'practice' || mode === 'frenzy') && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateExercise}
            disabled={!canEdit}
            title={!canEdit ? "Only domain owners can create exercises" : "Add Exercise"}
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
            disabled={isSavingPositions || !canEdit}
            className="flex items-center bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
            title={!canEdit ? "Only domain owners can save positions" : "Save current node positions"}
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

      {/* Import Dialog */}
      {currentDomainId && currentDomainName && (
        <ImportDialog
          isOpen={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          domainId={currentDomainId}
          domainName={currentDomainName}
          onSuccess={onDataImported}
        />
      )}
    </div>
  );
};

export default TopControls;
