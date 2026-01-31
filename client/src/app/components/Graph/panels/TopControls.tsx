// TopControls.tsx - Enhanced version with import/export functionality
"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Book, BarChart, Plus, Play, Users, AlertTriangle, Zap, List, Wrench, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { AppMode } from '../utils/types';
import { useSRS } from '@/contexts/SRSContext';
import DomainSelector from './DomainSelector';
import NotificationCenter from '@/app/components/Notifications/NotificationCenter';
import { getSurveyQueue, SurveyQueueItem } from '@/lib/api';

interface TopControlsProps {
  subjectMatterId: string;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onCreateDefinition: () => void;
  onCreateExercise: () => void;
  onStartStudy: () => void;
  isEnrolled?: boolean;
  onEnroll?: () => void;
  onOpenSurvey?: () => void;
  surveyDueCount?: number;
  
  // Graph state info (dev)
  graphDimensions?: { width: number; height: number; availableWidth: number; availableHeight: number };
  currentDomainId?: number;
  onNavigateToNode?: (nodeCode: string) => void;
  canEdit?: boolean;
}

const TopControls: React.FC<TopControlsProps> = ({
  subjectMatterId,
  mode,
  onModeChange,
  onCreateDefinition,
  onCreateExercise,
  onStartStudy,
  isEnrolled = true,
  onEnroll,
  onOpenSurvey,
  surveyDueCount = 0,
  graphDimensions,
  currentDomainId,
  onNavigateToNode,
  canEdit: canEditProp,
}) => {
  const srs = useSRS();

  const [showReviewQueue, setShowReviewQueue] = useState(false);
  const [showSurveyQueue, setShowSurveyQueue] = useState(false);
  const [hasNewDue, setHasNewDue] = useState(false);
  const reviewQueueRef = useRef<HTMLDivElement>(null);
  const surveyQueueRef = useRef<HTMLDivElement>(null);
  const lastSeenReviewIdsRef = useRef<Set<string>>(new Set());
  const wasReviewQueueOpenRef = useRef(false);
  const wasSurveyQueueOpenRef = useRef(false);
  const canEdit = canEditProp ?? false;
  const [surveyQueue, setSurveyQueue] = useState<SurveyQueueItem[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [surveyError, setSurveyError] = useState<string | null>(null);

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
    if (isEnrolled) return;
    setShowSurveyQueue(false);
  }, [isEnrolled]);

  useEffect(() => {
    setShowSurveyQueue(false);
  }, [currentDomainId]);

  useEffect(() => {
    const handleCanvasClick = () => {
      setShowReviewQueue(false);
      setShowSurveyQueue(false);
    };
    window.addEventListener('canvas-click', handleCanvasClick);
    return () => {
      window.removeEventListener('canvas-click', handleCanvasClick);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (surveyQueueRef.current && !surveyQueueRef.current.contains(event.target as Node)) {
        setShowSurveyQueue(false);
      }
    };

    if (showSurveyQueue) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSurveyQueue]);

  const refreshSurveyQueue = useCallback(async () => {
    if (!currentDomainId) return;
    setSurveyLoading(true);
    setSurveyError(null);
    try {
      const items = await getSurveyQueue(currentDomainId);
      setSurveyQueue(items);
    } catch (error) {
      console.warn('Failed to refresh survey queue:', error);
      setSurveyError('Failed to load survey queue.');
    } finally {
      setSurveyLoading(false);
    }
  }, [currentDomainId]);

  useEffect(() => {
    if (!showSurveyQueue) {
      wasSurveyQueueOpenRef.current = false;
      return;
    }

    if (!wasSurveyQueueOpenRef.current) {
      refreshSurveyQueue();
    }

    wasSurveyQueueOpenRef.current = true;
  }, [showSurveyQueue, refreshSurveyQueue]);

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
    setShowSurveyQueue(false);
    setShowReviewQueue(prev => !prev);
  };

  const handleToggleSurveyQueue = () => {
    if (!isEnrolled) return;
    setShowReviewQueue(false);
    setShowSurveyQueue(prev => !prev);
  };

  // NEW: Calculate available space info for debugging
  const spaceInfo = graphDimensions ? 
    `${graphDimensions.availableWidth}x${graphDimensions.availableHeight}` : 
    'Loading...';

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
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowReviewQueue(false)}
              />
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
            </>
          )}
        </div>

        <div className="relative" ref={surveyQueueRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleSurveyQueue}
            disabled={!isEnrolled}
            className="flex items-center"
            title={!isEnrolled ? "Enroll in domain to access Survey" : "Survey queue"}
          >
            <List size={14} className="mr-1" />
            Survey
            {surveyDueCount > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 text-amber-700 text-[11px] font-semibold px-2 py-0.5">
                {surveyDueCount}
              </span>
            )}
          </Button>

          {showSurveyQueue && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowSurveyQueue(false)}
              />
              <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border z-30 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div className="text-sm font-semibold text-gray-800">Survey Queue</div>
                  <button
                    type="button"
                    onClick={refreshSurveyQueue}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-orange-500"
                  >
                    <RefreshCw size={12} />
                    Refresh
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {surveyLoading ? (
                    <div className="px-4 py-6 text-sm text-gray-500">Loading survey queue...</div>
                  ) : surveyError ? (
                    <div className="px-4 py-6 text-sm text-red-500">{surveyError}</div>
                  ) : surveyQueue.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500">No quests due right now.</div>
                  ) : (
                    <ul className="py-2">
                      {surveyQueue.map((item) => (
                        <li key={item.questId}>
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateToNode && item.questCode) {
                                onNavigateToNode(item.questCode);
                              }
                              setShowSurveyQueue(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {item.questName || item.questCode}
                              </span>
                              <span className="text-[10px] font-semibold uppercase text-gray-400">
                                {item.questKind}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                              <span className="truncate">{item.questCode}</span>
                              <span>
                                {item.nextDueAt
                                  ? `${item.isOverdue ? 'Overdue' : 'Due'} ${new Date(item.nextDueAt).toLocaleString()}`
                                  : 'Not scheduled'}
                              </span>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Creation + Alerts + Options */}
      <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
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

        <NotificationCenter suppressDomainId={currentDomainId} />

        <Button
          variant="outline"
          size="sm"
          onClick={() => {}}
          className="flex items-center"
          title="Options"
        >
          Options
          <Wrench size={14} className="ml-1" />
        </Button>
      </div>
    </div>
  );
};

export default TopControls;
