// client/src/contexts/UIContext.tsx
"use client";

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Window state interface
interface WindowState {
  id: string;
  type: 'detail' | 'review' | 'source' | 'quest' | 'survey';
  title: string;
  contentProps: any;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  isMinimized: boolean;
}

// UI state interface
interface UIState {
  windows: WindowState[];
  maxZIndex: number;
  isReviewActive: boolean;
  activeReviewNodeId: string | null;
  reviewAnswerVisible: boolean;
}

// Action types
type UIAction =
  | { type: 'OPEN_WINDOW'; payload: Omit<WindowState, 'zIndex' | 'isMinimized'> }
  | { type: 'CLOSE_WINDOW'; payload: { id: string } }
  | { type: 'FOCUS_WINDOW'; payload: { id: string } }
  | { type: 'UPDATE_WINDOW'; payload: { id: string; updates: Partial<WindowState> } }
  | { type: 'MINIMIZE_WINDOW'; payload: { id: string } }
  | { type: 'SET_REVIEW_STATE'; payload: { isActive: boolean; nodeId: string | null; answerVisible: boolean } }
  | { type: 'SHOW_REVIEW_ANSWER' }
  | { type: 'CLOSE_ALL_WINDOWS' }
  | { type: 'CLOSE_WINDOWS_BY_TYPE'; payload: { type: 'detail' | 'review' | 'source' | 'quest' | 'survey' } }; // FIX: Add new action

// Initial state
const initialState: UIState = {
  windows: [],
  maxZIndex: 1000,
  isReviewActive: false,
  activeReviewNodeId: null,
  reviewAnswerVisible: false,
};

// Reducer
const uiReducer = (state: UIState, action: UIAction): UIState => {
  switch (action.type) {
    case 'OPEN_WINDOW': {
      const existingWindow = state.windows.find(w => w.id === action.payload.id);
      if (existingWindow) {
        // Window already exists, just focus it
        return uiReducer(state, { type: 'FOCUS_WINDOW', payload: { id: action.payload.id } });
      }
      
      const newWindow: WindowState = {
        ...action.payload,
        zIndex: state.maxZIndex + 1,
        isMinimized: false,
      };
      
      return {
        ...state,
        windows: [...state.windows, newWindow],
        maxZIndex: state.maxZIndex + 1,
      };
    }

    case 'CLOSE_WINDOW': {
      const windowToClose = state.windows.find(w => w.id === action.payload.id);
      
      // FIX: If closing a review window, reset review state
      let newReviewState = {
        isReviewActive: state.isReviewActive,
        activeReviewNodeId: state.activeReviewNodeId,
        reviewAnswerVisible: state.reviewAnswerVisible,
      };
      
      if (windowToClose?.type === 'review') {
        newReviewState = {
          isReviewActive: false,
          activeReviewNodeId: null,
          reviewAnswerVisible: false,
        };
      }
      
      return {
        ...state,
        windows: state.windows.filter(w => w.id !== action.payload.id),
        ...newReviewState,
      };
    }

    case 'FOCUS_WINDOW': {
      const windowIndex = state.windows.findIndex(w => w.id === action.payload.id);
      if (windowIndex === -1) return state;
      
      const updatedWindows = [...state.windows];
      updatedWindows[windowIndex] = {
        ...updatedWindows[windowIndex],
        zIndex: state.maxZIndex + 1,
        isMinimized: false,
      };
      
      return {
        ...state,
        windows: updatedWindows,
        maxZIndex: state.maxZIndex + 1,
      };
    }

    case 'UPDATE_WINDOW': {
      const windowIndex = state.windows.findIndex(w => w.id === action.payload.id);
      if (windowIndex === -1) return state;
      
      const updatedWindows = [...state.windows];
      updatedWindows[windowIndex] = {
        ...updatedWindows[windowIndex],
        ...action.payload.updates,
      };
      
      return {
        ...state,
        windows: updatedWindows,
      };
    }

    case 'MINIMIZE_WINDOW': {
      const windowIndex = state.windows.findIndex(w => w.id === action.payload.id);
      if (windowIndex === -1) return state;
      
      const updatedWindows = [...state.windows];
      updatedWindows[windowIndex] = {
        ...updatedWindows[windowIndex],
        isMinimized: !updatedWindows[windowIndex].isMinimized,
      };
      
      return {
        ...state,
        windows: updatedWindows,
      };
    }

    case 'SET_REVIEW_STATE': {
      return {
        ...state,
        isReviewActive: action.payload.isActive,
        activeReviewNodeId: action.payload.nodeId,
        reviewAnswerVisible: action.payload.answerVisible,
      };
    }

    case 'SHOW_REVIEW_ANSWER': {
      return {
        ...state,
        reviewAnswerVisible: true,
      };
    }

    case 'CLOSE_ALL_WINDOWS': {
      return {
        ...state,
        windows: [],
        // FIX: Reset review state when closing all windows
        isReviewActive: false,
        activeReviewNodeId: null,
        reviewAnswerVisible: false,
      };
    }

    // FIX: Add new action handler
    case 'CLOSE_WINDOWS_BY_TYPE': {
      const remainingWindows = state.windows.filter(w => w.type !== action.payload.type);
      
      // If closing review windows, reset review state
      let newReviewState = {
        isReviewActive: state.isReviewActive,
        activeReviewNodeId: state.activeReviewNodeId,
        reviewAnswerVisible: state.reviewAnswerVisible,
      };
      
      if (action.payload.type === 'review') {
        newReviewState = {
          isReviewActive: false,
          activeReviewNodeId: null,
          reviewAnswerVisible: false,
        };
      }
      
      return {
        ...state,
        windows: remainingWindows,
        ...newReviewState,
      };
    }

    default:
      return state;
  }
};

