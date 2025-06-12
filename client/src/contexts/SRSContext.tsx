// Global state management for SRS features

'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import {
  NodeProgress,
  NodePrerequisite,
  StudySession,
  DomainStats,
  DueReview,
  OptimalReviewItem, // This import seems unused, but kept from original
  CreditFlowAnimation,
  ReviewRequest,
  NodeStatus,
  SessionType,
} from '../types/srs';
import * as srsApi from '../lib/srs-api';
// Corrected import path for ToastNotification
import { showToast } from '../app/components/core/ToastNotification';

// =============================================================================
// STATE INTERFACE
// =============================================================================

interface SRSState {
  // Domain data
  currentDomainId: number | null;
  domainProgress: Map<string, NodeProgress>; // key: `${nodeType}_${nodeId}`
  domainStats: DomainStats | null;
  prerequisites: NodePrerequisite[];

  // Review state
  dueReviews: DueReview[];

  // Session state
  currentSession: StudySession | null;
  isStudying: boolean;
  currentReview: DueReview | null; // Stores the current item being reviewed in a session

  // UI state
  loading: boolean;
  error: string | null;
  creditFlowAnimations: CreditFlowAnimation[];
  showStudyMode: boolean; // This might be better managed locally by components initiating study mode

  // Cache
  lastUpdated: number;
}

// =============================================================================
// ACTIONS
// =============================================================================

type SRSAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_DOMAIN'; payload: number | null } // Allow null to explicitly unset domain
  | { type: 'SET_DOMAIN_PROGRESS'; payload: NodeProgress[] }
  | { type: 'SET_DOMAIN_STATS'; payload: DomainStats }
  | { type: 'SET_PREREQUISITES'; payload: NodePrerequisite[] }
  | { type: 'SET_DUE_REVIEWS'; payload: DueReview[] }
  | { type: 'UPDATE_NODE_PROGRESS'; payload: { nodeId: number; nodeType: 'definition' | 'exercise'; progress: Partial<NodeProgress> } }
  | { type: 'START_SESSION_SUCCESS'; payload: StudySession }
  | { type: 'END_SESSION_SUCCESS' }
  | { type: 'SET_CURRENT_REVIEW_ITEM'; payload: DueReview | null }
  | { type: 'ADD_CREDIT_ANIMATION'; payload: CreditFlowAnimation }
  | { type: 'CLEAR_CREDIT_ANIMATIONS' }
  | { type: 'SET_SHOW_STUDY_MODE'; payload: boolean }
  | { type: 'RESET_DOMAIN_STATE' }; // More specific reset

// =============================================================================
// REDUCER
// =============================================================================

const initialState: SRSState = {
  currentDomainId: null,
  domainProgress: new Map(),
  domainStats: null,
  prerequisites: [],
  dueReviews: [],
  currentSession: null,
  isStudying: false,
  currentReview: null,
  loading: false,
  error: null,
  creditFlowAnimations: [],
  showStudyMode: false,
  lastUpdated: 0,
};

