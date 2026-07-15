// client/src/app/components/Graph/windows/ReviewWindowContent.tsx
//
// Thin client of the server-driven session engine: the server owns the queue,
// frenzy rounds, credit simulation and all stats; this window renders the
// current item and posts grades.
"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from "@/app/components/core/button";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { InlineMarkdownKatex, MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import ZoomableImage from '../components/ZoomableImage';
import { useSRS } from '@/contexts/SRSContext';
import { useUI } from '@/contexts/UIContext';
import { ReviewQuality, SessionType, SessionEngineItem } from '@/types/srs';
import { Eye, Loader2, CheckCircle, MapPin } from 'lucide-react';
import { showToast } from '@/app/components/core/ToastNotification';
import type { UserDomainSettings, UserDomainSettingsUpdate } from '@/lib/api';
import { getSessionItem, gradeSession } from '@/lib/srs-api';
import { dispatchReviewSubmissionState, REVIEW_ITEM_CONTENT_UPDATED_EVENT, type ReviewItemContentUpdatedDetail } from '../utils/reviewSyncEvents';

interface ReviewWindowContentProps {
  domainId: number;
  onNavigateToNode?: (nodeCode: string, options?: { targetVersionId?: number; autoNavigate?: boolean }) => void;
  windowId: string;
  reviewMode?: 'normal' | 'frenzy';
  appMode: 'study' | 'practice';
  domainSettings?: UserDomainSettings | null;
  onUpdateDomainSettings?: (updates: UserDomainSettingsUpdate) => Promise<UserDomainSettings | void>;
}