// Context
interface UIContextType {
  state: UIState;
  openDetailWindow: (
    nodeId: string,
    nodeData: any,
    position?: { x: number; y: number },
    options?: {
      targetVersionId?: number;
      windowId?: string;
      replaceContentIfExists?: boolean;
      keepMinimizedIfExists?: boolean;
    }
  ) => void;
  openSourceWindow: (sourceId: string, sourceData: any, position?: { x: number; y: number }) => void;
  openQuestWindow: (questId: string, questData: any, position?: { x: number; y: number }) => void;
  openSurveyWindow: () => void;
  openReviewWindow: () => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  updateWindow: (id: string, updates: Partial<WindowState>) => void;
  minimizeWindow: (id: string) => void;
  setReviewState: (isActive: boolean, nodeId: string | null, answerVisible: boolean) => void;
  showReviewAnswer: () => void;
  closeAllWindows: () => void;
  closeWindowsByType: (type: 'detail' | 'review' | 'source' | 'quest' | 'survey') => void; // FIX: Add new method
  isNodeBeingReviewed: (nodeId: string) => boolean;
  shouldHideNodeContent: (nodeId: string) => boolean;
  // FIX: Add helper methods for window management
  getActiveDetailWindows: () => WindowState[];
  getActiveReviewWindows: () => WindowState[];
  hasOpenReviewWindow: () => boolean;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

// Provider
export const UIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(uiReducer, initialState);