const srsReducer = (state: SRSState, action: SRSAction): SRSState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    case 'SET_DOMAIN':
      // When domain changes (or is unset), reset all domain-specific data
      return {
        ...initialState, // Reset to initial state
        currentDomainId: action.payload, // Set the new domain ID (could be null)
        lastUpdated: Date.now(),
        creditFlowAnimations: [], // Explicitly clear animations
      };

    case 'SET_DOMAIN_PROGRESS':
      const progressMap = new Map<string, NodeProgress>();

      // Add defensive programming to handle non-array responses
      if (Array.isArray(action.payload)) {
        action.payload.forEach(progress => {
          // Ensure nodeId and nodeType are present for key creation
          if (progress?.nodeId != null && progress?.nodeType) { // Add null/undefined check for progress item itself
            const key = `${progress.nodeType}_${progress.nodeId}`;
            progressMap.set(key, progress);
          } else {
            console.warn("Received progress item without nodeId or nodeType:", progress);
          }
        });
      } else {
        console.warn("Expected array for domain progress, received:", typeof action.payload, action.payload);
      }

      // console.log("Setting domain progress, map size:", progressMap.size);
      // console.log("Progress map keys:", Array.from(progressMap.keys()));

      return {
        ...state,
        domainProgress: progressMap,
        lastUpdated: Date.now(),
      };

    case 'SET_DOMAIN_STATS':
      return { ...state, domainStats: action.payload, lastUpdated: Date.now() };

    case 'SET_PREREQUISITES':
      return { ...state, prerequisites: action.payload, lastUpdated: Date.now() };

    case 'SET_DUE_REVIEWS':
      // Ensure payload is an array before setting
      const dueReviewsPayload = Array.isArray(action.payload) ? action.payload : [];
      if (!Array.isArray(action.payload)) {
          console.warn("Expected array for due reviews, received:", typeof action.payload, action.payload);
      }
      return { ...state, dueReviews: dueReviewsPayload, lastUpdated: Date.now() };

    case 'UPDATE_NODE_PROGRESS': {
      const { nodeId, nodeType, progress } = action.payload;
      const key = `${nodeType}_${nodeId}`;
      const newProgressMap = new Map(state.domainProgress);
      const existingProgress = newProgressMap.get(key);

      // console.log(`Updating progress for key: ${key}`, progress);

      if (existingProgress) {
        const updatedProgress = { ...existingProgress, ...progress, updatedAt: new Date().toISOString() };
        newProgressMap.set(key, updatedProgress);
        // console.log(`Updated existing progress for ${key}:`, updatedProgress);
      } else {
         // Create a new progress object, ensuring required fields are present
         const newProgress: NodeProgress = {
            id: progress.id ?? 0, // Use ID from payload if present, otherwise 0 (backend will assign)
            userId: progress.userId ?? 0, // Use userId from payload if present
            nodeId: nodeId,
            nodeType: nodeType as 'definition' | 'exercise', // Ensure correct type
            status: progress.status ?? 'fresh',
            easinessFactor: progress.easinessFactor ?? 2.5,
            intervalDays: progress.intervalDays ?? 0,
            repetitions: progress.repetitions ?? 0,
            accumulatedCredit: progress.accumulatedCredit ?? 0,
            creditPostponed: progress.creditPostponed ?? false,
            totalReviews: progress.totalReviews ?? 0,
            successfulReviews: progress.successfulReviews ?? 0,
            createdAt: progress.createdAt ?? new Date().toISOString(),
            updatedAt: progress.updatedAt ?? new Date().toISOString(),
            // Include any other potential fields from the partial progress
            ...progress,
         };
        newProgressMap.set(key, newProgress);
        // console.log(`Created new progress for ${key}:`, newProgress);
      }

      return {
        ...state,
        domainProgress: newProgressMap,
        lastUpdated: Date.now(),
      };
    }

    case 'START_SESSION_SUCCESS':
      return {
        ...state,
        currentSession: action.payload,
        isStudying: true,
        currentReview: null, // Reset current review item when new session starts
        error: null, // Clear previous errors
      };

    case 'END_SESSION_SUCCESS':
      return {
        ...state,
        currentSession: null,
        isStudying: false,
        currentReview: null,
        showStudyMode: false, // Automatically turn off study mode display
      };

    case 'SET_CURRENT_REVIEW_ITEM':
      return { ...state, currentReview: action.payload };

    case 'ADD_CREDIT_ANIMATION':
      // Check if an animation for the same node with a very close timestamp already exists
      const existingAnimation = state.creditFlowAnimations.find(
        anim => anim.nodeId === action.payload.nodeId &&
                Math.abs(anim.timestamp - action.payload.timestamp) < 50 // Tolerance for near-simultaneous additions
      );

      if (existingAnimation) {
        // console.log('Skipping potential duplicate animation for node:', action.payload.nodeId);
        return state; // Don't add duplicate
      }

      // Limit the number of animations to prevent performance issues
      const maxAnimations = 20; // Arbitrary limit
      const newAnimations = [...state.creditFlowAnimations, action.payload];

      return {
        ...state,
        creditFlowAnimations: newAnimations.slice(-maxAnimations), // Keep only the most recent ones
      };

    case 'CLEAR_CREDIT_ANIMATIONS':
      return {
        ...state,
        creditFlowAnimations: []
      };

    case 'SET_SHOW_STUDY_MODE':
      return { ...state, showStudyMode: action.payload };

    case 'RESET_DOMAIN_STATE': // For when domain changes or explicit reset
      return {
        ...initialState,
        currentDomainId: state.currentDomainId, // Keep current domain ID if it's just a refresh within same domain
        creditFlowAnimations: [], // Explicitly clear animations
      };

    default:
      return state;
  }
};

// =============================================================================
// CONTEXT
// =============================================================================

interface SRSContextType {
  state: SRSState;

  setCurrentDomain: (domainId: number | null) => void; // Allow setting domain to null
  loadDomainData: (domainId: number) => Promise<void>;
  refreshDomainData: () => Promise<void>;

