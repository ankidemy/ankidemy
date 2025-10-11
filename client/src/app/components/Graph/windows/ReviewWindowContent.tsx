// client/src/app/components/Graph/windows/ReviewWindowContent.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { MathJaxProvider, InlineMath, MathText } from '@/app/components/core/MathJaxWrapper';
import { useSRS } from '@/contexts/SRSContext';
import { useUI } from '@/contexts/UIContext';
import { DueReview, ReviewQuality, ReviewRequest, SessionType } from '@/types/srs';
import { Eye, Loader2, CheckCircle, MapPin } from 'lucide-react';
import { showToast } from '@/app/components/core/ToastNotification';
import { getDefinition, getExercise } from '@/lib/api';

interface ReviewWindowContentProps {
  domainId: number;
  onNavigateToNode?: (nodeCode: string) => void;
  windowId: string;
}

export const ReviewWindowContent: React.FC<ReviewWindowContentProps> = ({ 
  domainId, 
  onNavigateToNode,
  windowId
}) => {
  const srs = useSRS();
  const ui = useUI();
  
  const [sessionType, setSessionType] = useState<SessionType>('mixed');
  const [currentReviewItem, setCurrentReviewItem] = useState<DueReview | null>(null);
  const [reviewQueue, setReviewQueue] = useState<DueReview[]>([]);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [sessionStats, setSessionStats] = useState({ total: 0, completed: 0, correct: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [autoNavigateToNodes, setAutoNavigateToNodes] = useState(false);
  
  // FIX 1: Add refresh mechanism to update item details when nodes are edited
  const currentItemIdRef = useRef<string | null>(null);
  
  // Use refs to prevent infinite loops
  const hasInitialized = useRef(false);
  const isCleaningUp = useRef(false);

  // Initialize domain
  useEffect(() => {
    if (domainId && !hasInitialized.current) {
      srs.setCurrentDomain(domainId);
      hasInitialized.current = true;
    }
  }, [domainId, srs]);

  // FIX 1: Listen for data changes and refresh current item if needed
  useEffect(() => {
    if (currentReviewItem && currentItemIdRef.current === currentReviewItem.nodeCode) {
      // Refresh current item details when domain data changes
      const refreshCurrentItem = async () => {
        try {
          let details;
          if (currentReviewItem.nodeType === 'definition') {
            details = await getDefinition(currentReviewItem.nodeId);
          } else {
            details = await getExercise(currentReviewItem.nodeId);
          }
          setItemDetails(details);
        } catch (error) {
          console.error("Error refreshing current item:", error);
        }
      };
      
      refreshCurrentItem();
    }
  }, [srs.state.lastUpdated, currentReviewItem]);

  // Separate cleanup effect with stable dependencies
  useEffect(() => {
    return () => {
      if (isCleaningUp.current) return;
      isCleaningUp.current = true;
      
      console.log('Review window unmounting, cleaning up...');
      
      // Clean up review state
      ui.setReviewState(false, null, false);
      
      // End session if active
      if (srs.state.currentSession) {
        console.log('Ending active session...');
        srs.endStudySession().catch(console.error);
      }
    };
  }, []);

  // Handle session start
  const handleStartSession = useCallback(async () => {
    if (!domainId) {
      showToast("Domain ID is missing.", "error");
      return;
    }
    
    try {
      await srs.startStudySession(sessionType);
      setStartTime(Date.now());
      
      // Update window title
      ui.updateWindow(windowId, {
        title: `Study Session: ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}`
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      showToast("Failed to start study session", "error");
    }
  }, [domainId, sessionType, srs, ui, windowId]);

  // Load review items when session starts
  useEffect(() => {
    if (srs.state.currentSession && srs.state.dueReviews.length > 0 && !currentReviewItem) {
      const filteredReviews = srs.state.dueReviews.filter(review => {
        if (sessionType === 'mixed') return true;
        return review.nodeType === sessionType;
      });
      
      setReviewQueue(filteredReviews);
      setSessionStats(prev => ({ 
        ...prev, 
        total: filteredReviews.length, 
        completed: 0, 
        correct: 0 
      }));
      
      if (filteredReviews.length > 0) {
        loadReviewItem(filteredReviews[0]);
      } else {
        showToast("No items due for this session type.", "info");
        srs.endStudySession();
      }
    }
  }, [srs.state.currentSession, srs.state.dueReviews, sessionType, currentReviewItem, srs]);

  // Load a review item
  const loadReviewItem = useCallback(async (review: DueReview | undefined) => {
    if (!review) {
      setCurrentReviewItem(null);
      setItemDetails(null);
      currentItemIdRef.current = null;
      // Clear review state when no more items
      ui.setReviewState(false, null, false);
      
      if (srs.state.currentSession) {
        showToast("Study session complete!", "success");
        await srs.endStudySession();
      }
      return;
    }

    setIsLoadingItem(true);
    setShowAnswer(false);
    setCurrentReviewItem(review);
    currentItemIdRef.current = review.nodeCode;
    
    // Set review state in UI context (for anti-cheat)
    ui.setReviewState(true, review.nodeCode, false);

    try {
      let details;
      if (review.nodeType === 'definition') {
        details = await getDefinition(review.nodeId);
      } else {
        details = await getExercise(review.nodeId);
      }
      setItemDetails(details);
      
      // Auto-navigate if enabled
      if (autoNavigateToNodes && onNavigateToNode && review.nodeCode) {
        setTimeout(() => {
          onNavigateToNode(review.nodeCode);
        }, 100);
      }
    } catch (error) {
      console.error("Error fetching item details:", error);
      showToast("Failed to load review item.", "error");
    } finally {
      setIsLoadingItem(false);
    }
  }, [autoNavigateToNodes, onNavigateToNode, srs, ui]);

  // Handle showing answer
  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
    ui.showReviewAnswer();
  }, [ui]);

  // Navigate to current item in graph
  const handleNavigateToCurrentItem = useCallback(() => {
    if (currentReviewItem && onNavigateToNode) {
      onNavigateToNode(currentReviewItem.nodeCode);
      showToast("Navigated to node in graph", "info", 1500);
    }
  }, [currentReviewItem, onNavigateToNode]);

  // Submit review
  const handleSubmitReview = useCallback(async (quality: ReviewQuality) => {
    if (!currentReviewItem || !srs.state.currentSession || startTime === null) return;

    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    const reviewData: ReviewRequest = {
      nodeId: currentReviewItem.nodeId,
      nodeType: currentReviewItem.nodeType,
      success: quality >= 3,
      quality: quality,
      timeTaken: timeTaken,
      sessionId: srs.state.currentSession.id,
    };

    try {
      await srs.submitReview(reviewData);

      setSessionStats(prev => ({
        ...prev,
        completed: prev.completed + 1,
        correct: prev.correct + (quality >= 3 ? 1 : 0),
      }));
      
      setStartTime(Date.now());
      
      // Move to next item
      const newQueue = reviewQueue.slice(1);
      setReviewQueue(newQueue);
      loadReviewItem(newQueue[0]);
    } catch (error) {
      console.error('Failed to submit review:', error);
      showToast("Failed to submit review", "error");
    }
  }, [currentReviewItem, srs, startTime, reviewQueue, loadReviewItem]);

  // Handle session end properly
  const handleEndSession = useCallback(async () => {
    try {
      if (srs.state.currentSession) {
        await srs.endStudySession();
      }
      
      // Clear states
      setCurrentReviewItem(null);
      setReviewQueue([]);
      setSessionStats({ total: 0, completed: 0, correct: 0 });
      setStartTime(null);
      setShowAnswer(false);
      setItemDetails(null);
      currentItemIdRef.current = null;
      
      // Clear review state in UI context
      ui.setReviewState(false, null, false);
      
      showToast("Session ended successfully", "success");
    } catch (error) {
      console.error('Failed to end session:', error);
      showToast("Failed to end session", "error");
    }
  }, [srs, ui]);

  // Render item content
  const renderItemContent = () => {
    if (isLoadingItem) {
      return <Loader2 className="animate-spin h-8 w-8 mx-auto text-orange-500" />;
    }
    
    if (!currentReviewItem || !itemDetails) {
      return <p>No item to display.</p>;
    }

    return (
      <div className="space-y-4">
        {/* Item header */}
        <div className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <span className="font-medium">{currentReviewItem.nodeCode}</span>
            <span>•</span>
            <span className="capitalize">{currentReviewItem.nodeType}</span>
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
        {currentReviewItem.nodeType === 'definition' ? (
          <div>
            {/* FIX 2: Wrap node name for LaTeX rendering (InlineMath) */}
            <h3 className="text-lg font-semibold mb-2">
              Define: <InlineMath text={itemDetails.name} />
            </h3>
            {showAnswer && (
              <MathText className="p-4 bg-gray-50 rounded-md border text-base whitespace-pre-wrap" text={itemDetails.description?.split('|||')[0] || "N/A"} />
            )}
          </div>
        ) : (
          <div>
            {/* FIX 2: Wrap node name for LaTeX rendering (InlineMath) */}
            <h3 className="text-lg font-semibold mb-2">
              Exercise: <InlineMath text={itemDetails.name} />
            </h3>
            {/* FIX 3: Add whitespace-pre-wrap for line breaks */}
            <MathText className="p-4 bg-gray-50 rounded-md border text-base mb-2 whitespace-pre-wrap" text={itemDetails.statement || "N/A"} />
            {showAnswer && (
              <MathText className="p-4 bg-green-50 rounded-md border border-green-200 text-base whitespace-pre-wrap" text={`Solution: ${itemDetails.description || "N/A"}`} />
            )}
          </div>
        )}
      </div>
    );
  };

  const qualityButtons: { label: string; quality: ReviewQuality, color: string }[] = [
    { label: "Again", quality: 0, color: "bg-red-500 hover:bg-red-600" },
    { label: "Hard", quality: 1, color: "bg-orange-500 hover:bg-orange-600" }, 
    { label: "Good", quality: 4, color: "bg-blue-500 hover:bg-blue-600" },      
    { label: "Easy", quality: 5, color: "bg-green-500 hover:bg-green-600" },    
  ];

  return (
    <MathJaxProvider>
      <div className="h-full flex flex-col">
        {!srs.state.currentSession ? (
          <div className="p-6 text-center flex flex-col justify-center h-full">
            <h2 className="text-xl font-semibold mb-4">Select Session Type</h2>
            <Tabs defaultValue="mixed" onValueChange={(value) => setSessionType(value as SessionType)}>
              <TabsList className="mb-4">
                <TabsTrigger value="definition">Definitions</TabsTrigger>
                <TabsTrigger value="exercise">Exercises</TabsTrigger>
                <TabsTrigger value="mixed">Mixed</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="space-y-2">
              <Button 
                onClick={handleStartSession} 
                size="lg" 
                disabled={srs.state.loading} 
                className="w-full"
              >
                {srs.state.loading ? <Loader2 className="animate-spin mr-2" /> : null}
                Start Session
              </Button>
              <Button 
                onClick={handleEndSession} 
                size="sm" 
                variant="outline"
                className="w-full"
              >
                End Session
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {currentReviewItem ? (
                <>
                  <div className="flex justify-between items-center text-sm text-gray-500 mb-2">
                    <span>Item {sessionStats.completed + 1} of {sessionStats.total}</span>
                    <span>Correct: {sessionStats.correct} / {sessionStats.completed}</span>
                  </div>
                  {renderItemContent()}
                </>
              ) : (
                <div className="text-center py-10">
                  {srs.state.loading ? (
                    <Loader2 className="animate-spin h-10 w-10 mx-auto text-orange-500" />
                  ) : (
                    reviewQueue.length === 0 && sessionStats.total > 0 ? (
                      <div>
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <p className="text-xl font-semibold">Session Complete!</p>
                        <p>You reviewed {sessionStats.completed} items.</p>
                        <p>
                          Correct: {sessionStats.correct} 
                          ({sessionStats.completed > 0 ? Math.round((sessionStats.correct/sessionStats.completed)*100) : 0}%)
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
                    )
                  )}
                </div>
              )}
            </div>
            
            <div className="border-t p-4 space-y-3">
              {!showAnswer && currentReviewItem && (
                <Button 
                  onClick={handleShowAnswer} 
                  className="w-full" 
                  variant="outline" 
                  size="lg"
                >
                  <Eye className="mr-2 h-5 w-5" /> Show Answer
                </Button>
              )}
              
              {showAnswer && currentReviewItem && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 w-full">
                  {qualityButtons.map(btn => (
                    <Button
                      key={btn.quality}
                      onClick={() => handleSubmitReview(btn.quality)}
                      className={`text-white py-3 text-base ${btn.color}`}
                      disabled={srs.state.loading}
                    >
                      {srs.state.loading ? <Loader2 className="animate-spin mr-2" /> : null}
                      {btn.label}
                    </Button>
                  ))}
                </div>
              )}
              
              {currentReviewItem && (
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
    </MathJaxProvider>
  );
};
