// StudyModeModal.tsx - Enhanced version with smart graph navigation
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/core/tabs";
import { MathJaxContent, MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { useSRS } from '@/contexts/SRSContext';
import { DueReview, ReviewQuality, ReviewRequest, SessionType, StudySession } from '@/types/srs';
import { ArrowLeft, ArrowRight, CheckCircle, Eye, Loader2, XCircle, Target, MapPin } from 'lucide-react';
import { showToast } from '@/app/components/core/ToastNotification';
import { getDefinition, getExercise } from '@/lib/api';

interface StudyModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  domainId: number;
  onNavigateToNode?: (nodeCode: string, context: 'study') => void;
}

const StudyModeModal: React.FC<StudyModeModalProps> = ({ 
  isOpen, 
  onClose, 
  domainId, 
  onNavigateToNode 
}) => {
  const srs = useSRS();
  const [sessionType, setSessionType] = useState<SessionType>('mixed');
  const [currentReviewItem, setCurrentReviewItem] = useState<DueReview | null>(null);
  const [reviewQueue, setReviewQueue] = useState<DueReview[]>([]);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [sessionStats, setSessionStats] = useState({ total: 0, completed: 0, correct: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);
  
  const [autoNavigateToNodes, setAutoNavigateToNodes] = useState(true);

  useEffect(() => {
    if (isOpen && domainId) {
      srs.setCurrentDomain(domainId);
      resetSession();
    } else if (!isOpen) {
      if (srs.state.currentSession) {
        srs.endStudySession();
      }
      resetSession();
    }
  }, [isOpen, domainId]);

  const resetSession = () => {
    setCurrentReviewItem(null);
    setReviewQueue([]);
    setShowAnswer(false);
    setItemDetails(null);
    setSessionStats({ total: 0, completed: 0, correct: 0 });
    setStartTime(null);
    if (srs.state.currentSession) srs.endStudySession();
  };

  const handleStartSession = async () => {
    if (!domainId) {
      setTimeout(() => showToast("Domain ID is missing.", "error"), 0);
      return;
    }
    await srs.startStudySession(sessionType);
    setStartTime(Date.now());
  };

  useEffect(() => {
    if (srs.state.currentSession && srs.state.dueReviews.length > 0 && !currentReviewItem) {
      const filteredReviews = srs.state.dueReviews.filter(review => {
        if (sessionType === 'mixed') return true;
        return review.nodeType === sessionType;
      });
      setReviewQueue(filteredReviews);
      setSessionStats(prev => ({ ...prev, total: filteredReviews.length, completed: 0, correct: 0 }));
      if (filteredReviews.length > 0) {
        loadReviewItem(filteredReviews[0]);
      } else {
        setTimeout(() => {
          showToast("No items due for this session type.", "info");
          srs.endStudySession();
        }, 0);
      }
    }
  }, [srs.state.currentSession, srs.state.dueReviews, sessionType, currentReviewItem]);

  // FIX 1: React setState During Render Error
  const loadReviewItem = useCallback(async (review: DueReview | undefined) => {
    if (!review) {
      setCurrentReviewItem(null);
      setItemDetails(null);
      if (srs.state.currentSession) {
        setTimeout(() => {
          showToast("Study session complete!", "success");
          srs.endStudySession();
        }, 0);
      }
      return;
    }

    setIsLoadingItem(true);
    setShowAnswer(false);
    setCurrentReviewItem(review);

    try {
      let details;
      if (review.nodeType === 'definition') {
        details = await getDefinition(review.nodeId);
      } else {
        details = await getExercise(review.nodeId);
      }
      setItemDetails(details);
      
      // FIX: Move navigation logic to after state updates to avoid setState during render
      if (autoNavigateToNodes && onNavigateToNode && review.nodeCode) {
        setTimeout(() => {
          onNavigateToNode(review.nodeCode, 'study');
        }, 0);
      }
    } catch (error) {
      console.error("Error fetching item details:", error);
      setTimeout(() => showToast("Failed to load review item.", "error"), 0);
    } finally {
      setIsLoadingItem(false);
    }
  }, [autoNavigateToNodes, onNavigateToNode]);

  const handleNextItem = () => {
    setReviewQueue(prev => {
      const newQueue = prev.slice(1);
      loadReviewItem(newQueue[0]);
      return newQueue;
    });
  };

  const handleSubmitReview = async (quality: ReviewQuality) => {
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

    await srs.submitReview(reviewData);

    setSessionStats(prev => ({
      ...prev,
      completed: prev.completed + 1,
      correct: prev.correct + (quality >= 3 ? 1 : 0),
    }));
    
    setStartTime(Date.now());
    handleNextItem();
  };

  const handleNavigateToCurrentItem = () => {
    if (currentReviewItem && onNavigateToNode) {
      onNavigateToNode(currentReviewItem.nodeCode, 'study');
      showToast("Navigated to node in graph", "info", 1500);
    }
  };

  if (!isOpen) return null;

  const renderItemContent = () => {
    if (isLoadingItem) return <Loader2 className="animate-spin h-8 w-8 mx-auto text-orange-500" />;
    if (!currentReviewItem || !itemDetails) return <p>No item to display.</p>;

    return (
      <div className="space-y-4">
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

        {currentReviewItem.nodeType === 'definition' ? (
          <div>
            <h3 className="text-lg font-semibold mb-2">Define: {itemDetails.name}</h3>
            {showAnswer && (
              <MathJaxContent className="p-3 bg-gray-50 rounded-md border text-sm">
                {itemDetails.description?.split('|||')[0] || "N/A"}
              </MathJaxContent>
            )}
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold mb-2">Exercise: {itemDetails.name}</h3>
            <MathJaxContent className="p-3 bg-gray-50 rounded-md border text-sm mb-2">
              {itemDetails.statement || "N/A"}
            </MathJaxContent>
            {showAnswer && (
              <MathJaxContent className="p-3 bg-green-50 rounded-md border border-green-200 text-sm">
                <strong>Solution:</strong> {itemDetails.description || "N/A"}
              </MathJaxContent>
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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="border-b">
          <CardTitle className="flex justify-between items-center">
            <span>Study Session: {sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}</span>
            <Button variant="ghost" size="icon" onClick={onClose}><XCircle /></Button>
          </CardTitle>
        </CardHeader>

        {!srs.state.currentSession ? (
          <CardContent className="p-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Select Session Type</h2>
            <Tabs defaultValue="mixed" onValueChange={(value) => setSessionType(value as SessionType)}>
              <TabsList className="mb-4">
                <TabsTrigger value="definition">Definitions</TabsTrigger>
                <TabsTrigger value="exercise">Exercises</TabsTrigger>
                <TabsTrigger value="mixed">Mixed</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={handleStartSession} size="lg" disabled={srs.state.loading} className="w-full">
              {srs.state.loading ? <Loader2 className="animate-spin mr-2" /> : null}
              Start Session
            </Button>
          </CardContent>
        ) : (
          <>
            <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
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
                        <p>Correct: {sessionStats.correct} ({sessionStats.completed > 0 ? Math.round((sessionStats.correct/sessionStats.completed)*100) : 0}%)</p>
                      </div>
                    ) : (
                       <p>Loading next item or no items due...</p>
                    )
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t p-4 space-y-3">
              {!showAnswer && currentReviewItem && (
                <Button onClick={() => setShowAnswer(true)} className="w-full" variant="outline" size="lg">
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
                      {srs.state.loading && currentReviewItem ? <Loader2 className="animate-spin mr-2" /> : null}
                      {btn.label}
                    </Button>
                  ))}
                </div>
              )}
               {!currentReviewItem && sessionStats.total > 0 && (
                 <Button onClick={onClose} className="w-full" size="lg">
                   Close
                 </Button>
               )}
            </CardFooter>
          </>
        )}
      </Card>
    </div>
    </MathJaxProvider>
  );
};

export default StudyModeModal;
