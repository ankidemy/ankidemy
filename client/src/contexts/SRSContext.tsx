// src/contexts/SRSContext.tsx
// Global state management for SRS features

'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
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

  const setCurrentDomain = useCallback((domainId: number | null) => {
    if (state.currentDomainId !== domainId) {
      console.log("Setting current domain to:", domainId);
      // Clear any existing animations when changing domains BEFORE setting the new domain state
      dispatch({ type: 'CLEAR_CREDIT_ANIMATIONS' });
      dispatch({ type: 'SET_DOMAIN', payload: domainId });
      // No need to load data here, the component displaying the domain content should trigger loadDomainData based on currentDomainId state
    }
  }, [state.currentDomainId]);

  // Effect to load domain data whenever currentDomainId changes and is not null
  useEffect(() => {
      if (state.currentDomainId !== null) {
          // Use a separate function to handle the async logic inside useEffect
          const fetchDomainData = async () => {
             // Delay load slightly to allow SET_DOMAIN state update to potentially propagate
             await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
             await loadDomainData(state.currentDomainId as number); // Cast is safe due to if check
          };
          fetchDomainData();
      }
  }, [state.currentDomainId]); // Depend only on the current domain ID

  const loadDomainData = useCallback(async (domainId: number) => {
    if (!domainId) {
        console.warn("loadDomainData called without a valid domainId.");
        dispatch({ type: 'RESET_DOMAIN_STATE' }); // Reset state if no domainId
        return;
    }

    // Prevent reloading if data is recent and domain hasn't changed since last load call
    // Note: This check is less critical now with the useEffect dependency on currentDomainId
    // but can still help prevent redundant calls if loadDomainData is called elsewhere.
    // However, given the potential for server-side updates, it's often better to just reload.
    // Let's remove the lastUpdated check here to ensure freshness when explicitly called.
    // if (state.currentDomainId === domainId && (Date.now() - state.lastUpdated < 5000 && state.domainProgress.size > 0)) {
    //     console.log(`Domain data for ${domainId} is recent, skipping load.`);
    //     return;
    // }


    console.log("Loading domain data for domain:", domainId);
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Load SRS data gracefully, handling missing endpoints if needed
      // Using Promise.all to fetch multiple data points concurrently
      const [progress, stats, prerequisites, dueReviewsResult] = await Promise.allSettled([
        srsApi.getDomainProgress(domainId),
        srsApi.getDomainStats(domainId),
        srsApi.getDomainPrerequisites(domainId),
        srsApi.getDueReviews(domainId, 'mixed') // Load initial mixed reviews
      ]);

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
        // Use default stats or previous stats if available, or null
        // For simplicity, let's reset to a default structure on error if current is null
        if (!state.domainStats || state.domainStats.domainId !== domainId) {
            dispatch({
                type: 'SET_DOMAIN_STATS',
                payload: {
                    domainId: domainId,
                    totalNodes: 0, freshNodes: 0, tacklingNodes: 0, graspedNodes: 0, learnedNodes: 0,
                    dueReviews: 0, completedToday: 0, successRate: 0
                }
            });
        }
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
      // This outer catch is for errors during the Promise.allSettled setup, unlikely but possible.
      console.error('Critical error loading domain data:', error);
      const message = error instanceof Error ? error.message : 'Failed to load domain data';
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]); // loadDomainData itself doesn't depend on state, but dispatch is stable

  const refreshDomainData = useCallback(async () => {
    if (state.currentDomainId !== null) {
      console.log("Refreshing domain data for domain:", state.currentDomainId);
      showToast('Refreshing domain data...', 'info', 1000); // Show briefly
      await loadDomainData(state.currentDomainId);
    } else {
        console.warn("Refresh requested but no domain is set.");
        // Optionally, reset state if refresh is called with no domain
        // dispatch({ type: 'RESET_DOMAIN_STATE' });
    }
  }, [state.currentDomainId, loadDomainData]); // Depends on currentDomainId to know what to refresh and loadDomainData function

  const updateNodeStatus = useCallback(async (
    nodeId: number,
    nodeType: 'definition' | 'exercise',
    status: NodeStatus
  ) => {
    if (state.currentDomainId === null) {
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
      await loadDomainData(state.currentDomainId); // Pass the current domain ID explicitly
      showToast('Status propagation completed', 'success', 2000);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update node status';
      dispatch({ type: 'SET_ERROR', payload: message });
      showToast(message, 'error');
    }
  }, [state.currentDomainId, loadDomainData, dispatch]); // Depend on state.currentDomainId, loadDomainData, and dispatch

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
    if (state.currentDomainId === null) {
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
            srsApi.getDomainStats(state.currentDomainId),
            // Fetch reviews based on the session type if in a session, otherwise mixed
            srsApi.getDueReviews(state.currentDomainId, review.sessionId ? state.currentSession?.sessionType : 'mixed')
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
  }, [state.currentDomainId, state.currentSession?.sessionType, dispatch]); // Depend on currentDomainId, sessionType, and dispatch

  const loadDueReviews = useCallback(async (sessionType: SessionType = 'mixed'): Promise<DueReview[]> => {
    if (state.currentDomainId === null) {
        showToast("No domain selected to load due reviews.", "warning");
        return [];
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const dueReviewsResult = await srsApi.getDueReviews(state.currentDomainId, sessionType);
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
  }, [state.currentDomainId, dispatch]); // Depend on currentDomainId and dispatch

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
  }, [dispatch]); // Depend on dispatch

  const startStudySession = useCallback(async (sessionType: SessionType): Promise<StudySession | null> => {
    if (state.currentDomainId === null) {
      showToast('Please select a domain first.', 'error');
      return null;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const session = await srsApi.startStudySession(state.currentDomainId, sessionType);
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
  }, [state.currentDomainId, loadDueReviews, dispatch]); // Depend on currentDomainId, loadDueReviews, and dispatch

  const endStudySession = useCallback(async () => {
    if (!state.currentSession) {
        console.warn("endStudySession called but no session is active.");
        // If somehow state is inconsistent, ensure session state is reset anyway
        dispatch({ type: 'END_SESSION_SUCCESS' });
        if (state.currentDomainId !== null) {
             // Still attempt to refresh stats if domain is set
             try {
                const stats = await srsApi.getDomainStats(state.currentDomainId);
                dispatch({ type: 'SET_DOMAIN_STATS', payload: stats });
             } catch (refreshError) {
                console.warn('Could not refresh stats after ending session (no active session API call):', refreshError);
             }
        }
        return;
    }
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await srsApi.endStudySession(state.currentSession.id);
      dispatch({ type: 'END_SESSION_SUCCESS' });
      showToast('Study session ended.', 'success');
      // Refresh domain stats after session ends
      if(state.currentDomainId !== null) {
        try {
          const stats = await srsApi.getDomainStats(state.currentDomainId);
          dispatch({ type: 'SET_DOMAIN_STATS', payload: stats });
          // Also refresh due reviews just in case
          await loadDueReviews(state.currentSession.sessionType); // Refresh based on session type
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
  }, [state.currentSession, state.currentDomainId, loadDueReviews, dispatch]); // Depend on currentSession, currentDomainId, loadDueReviews, and dispatch

  const setShowStudyModeInContext = useCallback((show: boolean) => {
    dispatch({ type: 'SET_SHOW_STUDY_MODE', payload: show });
  }, [dispatch]); // Depend on dispatch

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
    // Also clear any lingering animations when clearing errors for a clean state
    dispatch({ type: 'CLEAR_CREDIT_ANIMATIONS' });
  }, [dispatch]); // Depend on dispatch

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
