// TopControls.tsx - Enhanced version with import/export functionality
"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Book, BarChart, EyeOff, Eye, ZoomIn, Plus, Play, Users, AlertTriangle, Type, Maximize, Download, Upload, Zap, List, RefreshCw, GitBranch, MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';
import { LabelDisplayMode } from '../utils/GraphContainer';
import {
  exportDomainAsJson,
  downloadJsonFile,
  fetchDomainBackup,
  downloadZipFile
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
  canEdit?: boolean;
  onDataImported?: () => void;
  onNavigateToNode?: (nodeCode: string) => void;
  onManageAccess?: () => void;

  // Group controls
  groups?: Array<{
    id: number;
    name: string;
    collapsed: boolean;
    isExact: boolean;
    memberCount: number;
  }>;
  selectedNodeIds?: string[];
  onCreateGroup?: (name: string, seedCodes: string[], isExact: boolean, memberCodes?: string[]) => Promise<void>;
  onToggleGroupCollapse?: (groupId: number, collapsed: boolean) => void;
  onDeleteGroup?: (groupId: number) => Promise<void>;

  // DAG toggle
  dagModeEnabled?: boolean;
  onToggleDagMode?: () => void;
  dagOrientation?: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin';
  onDagOrientationChange?: (orientation: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin') => void;
  expandedCycleCount?: number;
  onCollapseCycles?: () => void;
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
  canEdit: canEditProp,
  onDataImported,
  onNavigateToNode,
  onManageAccess,
  groups = [],
  selectedNodeIds = [],
  onCreateGroup,
  onToggleGroupCollapse,
  onDeleteGroup,
  dagModeEnabled = false,
  onToggleDagMode,
  dagOrientation = 'td',
  onDagOrientationChange,
  expandedCycleCount = 0,
  onCollapseCycles,
}) => {
  const srs = useSRS();

  // NEW: Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [hasNewDue, setHasNewDue] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupExactDraft, setGroupExactDraft] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);
  const reviewQueueRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const lastSeenReviewIdsRef = useRef<Set<string>>(new Set());
  const wasReviewQueueOpenRef = useRef(false);
  const canEdit = canEditProp ?? isOwner;
  const canImport = Boolean(isOwner && isEnrolled);
  const canBackup = Boolean(isOwner);
  const canShare = Boolean(isOwner && onManageAccess);

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

  useEffect(() => {
    if (!showGroupMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGroupMenu]);

  useEffect(() => {
    if (!showOptionsMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) {
        setShowOptionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showOptionsMenu]);

  useEffect(() => {
    if (groups.length === 0) {
      setDeleteGroupId(null);
      return;
    }
    if (!deleteGroupId || !groups.some(group => group.id === deleteGroupId)) {
      setDeleteGroupId(groups[0].id);
    }
  }, [groups, deleteGroupId]);

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

  const selectedGroupSeeds = selectedNodeIds.filter(nodeId => (
    !nodeId.startsWith('group:') && !nodeId.startsWith('cycle:') && !nodeId.startsWith('ext:')
  ));

  const handleCreateGroup = async () => {
    if (!onCreateGroup) return;
    const name = groupNameDraft.trim();
    if (!name) {
      showToast('Group name is required.', 'warning');
      return;
    }
    if (selectedGroupSeeds.length === 0) {
      showToast('Select at least one node to create a group.', 'warning');
      return;
    }
    try {
      await onCreateGroup(name, selectedGroupSeeds, groupExactDraft);
      setGroupNameDraft('');
      setGroupExactDraft(false);
      showToast('Group created.', 'success');
    } catch (error) {
      console.warn('Failed to create group:', error);
      showToast('Failed to create group.', 'error');
    }
  };

  const handleDeleteGroup = async () => {
    if (!onDeleteGroup || deleteGroupId === null) return;
    try {
      await onDeleteGroup(deleteGroupId);
      showToast('Group deleted.', 'success');
    } catch (error) {
      console.warn('Failed to delete group:', error);
      showToast('Failed to delete group.', 'error');
    }
  };

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
      showToast('Exporting graph...', 'info', 2000);
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

  const handleBackup = async () => {
    if (!currentDomainId || !currentDomainName) {
      showToast('No domain selected for backup', 'error');
      return;
    }

    setIsBackingUp(true);
    try {
      showToast('Preparing backup...', 'info', 2000);
      const blob = await fetchDomainBackup(currentDomainId);
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const safeBase = currentDomainName.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeBase}_backup_${timestamp}.zip`;
      downloadZipFile(blob, filename);
      showToast(`Backup for "${currentDomainName}" downloaded.`, 'success');
    } catch (error) {
      console.error('Backup error:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to download backup',
        'error'
      );
    } finally {
      setIsBackingUp(false);
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

        {currentDomainId && (
          <div className="relative" ref={optionsMenuRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOptionsMenu(prev => !prev)}
              className="h-7 px-2 text-xs"
            >
              <MoreVertical size={12} className="mr-1" />
              Options
            </Button>
            {showOptionsMenu && (
              <div className="absolute left-0 mt-2 w-40 rounded-md border border-gray-200 bg-white shadow-lg z-50 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    handleOpenImportDialog();
                  }}
                  disabled={!canImport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  title={!canImport ? 'Only enrolled owners can import data' : 'Import JSON or ZIP'}
                >
                  <Upload size={14} />
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    handleExport();
                  }}
                  disabled={isExporting}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {isExporting ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    handleBackup();
                  }}
                  disabled={!canBackup || isBackingUp}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  title={!canBackup ? 'Only owners can download backups' : 'Download full backup'}
                >
                  {isBackingUp ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  Backup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOptionsMenu(false);
                    onManageAccess?.();
                  }}
                  disabled={!canShare}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                  title={!canShare ? 'Only owners can manage access' : 'Manage access'}
                >
                  <Users size={14} />
                  Share
                </button>
              </div>
            )}
          </div>
        )}

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

          {onToggleDagMode && (
            <Button
              variant={dagModeEnabled ? "secondary" : "ghost"}
              size="sm"
              onClick={onToggleDagMode}
              title={dagModeEnabled ? "DAG layout enabled" : "Switch to DAG layout"}
              className="h-7 px-2 text-xs"
            >
              <GitBranch size={12} className="mr-1" /> DAG
            </Button>
          )}

          {onDagOrientationChange && (
            <select
              value={dagOrientation}
              onChange={(event) => onDagOrientationChange(event.target.value as any)}
              disabled={!dagModeEnabled}
              className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 disabled:bg-gray-100"
              title="DAG orientation"
            >
              <option value="td">Top-down</option>
              <option value="bu">Bottom-up</option>
              <option value="lr">Left-right</option>
              <option value="rl">Right-left</option>
              <option value="radialout">Radial out</option>
              <option value="radialin">Radial in</option>
            </select>
          )}

          {expandedCycleCount > 0 && onCollapseCycles && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCollapseCycles}
              title="Collapse expanded cycles"
              className="h-7 px-2 text-xs"
            >
              Collapse ({expandedCycleCount})
            </Button>
          )}

          {(onCreateGroup || onToggleGroupCollapse || onDeleteGroup) && (
            <div className="relative" ref={groupMenuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGroupMenu(prev => !prev)}
                title="Manage groups"
                className="h-7 px-2 text-xs"
              >
                <List size={12} className="mr-1" /> Groups
              </Button>

              {showGroupMenu && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-md shadow-lg border z-30 overflow-hidden">
                  <div className="px-3 py-2 border-b text-xs font-semibold text-gray-700">Groups</div>

                  {onCreateGroup && (
                    <div className="px-3 py-2 border-b space-y-2">
                      <div className="text-[11px] font-semibold text-gray-700">Create group</div>
                      <input
                        value={groupNameDraft}
                        onChange={(event) => setGroupNameDraft(event.target.value)}
                        placeholder="Group name"
                        className="w-full h-8 rounded border border-gray-200 px-2 text-xs"
                      />
                      <label className="flex items-center gap-2 text-[11px] text-gray-600">
                        <input
                          type="checkbox"
                          checked={groupExactDraft}
                          onChange={(event) => setGroupExactDraft(event.target.checked)}
                        />
                        Pin exact membership (test)
                      </label>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-500">
                          Selected: {selectedGroupSeeds.length}
                        </span>
                        <Button
                          size="sm"
                          onClick={handleCreateGroup}
                          disabled={!canEdit || selectedGroupSeeds.length === 0 || groupNameDraft.trim().length === 0}
                        >
                          Create
                        </Button>
                      </div>
                    </div>
                  )}

                  {onToggleGroupCollapse && groups.length > 0 && (
                    <div className="max-h-52 overflow-y-auto border-b">
                      {groups.map(group => (
                        <button
                          key={group.id}
                          type="button"
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50"
                          onClick={() => onToggleGroupCollapse(group.id, !group.collapsed)}
                        >
                          <div className="flex items-center gap-2">
                            <input type="checkbox" readOnly checked={group.collapsed} />
                            <span className="truncate">{group.name}</span>
                          </div>
                          <span className="text-[10px] text-gray-500">{group.memberCount}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {onDeleteGroup && (
                    <div className="px-3 py-2 space-y-2">
                      <div className="text-[11px] font-semibold text-gray-700">Delete group</div>
                      {groups.length === 0 ? (
                        <div className="text-[11px] text-gray-500">No groups to delete.</div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={deleteGroupId ?? ''}
                            onChange={(event) => setDeleteGroupId(Number(event.target.value))}
                            className="flex-1 h-8 rounded border border-gray-200 px-2 text-xs"
                          >
                            {groups.map(group => (
                              <option key={group.id} value={group.id}>
                                {group.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleDeleteGroup}
                            disabled={!canEdit || deleteGroupId === null}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
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

        {/* Creation buttons - disabled if no edit access */}
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateDefinition}
          disabled={!canEdit}
          title={!canEdit ? "Only domain owners or editors can create definitions" : "Add Definition"}
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
            title={!canEdit ? "Only domain owners or editors can create exercises" : "Add Exercise"}
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
            title={!canEdit ? "Only domain owners or editors can save positions" : "Save current node positions"}
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