  updateNodeStatus: (nodeId: number, nodeType: 'definition' | 'exercise', status: NodeStatus) => Promise<void>;
  getNodeProgress: (nodeId: number, nodeType: 'definition' | 'exercise') => NodeProgress | null;

  submitReview: (review: ReviewRequest) => Promise<void>;
  loadDueReviews: (sessionType?: SessionType) => Promise<DueReview[]>; // Return due reviews
  getNextReviewItem: (sessionType: SessionType) => DueReview | null;
  setCurrentReviewItemInContext: (item: DueReview | null) => void;

  startStudySession: (sessionType: SessionType) => Promise<StudySession | null>;
  endStudySession: () => Promise<void>;

  setShowStudyModeInContext: (show: boolean) => void;
  clearError: () => void;
}

const SRSContext = createContext<SRSContextType | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export const SRSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(srsReducer, initialState);
  
  // Use refs to prevent infinite loops
  const isLoadingDataRef = useRef<boolean>(false);
  const lastLoadedDomainRef = useRef<number | null>(null);

  const setCurrentDomain = useCallback((domainId: number | null) => {
    if (state.currentDomainId !== domainId) {
      console.log("Setting current domain to:", domainId);
      // Clear any existing animations when changing domains BEFORE setting the new domain state
      dispatch({ type: 'CLEAR_CREDIT_ANIMATIONS' });
      dispatch({ type: 'SET_DOMAIN', payload: domainId });
    }
  }, [state.currentDomainId]);

  // Use refs to access current state values inside stable callbacks
  const currentDomainIdRef = useRef<number | null>(null);
  const currentSessionRef = useRef<StudySession | null>(null);

  // Update refs whenever state changes
  useEffect(() => {
    currentDomainIdRef.current = state.currentDomainId;
  }, [state.currentDomainId]);

  useEffect(() => {
    currentSessionRef.current = state.currentSession;
  }, [state.currentSession]);

  const loadDomainData = useCallback(async (domainId: number) => {
    if (!domainId) {
        console.warn("loadDomainData called without a valid domainId.");
        dispatch({ type: 'RESET_DOMAIN_STATE' }); // Reset state if no domainId
        return;
    }
  
    // Prevent concurrent loading of the same domain
    if (isLoadingDataRef.current && lastLoadedDomainRef.current === domainId) {
        console.log("Already loading data for domain:", domainId);
        return;
    }
  
    isLoadingDataRef.current = true;
    lastLoadedDomainRef.current = domainId;
  
    console.log("Loading domain data for domain:", domainId);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
  
    // Add timeout protection
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('SRS data loading timeout')), 15000);
    });
  
    try {
      // Load SRS data with timeout protection
      const dataPromise = Promise.allSettled([
        srsApi.getDomainProgress(domainId),
        srsApi.getDomainStats(domainId),
        srsApi.getDomainPrerequisites(domainId),
        srsApi.getDueReviews(domainId, 'mixed')
      ]);
  
      const [progress, stats, prerequisites, dueReviewsResult] = await Promise.race([
        dataPromise,
        timeoutPromise
      ]) as PromiseSettledResult<any>[];
  
      // Process results, handling rejections gracefully
      if (progress.status === 'fulfilled') {
        dispatch({ type: 'SET_DOMAIN_PROGRESS', payload: progress.value });
        console.log("Loaded progress data:", progress.value.length, "items");
      } else {
        console.warn('Could not load domain progress:', progress.reason);
        dispatch({ type: 'SET_DOMAIN_PROGRESS', payload: [] }); // Set empty array on error
      }
  
      if (stats.status === 'fulfilled') {
        dispatch({ type: 'SET_DOMAIN_STATS', payload: stats.value });
        console.log("Loaded stats data:", stats.value);
      } else {
        console.warn('Could not load domain stats:', stats.reason);
        // Create default stats for this domain
        dispatch({
            type: 'SET_DOMAIN_STATS',
            payload: {
                domainId: domainId,
                totalNodes: 0, freshNodes: 0, tacklingNodes: 0, graspedNodes: 0, learnedNodes: 0,
                dueReviews: 0, completedToday: 0, successRate: 0
            }
        });
      }
  
      if (prerequisites.status === 'fulfilled') {
        dispatch({ type: 'SET_PREREQUISITES', payload: prerequisites.value });
        console.log("Loaded prerequisites data:", prerequisites.value.length, "items");
      } else {
        console.warn('Could not load domain prerequisites:', prerequisites.reason);
        dispatch({ type: 'SET_PREREQUISITES', payload: [] }); // Set empty array on error
      }
  
      if (dueReviewsResult.status === 'fulfilled') {
         // Ensure dueNodes is an array or default to empty
         const dueNodes = Array.isArray(dueReviewsResult.value.dueNodes) ? dueReviewsResult.value.dueNodes : [];
         dispatch({ type: 'SET_DUE_REVIEWS', payload: dueNodes });
         console.log("Loaded due reviews data:", dueNodes.length, "items");
      } else {
         console.warn('Could not load due reviews:', dueReviewsResult.reason);
         dispatch({ type: 'SET_DUE_REVIEWS', payload: [] }); // Set empty array on error
      }
  
      showToast('Domain data loaded.', 'success');
    } catch (error) {
      // This catch handles both timeout and other critical errors
      console.error('Critical error loading domain data:', error);
      const message = error instanceof Error ? error.message : 'Failed to load domain data';
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
      
      // Set default empty state to prevent infinite loading
      dispatch({ type: 'SET_DOMAIN_PROGRESS', payload: [] });
      dispatch({ type: 'SET_DUE_REVIEWS', payload: [] });
      dispatch({ type: 'SET_PREREQUISITES', payload: [] });
      dispatch({
        type: 'SET_DOMAIN_STATS',
        payload: {
          domainId: domainId,
          totalNodes: 0, freshNodes: 0, tacklingNodes: 0, graspedNodes: 0, learnedNodes: 0,
          dueReviews: 0, completedToday: 0, successRate: 0
        }
      });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
      isLoadingDataRef.current = false;
    }
  }, []); // STABLE - no dependencies

  // Effect to load domain data whenever currentDomainId changes and is not null
  useEffect(() => {
      if (state.currentDomainId !== null && !isLoadingDataRef.current) {
          // Prevent loading the same domain multiple times
          if (lastLoadedDomainRef.current === state.currentDomainId) {
              console.log("Domain already loaded, skipping:", state.currentDomainId);
              return;
          }
          
          // Use a separate function to handle the async logic inside useEffect
          const fetchDomainData = async () => {
             try {
               await loadDomainData(state.currentDomainId as number);
             } catch (error) {
               console.error("Error in auto-loading domain data:", error);
               // Ensure loading state is cleared even on error
               dispatch({ type: 'SET_LOADING', payload: false });
               isLoadingDataRef.current = false;
             }
          };
          fetchDomainData();
      }
  }, [state.currentDomainId, loadDomainData]); // Only depend on currentDomainId

  const refreshDomainData = useCallback(async () => {
    const domainId = currentDomainIdRef.current;
    if (domainId !== null) {
      console.log("Refreshing domain data for domain:", domainId);
      showToast('Refreshing domain data...', 'info', 1000); // Show briefly
      await loadDomainData(domainId);
    } else {
        console.warn("Refresh requested but no domain is set.");
    }
  }, [loadDomainData]); // STABLE - no dependencies

  const updateNodeStatus = useCallback(async (
    nodeId: number,
    nodeType: 'definition' | 'exercise',
    status: NodeStatus
  ) => {
    const domainId = currentDomainIdRef.current;
    if (domainId === null) {
        showToast("Cannot update node status: No domain selected.", "warning");
        return;
    }
    console.log(`Updating node status: ${nodeType}_${nodeId} to ${status}`);

    showToast(`Updating status to ${status}...`, 'info', 1000);

    try {
      await srsApi.updateNodeStatus(nodeId, nodeType, status);
      showToast(`Node status updated to ${status}`, 'success');

      // Force complete refresh of ALL domain data since propagation affects multiple nodes
      console.log("Refreshing all domain data after status update...");
      await loadDomainData(domainId); // Pass the current domain ID explicitly
      showToast('Status propagation completed', 'success', 2000);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update node status';
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
    }
  }, [loadDomainData]); // STABLE - no dependencies

  const getNodeProgress = useCallback((
    nodeId: number,
    nodeType: 'definition' | 'exercise'
  ): NodeProgress | null => {
    const key = `${nodeType}_${nodeId}`;
    const progress = state.domainProgress.get(key) || null;
    // console.log(`Getting progress for ${key}:`, progress); // Verbose, disable for less console noise
    return progress;
  }, [state.domainProgress]); // Depends only on the progress map state

  const submitReview = useCallback(async (review: ReviewRequest) => {
    const domainId = currentDomainIdRef.current;
    const currentSession = currentSessionRef.current;
    
    if (domainId === null) {
        showToast("Cannot submit review: No domain selected.", "warning");
        return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const response = await srsApi.submitReview(review);

      // Update individual node progress based on response
      if (response.updatedNodes) {
        response.updatedNodes.forEach(nodeProgress => {
           // Ensure nodeProgress has required fields before dispatching
            if (nodeProgress?.nodeId != null && nodeProgress?.nodeType) {
              dispatch({
                type: 'UPDATE_NODE_PROGRESS',
                payload: {
                  nodeId: nodeProgress.nodeId,
                  nodeType: nodeProgress.nodeType,
                  progress: nodeProgress
                }
              });
            } else {
              console.warn("Received invalid node progress in submitReview response:", nodeProgress);
            }
        });
      }

      // Process credit flow animations
      if (response.creditFlow && Array.isArray(response.creditFlow) && response.creditFlow.length > 0) {
        console.log('Processing credit flow:', response.creditFlow);

        // Create animations with unique timestamps to prevent duplicates
        // Add a small random offset to ensure uniqueness for React keying/reducer checks
        const newAnimations = response.creditFlow.map(credit => ({
          nodeId: credit.nodeId.toString(), // Ensure nodeId is string for animation key/identity
          credit: credit.credit,
          type: credit.credit > 0 ? 'positive' as const : 'negative' as const,
          timestamp: Date.now() + Math.random() * 50 // Add small random offset
        }));

        // Add animations one by one or with small delays if needed for sequencing,
        // or add them all at once and let the reducer handle duplicates/limits.
        // Adding all at once is simpler and reducer already handles duplicates.
        newAnimations.forEach(animation => {
             dispatch({
               type: 'ADD_CREDIT_ANIMATION',
               payload: animation
             });
        });


        // Clear animations after they've had time to display
        // Use a timeout ID to potentially clear previous timeouts if new animations arrive quickly
        // This requires managing timeout IDs in state or a ref, which adds complexity.
        // A simpler approach is to just set a fixed timeout after each batch.
        // If rapid-fire animations cause issues, reconsider this. For now, fixed timeout:
        setTimeout(() => dispatch({ type: 'CLEAR_CREDIT_ANIMATIONS' }), 3000); // Adjust delay as needed

      }

      showToast('Review submitted successfully', 'success');

      // Refresh data that might have changed due to review
      // Fetch updated stats and due reviews specifically
      // Doing this separately is faster than a full domain data reload
      try {
        const [stats, dueReviewsResult] = await Promise.allSettled([
            srsApi.getDomainStats(domainId),
            // Fetch reviews based on the session type if in a session, otherwise mixed
            srsApi.getDueReviews(domainId, review.sessionId ? currentSession?.sessionType : 'mixed')
        ]);

        if (stats.status === 'fulfilled') {
             dispatch({ type: 'SET_DOMAIN_STATS', payload: stats.value });
        } else {
             console.warn('Could not refresh stats after review submission:', stats.reason);
        }

        if (dueReviewsResult.status === 'fulfilled') {
            const dueNodes = Array.isArray(dueReviewsResult.value.dueNodes) ? dueReviewsResult.value.dueNodes : [];
            dispatch({ type: 'SET_DUE_REVIEWS', payload: dueNodes });
        } else {
            console.warn('Could not refresh due reviews after review submission:', dueReviewsResult.reason);
        }

      } catch (refreshError) {
        console.error('Error during post-review data refresh:', refreshError);
        // Note: The individual Promise.allSettled catches handle errors per promise,
        // this catch would only be for errors within the Promise.allSettled setup itself.
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit review';
      console.error('Submit review failed:', error);
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []); // STABLE - no dependencies

  const loadDueReviews = useCallback(async (sessionType: SessionType = 'mixed'): Promise<DueReview[]> => {
    const domainId = currentDomainIdRef.current;
    if (domainId === null) {
        showToast("No domain selected to load due reviews.", "warning");
        return [];
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const dueReviewsResult = await srsApi.getDueReviews(domainId, sessionType);
      // Ensure the payload is an array before dispatching
      const dueNodes = Array.isArray(dueReviewsResult?.dueNodes) ? dueReviewsResult.dueNodes : [];
      if (!Array.isArray(dueReviewsResult?.dueNodes)) {
          console.warn("Received non-array for due reviews:", dueReviewsResult);
      }
      dispatch({ type: 'SET_DUE_REVIEWS', payload: dueNodes });
      return dueNodes;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load due reviews';
      console.error('Load due reviews failed:', error);
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
      return []; // Return empty array on error
    } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []); // STABLE - no dependencies

  // Use the already optimally ordered dueReviews from state
  const getNextReviewItem = useCallback((sessionType: SessionType): DueReview | null => {
    // Find the first due review that matches the session type
    // If sessionType is 'mixed', any type is okay.
    // Ensure it's not the item currently being displayed if applicable (though session flow handles this)
    const nextItem = state.dueReviews.find(review => {
        const matchesType = sessionType === 'mixed' || review.nodeType === sessionType;
        // Add a check to ensure the item is not the *currently set* currentReview,
        // although session logic usually handles this by removing the item after submission.
        // This provides an extra layer of safety.
        const isNotCurrent = !state.currentReview || review.id !== state.currentReview.id;
        // Also check if the item is somehow null/undefined in the array
        const isValidItem = !!review;
        return matchesType && isNotCurrent && isValidItem;
    });

    return nextItem || null;
  }, [state.dueReviews, state.currentReview]); // Depend on dueReviews and currentReview state

  const setCurrentReviewItemInContext = useCallback((item: DueReview | null) => {
    dispatch({ type: 'SET_CURRENT_REVIEW_ITEM', payload: item });
  }, []); // No dependencies

  const startStudySession = useCallback(async (sessionType: SessionType): Promise<StudySession | null> => {
    const domainId = currentDomainIdRef.current;
    if (domainId === null) {
      showToast('Please select a domain first.', 'error');
      return null;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const session = await srsApi.startStudySession(domainId, sessionType);
      dispatch({ type: 'START_SESSION_SUCCESS', payload: session });
      // Load the due reviews for the session type immediately after starting
      await loadDueReviews(sessionType);
      showToast(`Started ${sessionType} study session.`, 'success');
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start study session';
      console.error('Start session failed:', error);
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
      return null;
    } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadDueReviews]); // STABLE - no dependencies

  const endStudySession = useCallback(async () => {
    const currentSession = currentSessionRef.current;
    const domainId = currentDomainIdRef.current;
    
    if (!currentSession) {
        console.warn("endStudySession called but no session is active.");
        // If somehow state is inconsistent, ensure session state is reset anyway
        dispatch({ type: 'END_SESSION_SUCCESS' });
        if (domainId !== null) {
             // Still attempt to refresh stats if domain is set
             try {
                const stats = await srsApi.getDomainStats(domainId);
                dispatch({ type: 'SET_DOMAIN_STATS', payload: stats });
             } catch (refreshError) {
                console.warn('Could not refresh stats after ending session (no active session API call):', refreshError);
             }
        }
        return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await srsApi.endStudySession(currentSession.id);
      dispatch({ type: 'END_SESSION_SUCCESS' });
      showToast('Study session ended.', 'success');
      // Refresh domain stats after session ends
      if(domainId !== null) {
        try {
          const stats = await srsApi.getDomainStats(domainId);
          dispatch({ type: 'SET_DOMAIN_STATS', payload: stats });
          // Also refresh due reviews just in case
          await loadDueReviews(currentSession.sessionType); // Refresh based on session type
        } catch (refreshError) {
          console.warn('Could not refresh stats/reviews after ending session:', refreshError);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end study session';
      console.error('End session failed:', error);
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
      // Even if API call fails, attempt to reset local session state
      dispatch({ type: 'END_SESSION_SUCCESS' });
    } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [loadDueReviews]); // STABLE - no dependencies

  const setShowStudyModeInContext = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_STUDY_MODE', payload: show });
  }, []); // No dependencies

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
    // Also clear any lingering animations when clearing errors for a clean state
    dispatch({ type: 'CLEAR_CREDIT_ANIMATIONS' });
  }, []); // No dependencies

  const contextValue: SRSContextType = {
    state,
    setCurrentDomain,
    loadDomainData,
    refreshDomainData,
    updateNodeStatus,
    getNodeProgress,
    submitReview,
    loadDueReviews,
    getNextReviewItem,
    setCurrentReviewItemInContext,
    startStudySession,
    endStudySession,
    setShowStudyModeInContext,
    clearError,
  };

  return (
    <SRSContext.Provider value={contextValue}>
      {children}
    </SRSContext.Provider>
  );
};

// =============================================================================
// HOOK
// =============================================================================

export const useSRS = (): SRSContextType => {
  const context = useContext(SRSContext);
  if (context === undefined) {
    throw new Error('useSRS must be used within an SRSProvider');
  }
  return context;
};