  const openDetailWindow = useCallback((
    nodeId: string,
    nodeData: any,
    position?: { x: number; y: number },
    options?: {
      targetVersionId?: number;
      windowId?: string;
      replaceContentIfExists?: boolean;
      keepMinimizedIfExists?: boolean;
    }
  ) => {
    const windowId = options?.windowId || `detail-${nodeId}`;
    const existingWindow = state.windows.find(w => w.id === windowId);
    const targetVersionId = options?.targetVersionId;
    const replaceContentIfExists = Boolean(options?.replaceContentIfExists) || typeof targetVersionId === 'number';
    
    if (existingWindow) {
      if (replaceContentIfExists) {
        dispatch({
          type: 'UPDATE_WINDOW',
          payload: {
            id: windowId,
            updates: {
              title: nodeData.name,
              contentProps: {
                ...(existingWindow.contentProps || {}),
                nodeData,
                targetVersionId,
                targetVersionToken: Date.now(),
              },
            },
          },
        });
      }
      const shouldKeepMinimized = Boolean(options?.keepMinimizedIfExists) && existingWindow.isMinimized;
      if (!shouldKeepMinimized) {
        dispatch({ type: 'FOCUS_WINDOW', payload: { id: windowId } });
      }
      return;
    }

    const windowCount = state.windows.filter(w => w.type === 'detail').length;
    const defaultPosition = position || {
      x: 100 + (windowCount * 30),
      y: 100 + (windowCount * 30),
    };

    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id: windowId,
        type: 'detail',
        title: nodeData.name,
        contentProps: {
          nodeData,
          ...((typeof targetVersionId === 'number' || options?.replaceContentIfExists)
            ? { targetVersionId, targetVersionToken: Date.now() }
            : {}),
        },
        position: defaultPosition,
        size: { width: 545, height: 600 },
      },
    });
  }, [state.windows]);

  const openSourceWindow = useCallback((sourceId: string, sourceData: any, position?: { x: number; y: number }) => {
    const windowId = `source-${sourceId}`;
    const existingWindow = state.windows.find(w => w.id === windowId);
    if (existingWindow) {
      dispatch({ type: 'FOCUS_WINDOW', payload: { id: windowId } });
      return;
    }
    const windowCount = state.windows.filter(w => w.type === 'source').length;
    const defaultPosition = position || {
      x: 120 + (windowCount * 30),
      y: 120 + (windowCount * 30),
    };
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id: windowId,
        type: 'source',
        title: sourceData?.title || 'Source',
        contentProps: { sourceData },
        position: defaultPosition,
        size: { width: 520, height: 520 },
      },
    });
  }, [state.windows]);

  const openQuestWindow = useCallback((questId: string, questData: any, position?: { x: number; y: number }) => {
    const windowId = `quest-${questId}`;
    const existingWindow = state.windows.find(w => w.id === windowId);
    if (existingWindow) {
      dispatch({ type: 'FOCUS_WINDOW', payload: { id: windowId } });
      return;
    }
    const windowCount = state.windows.filter(w => w.type === 'quest').length;
    const defaultPosition = position || {
      x: 140 + (windowCount * 30),
      y: 140 + (windowCount * 30),
    };
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id: windowId,
        type: 'quest',
        title: questData?.name || questData?.versions?.[0]?.title || questData?.code || 'Quest',
        contentProps: { questData },
        position: defaultPosition,
        size: { width: 560, height: 560 },
      },
    });
  }, [state.windows]);

  const openSurveyWindow = useCallback(() => {
    const windowId = 'survey-window';
    const existingWindow = state.windows.find(w => w.id === windowId);
    if (existingWindow) {
      dispatch({ type: 'FOCUS_WINDOW', payload: { id: windowId } });
      return;
    }
    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id: windowId,
        type: 'survey',
        title: 'Survey',
        contentProps: {},
        position: { x: 160, y: 120 },
        size: { width: 520, height: 560 },
      },
    });
  }, [state.windows]);

  const openReviewWindow = useCallback(() => {
    const windowId = 'review-session';
    const existingWindow = state.windows.find(w => w.id === windowId);
    
    if (existingWindow) {
      dispatch({ type: 'FOCUS_WINDOW', payload: { id: windowId } });
      return;
    }

    // FIX: Close any existing review windows before opening new one
    dispatch({ type: 'CLOSE_WINDOWS_BY_TYPE', payload: { type: 'review' } });

    dispatch({
      type: 'OPEN_WINDOW',
      payload: {
        id: windowId,
        type: 'review',
        title: 'Study Session',
        contentProps: {},
        position: { x: window.innerWidth / 2 - 350, y: 50 },
        size: { width: 700, height: 500 },
      },
    });
  }, [state.windows]);

  const closeWindow = useCallback((id: string) => {
    dispatch({ type: 'CLOSE_WINDOW', payload: { id } });
  }, []);

  const focusWindow = useCallback((id: string) => {
    dispatch({ type: 'FOCUS_WINDOW', payload: { id } });
  }, []);

  const updateWindow = useCallback((id: string, updates: Partial<WindowState>) => {
    dispatch({ type: 'UPDATE_WINDOW', payload: { id, updates } });
  }, []);

  const minimizeWindow = useCallback((id: string) => {
    dispatch({ type: 'MINIMIZE_WINDOW', payload: { id } });
  }, []);

  const setReviewState = useCallback((isActive: boolean, nodeId: string | null, answerVisible: boolean) => {
    dispatch({ type: 'SET_REVIEW_STATE', payload: { isActive, nodeId, answerVisible } });
  }, []);

  const showReviewAnswer = useCallback(() => {
    dispatch({ type: 'SHOW_REVIEW_ANSWER' });
  }, []);

  const closeAllWindows = useCallback(() => {
    dispatch({ type: 'CLOSE_ALL_WINDOWS' });
  }, []);

  // FIX: Add new method
  const closeWindowsByType = useCallback((type: 'detail' | 'review' | 'source' | 'quest' | 'survey') => {
    dispatch({ type: 'CLOSE_WINDOWS_BY_TYPE', payload: { type } });
  }, []);

  const isNodeBeingReviewed = useCallback((nodeId: string): boolean => {
    return state.isReviewActive && state.activeReviewNodeId === nodeId;
  }, [state.isReviewActive, state.activeReviewNodeId]);

  const shouldHideNodeContent = useCallback((nodeId: string): boolean => {
    return isNodeBeingReviewed(nodeId) && !state.reviewAnswerVisible;
  }, [isNodeBeingReviewed, state.reviewAnswerVisible]);

  // FIX: Add helper methods
  const getActiveDetailWindows = useCallback((): WindowState[] => {
    return state.windows.filter(w => w.type === 'detail' && !w.isMinimized);
  }, [state.windows]);

  const getActiveReviewWindows = useCallback((): WindowState[] => {
    return state.windows.filter(w => w.type === 'review' && !w.isMinimized);
  }, [state.windows]);

  const hasOpenReviewWindow = useCallback((): boolean => {
    return state.windows.some(w => w.type === 'review');
  }, [state.windows]);

  const contextValue: UIContextType = {
    state,
    openDetailWindow,
    openSourceWindow,
    openQuestWindow,
    openSurveyWindow,
    openReviewWindow,
    closeWindow,
    focusWindow,
    updateWindow,
    minimizeWindow,
    setReviewState,
    showReviewAnswer,
    closeAllWindows,
    closeWindowsByType, // FIX: Add new method
    isNodeBeingReviewed,
    shouldHideNodeContent,
    getActiveDetailWindows, // FIX: Add helper
    getActiveReviewWindows, // FIX: Add helper
    hasOpenReviewWindow, // FIX: Add helper
  };

  return <UIContext.Provider value={contextValue}>{children}</UIContext.Provider>;
};

export const useUI = (): UIContextType => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
