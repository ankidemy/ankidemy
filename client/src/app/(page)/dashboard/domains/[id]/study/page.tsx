// src/app/(page)/dashboard/domains/[id]/study/page.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { MathJaxContext, MathJax } from 'better-react-mathjax';
import { 
  getDomain, 
  getDomainDefinitions, 
  getDomainExercises,
  getDefinitionProgress,
  getExerciseProgress,
  getDefinitionsForReview,
  startSession,
  endSession,
  reviewDefinition,
  attemptExercise,
  Domain,
  Definition,
  Exercise
} from '@/lib/api';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { 
  ArrowLeft, 
  BookOpen, 
  Brain, 
  CheckCircle, 
  Clock, 
  Play,
  Pause,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  RefreshCw,
  Award
} from 'lucide-react';

// MathJax configuration
const mathJaxConfig = {
  loader: { load: ["input/tex", "output/svg"] },
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
  }
};

export default function StudyPage() {
  const router = useRouter();
  const params = useParams();
  const domainId = params?.id as string;
  
  // States
  const [domain, setDomain] = useState<Domain | null>(null);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [reviewDefinitions, setReviewDefinitions] = useState<Definition[]>([]);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'review' | 'practice'>('overview');
  const [currentSession, setCurrentSession] = useState<{ id: number, startTime: string } | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Study session states
  const [studyMode, setStudyMode] = useState<'definition' | 'exercise'>('definition');
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<{correct: boolean, message: string} | null>(null);
  
  // Load domain data
  useEffect(() => {
    const fetchDomainData = async () => {
      setIsLoading(true);
      try {
        // Fetch domain info
        const domainData = await getDomain(parseInt(domainId));
        setDomain(domainData);
        
        // Fetch definitions
        const definitionsData = await getDomainDefinitions(parseInt(domainId));
        setDefinitions(definitionsData);
        
        // Fetch exercises
        const exercisesData = await getDomainExercises(parseInt(domainId));
        setExercises(exercisesData);
        
        // Fetch definitions due for review
        const reviewData = await getDefinitionsForReview(parseInt(domainId));
        setReviewDefinitions(reviewData);
      } catch (err: any) {
        console.error("Error loading domain data:", err);
        setError("Failed to load domain data. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDomainData();
  }, [domainId]);
  
  // Start a study session
  const handleStartSession = async () => {
    if (!domain) return;
    
    try {
      const session = await startSession(domain.id);
      setCurrentSession(session);
      
      // Fetch updated list of definitions to review
      const reviewData = await getDefinitionsForReview(domain.id);
      setReviewDefinitions(reviewData);
      
      // Switch to review tab if there are definitions to review
      if (reviewData.length > 0) {
        setActiveTab('review');
      } else {
        setActiveTab('practice'); // Or keep on overview
      }
    } catch (err) {
      console.error("Error starting session:", err);
      setError("Failed to start study session. Please try again.");
    }
  };
  
  // End a study session
  const handleEndSession = async () => {
    if (!currentSession) return;
    
    try {
      await endSession(currentSession.id);
      setCurrentSession(null);
      
      // Reset states
      setShowAnswer(false);
      setUserAnswer('');
      setAnswerFeedback(null);
      setCurrentIndex(0);
      
      // Refresh definitions due for review
      const reviewData = await getDefinitionsForReview(parseInt(domainId));
      setReviewDefinitions(reviewData);
      
      // Go back to overview
      setActiveTab('overview');
    } catch (err) {
      console.error("Error ending session:", err);
      setError("Failed to end study session. Please try again.");
    }
  };
  
  // Handle definition review
  const handleReviewDefinition = async (definitionId: number, result: 'again' | 'hard' | 'good' | 'easy') => {
    try {
      await reviewDefinition(definitionId, {
        definitionId,
        result,
        timeTaken: 0 // Not tracking time for now
      });
      
      // Move to next definition or end review if done
      if (currentIndex < reviewDefinitions.length - 1) {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false); // Reset for next definition
      } else {
        // End of review
        setCurrentIndex(0);
        
        // Refresh definitions due for review
        const reviewData = await getDefinitionsForReview(parseInt(domainId));
        setReviewDefinitions(reviewData);
        
        // If no more to review, switch to practice
        if (reviewData.length === 0) {
          setActiveTab('practice');
        }
      }
    } catch (err) {
      console.error("Error submitting review:", err);
      setError("Failed to record review. Please try again.");
    }
  };
  
  // Handle exercise attempt
  const handleAttemptExercise = async (exerciseId: number, answer: string) => {
    try {
      const response = await attemptExercise(exerciseId, {
        exerciseId,
        answer,
        timeTaken: 0 // Not tracking time for now
      });
      
      setAnswerFeedback({
        correct: response.correct,
        message: response.correct ? "Correct! Well done." : "Incorrect. Please try again."
      });
      
      // Show solution if incorrect
      if (!response.correct) {
        setShowAnswer(true);
      }
    } catch (err) {
      console.error("Error submitting exercise attempt:", err);
      setError("Failed to verify answer. Please try again.");
    }
  };
  
  // Handle next exercise
  const handleNextExercise = () => {
    if (currentIndex < exercises.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setUserAnswer('');
      setAnswerFeedback(null);
    } else {
      // End of exercises
      setCurrentIndex(0);
      setShowAnswer(false);
      setUserAnswer('');
      setAnswerFeedback(null);
    }
  };
  
  // Get current definition or exercise based on mode and index
  const getCurrentItem = () => {
    if (activeTab === 'review' && reviewDefinitions.length > 0) {
      return reviewDefinitions[currentIndex];
    } else if (activeTab === 'practice' && exercises.length > 0) {
      return exercises[currentIndex];
    }
    return null;
  };
  
  const currentItem = getCurrentItem();
  
  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }
  
  // Missing domain data
  if (!domain) {
    return (
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-orange-600 mb-4">Domain Not Found</h2>
          <p className="text-gray-700 mb-4">The requested domain could not be loaded.</p>
          <Button onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <MathJaxContext config={mathJaxConfig}>
      <div className="min-h-screen bg-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Header with navigation */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center">
              <Button 
                variant="ghost" 
                onClick={() => router.push('/dashboard')} 
                className="mr-4"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              
              <h1 className="text-2xl font-bold">{domain.name}</h1>
            </div>
            
            <div>
              {currentSession ? (
                <Button 
                  variant="outline"
                  onClick={handleEndSession}
                  className="flex items-center"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  End Session
                </Button>
              ) : (
                <Button 
                  onClick={handleStartSession}
                  className="flex items-center"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Start Session
                </Button>
              )}
            </div>
          </div>
          
          {/* Domain details */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <p className="text-gray-600">
                {domain.description || "No description available."}
              </p>
              
              <div className="mt-4 flex flex-wrap gap-4">
                <div className="flex items-center">
                  <BookOpen className="text-gray-500 h-5 w-5 mr-2" />
                  <span><strong>{definitions.length}</strong> definitions</span>
                </div>
                <div className="flex items-center">
                  <Brain className="text-gray-500 h-5 w-5 mr-2" />
                  <span><strong>{exercises.length}</strong> exercises</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="text-gray-500 h-5 w-5 mr-2" />
                  <span><strong>{reviewDefinitions.length}</strong> pending reviews</span>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Tabs for different study modes */}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
            <TabsList className="w-full mb-6">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger 
                value="review" 
                className="flex-1"
                disabled={reviewDefinitions.length === 0}
              >
                Review ({reviewDefinitions.length})
              </TabsTrigger>
              <TabsTrigger 
                value="practice" 
                className="flex-1"
                disabled={exercises.length === 0}
              >
                Practice ({exercises.length})
              </TabsTrigger>
            </TabsList>
            
            {/* Overview Tab */}
            <TabsContent value="overview">
              <Card>
                <CardHeader>
                  <CardTitle>Domain Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Study Progress</h3>
                      <div className="bg-gray-100 h-4 rounded-full overflow-hidden">
                        <div 
                          className="bg-green-500 h-full rounded-full" 
                          style={{ width: `${0}%` }} // Replace with actual progress percentage
                        ></div>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        0% complete (This will show your actual progress in the full implementation)
                      </p>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium mb-2">Definitions</h3>
                      {definitions.length > 0 ? (
                        <div className="space-y-2">
                          {definitions.slice(0, 5).map((def) => (
                            <div key={def.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="font-medium">{def.name}</div>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  // Set current index to this definition
                                  const index = reviewDefinitions.findIndex(d => d.id === def.id);
                                  if (index >= 0) {
                                    setCurrentIndex(index);
                                    setActiveTab('review');
                                  }
                                }}
                              >
                                View
                              </Button>
                            </div>
                          ))}
                          {definitions.length > 5 && (
                            <div className="text-center text-sm text-gray-500">
                              And {definitions.length - 5} more...
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500">No definitions found in this domain.</p>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium mb-2">Exercises</h3>
                      {exercises.length > 0 ? (
                        <div className="space-y-2">
                          {exercises.slice(0, 5).map((ex) => (
                            <div key={ex.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                              <div className="font-medium">{ex.name}</div>
                              <div className="text-xs text-gray-500">
                                Difficulty: {"★".repeat(parseInt(ex.difficulty || '1', 10))}
                              </div>
                            </div>
                          ))}
                          {exercises.length > 5 && (
                            <div className="text-center text-sm text-gray-500">
                              And {exercises.length - 5} more...
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-500">No exercises found in this domain.</p>
                      )}
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="secondary"
                    className="mr-2"
                    onClick={() => router.push(`/graph?domainId=${domain.id}`)}
                  >
                    View Knowledge Graph
                  </Button>
                  <Button onClick={handleStartSession}>
                    Start Study Session
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>
            
            {/* Review Tab */}
            <TabsContent value="review">
              {reviewDefinitions.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      <span>Definition Review</span>
                      <span className="text-sm font-normal text-gray-500">
                        {currentIndex + 1} of {reviewDefinitions.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentItem && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-xl font-medium mb-2">{currentItem.name}</h3>
                          {showAnswer ? (
                            <div className="bg-gray-50 p-4 rounded-md">
                              <MathJax>
                                {currentItem.description}
                              </MathJax>
                            </div>
                          ) : (
                            <div className="bg-white border border-gray-200 p-4 rounded-md flex items-center justify-center h-32">
                              <Button variant="outline" onClick={() => setShowAnswer(true)}>
                                Show Definition
                              </Button>
                            </div>
                          )}
                        </div>
                        
                        {showAnswer && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-500 mb-2">
                              RATE YOUR UNDERSTANDING
                            </h4>
                            <div className="flex space-x-2">
                              <Button 
                                size="sm"
                                variant="outline"
                                className="flex-1 bg-red-50 hover:bg-red-100 text-red-700"
                                onClick={() => handleReviewDefinition(currentItem.id, 'again')}
                              >
                                Again
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700"
                                onClick={() => handleReviewDefinition(currentItem.id, 'hard')}
                              >
                                Hard
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                className="flex-1 bg-green-50 hover:bg-green-100 text-green-700"
                                onClick={() => handleReviewDefinition(currentItem.id, 'good')}
                              >
                                Good
                              </Button>
                              <Button 
                                size="sm"
                                variant="outline"
                                className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700"
                                onClick={() => handleReviewDefinition(currentItem.id, 'easy')}
                              >
                                Easy
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button 
                      variant="outline"
                      disabled={currentIndex === 0}
                      onClick={() => {
                        setCurrentIndex(Math.max(0, currentIndex - 1));
                        setShowAnswer(false);
                      }}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      disabled={currentIndex >= reviewDefinitions.length - 1 || !showAnswer}
                      onClick={() => {
                        setCurrentIndex(Math.min(reviewDefinitions.length - 1, currentIndex + 1));
                        setShowAnswer(false);
                      }}
                    >
                      Next
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Award className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">All Caught Up!</h3>
                    <p className="text-gray-600 mb-4">
                      You don't have any definitions due for review. Great job!
                    </p>
                    <Button onClick={() => setActiveTab('practice')}>
                      Practice Exercises
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            
            {/* Practice Tab */}
            <TabsContent value="practice">
              {exercises.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                      <span>Exercise Practice</span>
                      <span className="text-sm font-normal text-gray-500">
                        {currentIndex + 1} of {exercises.length}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {currentItem && (
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-xl font-medium mb-2">{currentItem.name}</h3>
                          <div className="bg-gray-50 p-4 rounded-md">
                            <MathJax>
                              {currentItem.statement}
                            </MathJax>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-medium text-gray-500">YOUR ANSWER</h4>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setShowAnswer(!showAnswer)}
                              className="text-xs"
                            >
                              <HelpCircle className="h-3 w-3 mr-1" />
                              {showAnswer ? "Hide Solution" : "Show Solution"}
                            </Button>
                          </div>
                          
                          <textarea
                            className="w-full border rounded-md p-3 h-32 resize-none"
                            placeholder="Enter your solution here..."
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                            disabled={!!answerFeedback?.correct}
                          />
                          
                          {answerFeedback && (
                            <div className={`mt-2 p-2 rounded-md ${
                              answerFeedback.correct 
                                ? "bg-green-50 text-green-700" 
                                : "bg-red-50 text-red-700"
                            }`}>
                              {answerFeedback.message}
                            </div>
                          )}
                          
                          {showAnswer && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium text-gray-500 mb-2">SOLUTION</h4>
                              <div className="bg-white border border-gray-200 p-4 rounded-md">
                                <MathJax>
                                  {currentItem.description}
                                </MathJax>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    {answerFeedback?.correct ? (
                      <Button onClick={handleNextExercise}>
                        Next Exercise
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button 
                        disabled={!userAnswer.trim()}
                        onClick={() => handleAttemptExercise(currentItem!.id, userAnswer)}
                      >
                        Check Answer
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <Brain className="w-12 h-12 text-orange-500 mx-auto mb-4" />
                    <h3 className="text-xl font-medium mb-2">No Exercises Available</h3>
                    <p className="text-gray-600 mb-4">
                      This domain doesn't have any exercises yet.
                    </p>
                    <Button onClick={() => setActiveTab('overview')}>
                      Return to Overview
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MathJaxContext>
  );
}