export const ReviewWindowContent: React.FC<ReviewWindowContentProps> = ({
  domainId,
  onNavigateToNode,
  windowId,
  reviewMode = 'normal',
  appMode,
  domainSettings,
  onUpdateDomainSettings,
}) => {
  const srs = useSRS();
  const ui = useUI();
  const isFrenzyMode = reviewMode === 'frenzy';

  const allowedSessionTypes = useMemo<SessionType[]>(() => (
    appMode === 'study' ? ['definition'] : ['definition', 'exercise', 'mixed']
  ), [appMode]);
  const defaultExercisesPerDefinition = domainSettings?.preferences?.review?.exercisesPerDefinition;
  const [sessionType, setSessionType] = useState<SessionType>(() => allowedSessionTypes[0] ?? 'definition');
  const [useFoundationsOrder, setUseFoundationsOrder] = useState(false);
  const [engineItem, setEngineItem] = useState<SessionEngineItem | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [autoNavigateToNodes, setAutoNavigateToNodes] = useState(false);
  const [exercisesPerDefinition, setExercisesPerDefinition] = useState<number>(() => {
    if (typeof defaultExercisesPerDefinition === 'number' && Number.isFinite(defaultExercisesPerDefinition) && defaultExercisesPerDefinition > 0) {
      return Math.floor(defaultExercisesPerDefinition);
    }
    return 1;
  });
  // User answer state for non-verifiable exercises
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [answerPreview, setAnswerPreview] = useState<boolean>(false);
  const [showAnswerSection, setShowAnswerSection] = useState<boolean>(false);

  const hasInitialized = useRef(false);
  const isCleaningUp = useRef(false);

  const currentItem = engineItem?.item ?? null;
  const itemDetails: any = engineItem?.exerciseVersion ?? engineItem?.definitionVersion ?? null;
  const isExerciseItem = !!engineItem?.exerciseVersion;
  const currentExerciseMeta = useMemo(() => {
    if (!currentItem) return null;
    if (currentItem.exerciseMetaId) {
      return {
        id: currentItem.exerciseMetaId,
        code: currentItem.exerciseMetaCode ?? currentItem.nodeCode,
        name: currentItem.exerciseMetaName ?? currentItem.nodeName,
      };
    }
    if (currentItem.nodeType === 'exercise') {
      return { id: currentItem.nodeId, code: currentItem.nodeCode, name: currentItem.nodeName };
    }
    return null;
  }, [currentItem]);

  // Initialize domain
  useEffect(() => {
    if (domainId && !hasInitialized.current) {
      srs.setCurrentDomain(domainId);
      hasInitialized.current = true;
    }
  }, [domainId, srs]);

  useEffect(() => {
    if (!allowedSessionTypes.includes(sessionType)) {
      setSessionType(allowedSessionTypes[0] ?? 'definition');
    }
  }, [allowedSessionTypes, sessionType]);

  useEffect(() => {
    if (srs.state.currentSession) return;
    if (typeof defaultExercisesPerDefinition === 'number' && Number.isFinite(defaultExercisesPerDefinition) && defaultExercisesPerDefinition > 0) {
      setExercisesPerDefinition(Math.floor(defaultExercisesPerDefinition));
    } else {
      setExercisesPerDefinition(1);
    }
  }, [defaultExercisesPerDefinition, srs.state.currentSession]);

  // Persist the exercises-per-definition preference (server-side settings).
  useEffect(() => {
    if (!onUpdateDomainSettings) return;
    if (srs.state.currentSession) return;
    const normalized = Number.isFinite(exercisesPerDefinition) && exercisesPerDefinition > 0
      ? Math.floor(exercisesPerDefinition)
      : 1;
    const currentDefault = (typeof defaultExercisesPerDefinition === 'number' && Number.isFinite(defaultExercisesPerDefinition) && defaultExercisesPerDefinition > 0)
      ? Math.floor(defaultExercisesPerDefinition)
      : 1;
    if (normalized === currentDefault) return;
    const timer = setTimeout(() => {
      onUpdateDomainSettings({
        preferences: {
          review: { exercisesPerDefinition: normalized },
        },
      }).catch((error) => {
        console.warn('Failed to update exercises per definition:', error);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [defaultExercisesPerDefinition, exercisesPerDefinition, onUpdateDomainSettings, srs.state.currentSession]);

  const applyEngineItem = useCallback((item: SessionEngineItem) => {
    setEngineItem(item);
    setShowAnswer(false);
    setAnswerPreview(false);
    setShowAnswerSection(false);
    setUserAnswer("");
    setStartTime(Date.now());

    if (item.lastReview) {
      srs.applyReviewOutcome(item.lastReview);
    }

    if (item.done || !item.item) {
      ui.setReviewState(false, null, false);
      return;
    }

    ui.setReviewState(true, item.item.nodeCode, false);

    if (autoNavigateToNodes && onNavigateToNode && item.item.nodeCode) {
      const navigateCode = item.item.exerciseMetaCode ?? item.item.nodeCode;
      const details: any = item.exerciseVersion ?? item.definitionVersion;
      const targetVersionId = typeof details?.id === 'number' ? details.id : undefined;
      setTimeout(() => {
        onNavigateToNode(navigateCode, { targetVersionId, autoNavigate: true });
      }, 100);
    }
  }, [autoNavigateToNodes, onNavigateToNode, srs, ui]);

  // Refresh the current item's content (same version) after edits elsewhere.
  const refreshCurrentItem = useCallback(async () => {
    const session = srs.state.currentSession;
    if (!session || !engineItem || engineItem.done) return;
    try {
      const item = await getSessionItem(session.id);
      setEngineItem(prev => (prev && !prev.done ? { ...prev, ...item, lastReview: undefined } : prev));
    } catch (error) {
      console.warn('Failed to refresh current review item:', error);
    }
  }, [engineItem, srs.state.currentSession]);

  useEffect(() => {
    const handleReviewItemContentUpdated = (event: Event) => {
      if (!currentItem) return;
      const detail = (event as CustomEvent<ReviewItemContentUpdatedDetail>).detail;
      if (!detail) return;
      const activeNodeType = currentExerciseMeta ? 'exercise' : currentItem.nodeType;
      const activeMetaId = currentExerciseMeta?.id ?? currentItem.nodeId;
      if (detail.nodeType !== activeNodeType || detail.metaId !== activeMetaId) return;
      void refreshCurrentItem();
    };

    window.addEventListener(REVIEW_ITEM_CONTENT_UPDATED_EVENT, handleReviewItemContentUpdated as EventListener);
    return () => {
      window.removeEventListener(REVIEW_ITEM_CONTENT_UPDATED_EVENT, handleReviewItemContentUpdated as EventListener);
    };
  }, [currentItem, currentExerciseMeta, refreshCurrentItem]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isCleaningUp.current) return;
      isCleaningUp.current = true;
      ui.setReviewState(false, null, false);
      if (srs.state.currentSession) {
        srs.endStudySession().catch(console.error);
      }
    };
  }, [srs, ui]);

  // Handle session start
  const handleStartSession = useCallback(async () => {
    if (!domainId) {
      showToast("Domain ID is missing.", "error");
      return;
    }

    try {
      const engineState = await srs.startStudySession({
        sessionType,
        mode: isFrenzyMode ? 'frenzy' : 'normal',
        order: useFoundationsOrder ? 'foundations' : 'impact',
        exercisesPerDefinition,
      });
      if (!engineState) return;

      if (engineState.item.done || !engineState.item.item) {
        showToast("No items available for this session type.", "info");
        await srs.endStudySession();
        setEngineItem(null);
        return;
      }

      applyEngineItem(engineState.item);

      ui.updateWindow(windowId, {
        title: `${isFrenzyMode ? 'Frenzy Session' : 'Study Session'}: ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}`
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      showToast("Failed to start study session", "error");
    }
  }, [applyEngineItem, domainId, exercisesPerDefinition, isFrenzyMode, sessionType, srs, ui, useFoundationsOrder, windowId]);

  // Handle showing answer
  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
    setAnswerPreview(true);
    ui.showReviewAnswer();
  }, [ui]);

  // Navigate to current item in graph
  const handleNavigateToCurrentItem = useCallback(() => {
    if (currentItem && onNavigateToNode) {
      const targetNodeCode = currentExerciseMeta?.code || currentItem.nodeCode;
      const targetVersionId = typeof itemDetails?.id === 'number' ? itemDetails.id : undefined;
      onNavigateToNode(targetNodeCode, { targetVersionId });
      showToast("Navigated to node in graph", "info", 1500);
    }
  }, [currentExerciseMeta?.code, currentItem, itemDetails?.id, onNavigateToNode]);

  // Submit a grade for the current item; the server advances the session.
  const handleSubmitReview = useCallback(async (quality: ReviewQuality, skip = false) => {
    const session = srs.state.currentSession;
    if (!session || !currentItem || isGrading) return;

    const timeTaken = startTime !== null ? Math.round((Date.now() - startTime) / 1000) : 0;
    setIsGrading(true);
    dispatchReviewSubmissionState(true);
    try {
      const nextItem = await gradeSession(session.id, { quality, skip, timeTaken });
      applyEngineItem(nextItem);
      if (nextItem.done && !isFrenzyMode) {
        showToast("Study session complete!", "success");
      }
    } catch (error) {
      console.error('Failed to submit review:', error);
      showToast("Failed to submit review", "error");
    } finally {
      setIsGrading(false);
      dispatchReviewSubmissionState(false);
    }
  }, [applyEngineItem, currentItem, isFrenzyMode, isGrading, srs.state.currentSession, startTime]);

  const handleSkipReview = useCallback(async () => {
    if (!isFrenzyMode) return;
    await handleSubmitReview(0, true);
  }, [handleSubmitReview, isFrenzyMode]);

  // Handle session end
  const handleEndSession = useCallback(async () => {
    try {
      if (srs.state.currentSession) {
        await srs.endStudySession();
      }
      setEngineItem(null);
      setShowAnswer(false);
      setShowAnswerSection(false);
      setAnswerPreview(false);
      setUserAnswer("");
      setStartTime(null);
      ui.setReviewState(false, null, false);
      showToast("Session ended successfully", "success");
    } catch (error) {
      console.error('Failed to end session:', error);
      showToast("Failed to end session", "error");
    }
  }, [srs, ui]);

  // Render item content
  const renderItemContent = () => {
    if (!currentItem || !itemDetails) {
      return <p>No item to display.</p>;
    }

    const displayType = isExerciseItem ? 'exercise' : 'definition';
    const hasUserAnswer = userAnswer.trim().length > 0;

    return (
      <div className="space-y-4">
        {/* Item header */}
        <div className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span className="font-medium">{currentItem.nodeCode}</span>
            <span>•</span>
            <span className="capitalize">{currentItem.nodeType}</span>
            {currentExerciseMeta && currentItem.nodeType === 'definition' && (
              <>
                <span>•</span>
                <span className="capitalize">exercise</span>
                <span className="font-medium">{currentExerciseMeta.code}</span>
                {currentExerciseMeta.name && (
                  <span className="text-gray-500">{currentExerciseMeta.name}</span>
                )}
              </>
            )}
            {!currentItem.isDue && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs" title="Not due: graded as practice, SRS state unchanged">
                practice
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoNavigateToNodes}
                onChange={(e) => setAutoNavigateToNodes(e.target.checked)}
                className="mr-1 scale-75"
              />
              Auto-navigate
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNavigateToCurrentItem}
              className="h-6 px-2 text-xs"
              title="Show this item in the graph"
            >
              <MapPin size={12} className="mr-1" />
              Show in Graph
            </Button>
          </div>
        </div>

        {/* Content */}
        {displayType === 'definition' ? (
          <div>
            {/* Display the prompt from the definition version */}
            <h3 className="text-lg font-semibold mb-2">
              <InlineMarkdownKatex>{currentItem.nodeName}</InlineMarkdownKatex>
            </h3>
            <MarkdownKatex className="p-4 bg-blue-50 rounded-md border text-base mb-2 whitespace-pre-wrap">
              {itemDetails.prompt || "N/A"}
            </MarkdownKatex>
            {itemDetails.promptImagePath && (
              <div className="mb-3">
                <ZoomableImage src={itemDetails.promptImagePath} alt="Prompt image" />
              </div>
            )}
            {showAnswer && (itemDetails.description || itemDetails.descriptionImagePath) && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Additional Information:</p>
                <MarkdownKatex className="p-4 bg-gray-50 rounded-md border text-base whitespace-pre-wrap">
                  {itemDetails.description || "N/A"}
                </MarkdownKatex>
                {itemDetails.descriptionImagePath && (
                  <div className="mt-2">
                    <ZoomableImage src={itemDetails.descriptionImagePath} alt="Description image" />
                  </div>
                )}
              </div>
            )}
            {showAnswer && itemDetails.notes && (
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-700 mb-1">Notes:</p>
                <MarkdownKatex className="p-3 bg-yellow-50 rounded-md border border-yellow-200 text-sm whitespace-pre-wrap">
                  {itemDetails.notes}
                </MarkdownKatex>
              </div>
            )}
            {showAnswer && itemDetails.references && itemDetails.references.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-700 mb-1">References:</p>
                <ul className="list-disc list-inside text-sm text-blue-600">
                  {itemDetails.references.map((ref: string, idx: number) => (
                    <li key={idx}>
                      <a href={ref} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {ref}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Render math-enabled inline title (KaTeX) */}
            <h3 className="text-lg font-semibold mb-2">
              Exercise: <InlineMarkdownKatex>{currentExerciseMeta?.name || itemDetails.name || currentItem.nodeName}</InlineMarkdownKatex>
            </h3>
            <MarkdownKatex className="p-4 bg-gray-50 rounded-md border text-base mb-2 whitespace-pre-wrap">{itemDetails.statement || "N/A"}</MarkdownKatex>
            {itemDetails.statementImagePath && (
              <div className="mb-3">
                <ZoomableImage src={itemDetails.statementImagePath} alt="Statement image" />
              </div>
            )}

            {/* Non-verifiable: input + preview toggle before reveal */}
            {itemDetails?.verifiable === false && !showAnswer && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-700">Your Answer</p>
                  <div className="flex items-center gap-1">
                    {showAnswerSection && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-1"
                        onClick={() => setAnswerPreview(v => !v)}
                      >
                        {answerPreview ? 'Edit' : 'Preview'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-1"
                      onClick={() => {
                        setShowAnswerSection(v => {
                          const next = !v;
                          if (!next) setAnswerPreview(false);
                          return next;
                        });
                      }}
                    >
                      {showAnswerSection ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </div>
                {showAnswerSection && (
                  answerPreview ? (
                    <div className="bg-gray-50 border border-gray-200 rounded p-2 text-sm">
                      {hasUserAnswer ? (
                        <MarkdownKatex className="whitespace-pre-wrap">{userAnswer}</MarkdownKatex>
                      ) : (
                        <span className="text-gray-400 italic">Nothing to preview</span>
                      )}
                    </div>
                  ) : (
                    <textarea
                      className="w-full border border-gray-300 rounded p-2 h-20 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
                      placeholder="Enter your answer..."
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                    />
                  )
                )}
              </div>
            )}

            {/* Non-verifiable: after reveal show side-by-side compare */}
            {itemDetails?.verifiable === false && showAnswer && (
              <div className={`mt-3 grid grid-cols-1 ${hasUserAnswer ? 'md:grid-cols-2' : ''} gap-3`}>
                {hasUserAnswer && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-700">Your Answer</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-1"
                        onClick={() => setAnswerPreview(v => !v)}
                      >
                        {answerPreview ? 'Edit' : 'Preview'}
                      </Button>
                    </div>
                    {answerPreview ? (
                      <div className="p-3 bg-gray-50 rounded-md border text-sm whitespace-pre-wrap">
                        <MarkdownKatex className="whitespace-pre-wrap">{userAnswer}</MarkdownKatex>
                      </div>
                    ) : (
                      <textarea
                        className="w-full border border-gray-300 rounded p-2 h-40 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
                        placeholder="Edit your answer..."
                        value={userAnswer}
                        onChange={(e) => setUserAnswer(e.target.value)}
                      />
                    )}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Solution</p>
                  <MarkdownKatex className="p-3 bg-green-50 rounded-md border border-green-200 text-sm whitespace-pre-wrap">
                    {itemDetails.description || "N/A"}
                  </MarkdownKatex>
                  {itemDetails.descriptionImagePath && (
                    <div className="mt-2">
                      <ZoomableImage src={itemDetails.descriptionImagePath} alt="Solution image" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Verifiable (or unknown): keep existing one-column solution on reveal */}
            {itemDetails?.verifiable !== false && showAnswer && (
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-700 mb-1">Solution:</p>
                <MarkdownKatex className="p-4 bg-green-50 rounded-md border border-green-200 text-base whitespace-pre-wrap">
                  {itemDetails.description || "N/A"}
                </MarkdownKatex>
                {itemDetails.descriptionImagePath && (
                  <div className="mt-2">
                    <ZoomableImage src={itemDetails.descriptionImagePath} alt="Solution image" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Quality scale: Again fails; Hard barely passes (SM-2 quality 3).
  const qualityButtons: { label: string; quality: ReviewQuality, color: string }[] = [
    { label: "Again", quality: 0, color: "bg-red-500 hover:bg-red-600" },
    { label: "Hard", quality: 3, color: "bg-orange-500 hover:bg-orange-600" },
    { label: "Good", quality: 4, color: "bg-blue-500 hover:bg-blue-600" },
    { label: "Easy", quality: 5, color: "bg-green-500 hover:bg-green-600" },
  ];

  const completed = engineItem?.completed ?? 0;
  const correct = engineItem?.correct ?? 0;
  const totalPlanned = engineItem?.totalPlanned ?? 0;
  const round = engineItem?.round ?? 1;
  const sessionDone = !!engineItem?.done;

  return (
      <div className="h-full flex flex-col">
        {!srs.state.currentSession ? (
          <div className="p-6 text-center flex flex-col justify-center h-full">
            <h2 className="text-xl font-semibold mb-4">Select Session Type</h2>
            <Tabs value={sessionType} onValueChange={(value) => setSessionType(value as SessionType)}>
              <TabsList className="mb-4">
                {allowedSessionTypes.includes('definition') && (
                  <TabsTrigger value="definition">Definitions</TabsTrigger>
                )}
                {allowedSessionTypes.includes('exercise') && (
                  <TabsTrigger value="exercise">Exercises</TabsTrigger>
                )}
                {allowedSessionTypes.includes('mixed') && (
                  <TabsTrigger value="mixed">Mixed</TabsTrigger>
                )}
              </TabsList>
            </Tabs>
            {!isFrenzyMode && (
              <label className="flex items-center justify-center text-sm text-gray-600 mb-4">
                <input
                  type="checkbox"
                  checked={useFoundationsOrder}
                  onChange={(e) => setUseFoundationsOrder(e.target.checked)}
                  className="mr-2"
                />
                Foundations first (prerequisites before dependents)
              </label>
            )}
            {appMode === 'practice' && sessionType !== 'definition' && (
              <label className="flex items-center justify-center text-sm text-gray-600 mb-4">
                <span className="mr-2">Exercises per definition</span>
                <input
                  type="number"
                  min={1}
                  value={exercisesPerDefinition}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    setExercisesPerDefinition(Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1);
                  }}
                  className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
                />
              </label>
            )}
            <div className="space-y-2">
              <Button
                onClick={handleStartSession}
                size="lg"
                disabled={srs.state.loading}
                className="w-full"
              >
                {srs.state.loading ? <Loader2 className="animate-spin mr-2" /> : null}
                {isFrenzyMode ? 'Start Frenzy Session' : 'Start Session'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentItem && !sessionDone ? (
                <>
                  <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                    <span>
                      {isFrenzyMode ? `Round ${round} • ` : ''}
                      Item {completed + 1} of {totalPlanned}
                    </span>
                    <span>Correct: {correct} / {completed}</span>
                  </div>
                  {renderItemContent()}
                </>
              ) : (
                <div className="text-center py-10">
                  {srs.state.loading || isGrading ? (
                    <Loader2 className="animate-spin h-10 w-10 mx-auto text-orange-500" />
                  ) : sessionDone ? (
                    <div>
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                      <p className="text-xl font-semibold">Session Complete!</p>
                      <p>You reviewed {completed} items.</p>
                      <p>
                        Correct: {correct}
                        ({completed > 0 ? Math.round((correct / completed) * 100) : 0}%)
                      </p>
                      <Button
                        onClick={handleEndSession}
                        size="sm"
                        className="mt-4"
                      >
                        End Session
                      </Button>
                    </div>
                  ) : (
                    <p>Loading next item or no items due...</p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t p-4 space-y-3">
              {!showAnswer && currentItem && !sessionDone && (
                <Button
                  onClick={handleShowAnswer}
                  className="w-full"
                  variant="outline"
                  size="lg"
                >
                  <Eye className="mr-2 h-5 w-5" /> Show Answer
                </Button>
              )}

              {showAnswer && currentItem && !sessionDone && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
                  {qualityButtons.map(btn => (
                    <Button
                      key={btn.quality}
                      onClick={() => handleSubmitReview(btn.quality)}
                      className={`text-white py-3 text-base ${btn.color}`}
                      disabled={isGrading}
                    >
                      {isGrading ? <Loader2 className="animate-spin mr-2" /> : null}
                      {btn.label}
                    </Button>
                  ))}
                </div>
              )}

              {isFrenzyMode && currentItem && !sessionDone && (
                <Button
                  onClick={handleSkipReview}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={isGrading}
                >
                  Skip Item
                </Button>
              )}

              {currentItem && !sessionDone && (
                <Button
                  onClick={handleEndSession}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                >
                  End Session Early
                </Button>
              )}
            </div>
          </>
        )}
      </div>

  );
};
