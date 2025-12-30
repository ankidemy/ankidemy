// client/src/app/components/Graph/windows/ReviewWindowContent.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/app/components/core/card";
import { Tabs, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { InlineMarkdownKatex, MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import ZoomableImage from '../components/ZoomableImage';
import { useSRS } from '@/contexts/SRSContext';
import { useUI } from '@/contexts/UIContext';
import { DueReview, ReviewQuality, ReviewRequest, SessionType } from '@/types/srs';
import { Eye, Loader2, CheckCircle, MapPin } from 'lucide-react';
import { showToast } from '@/app/components/core/ToastNotification';
import { getMetaDefinition, getMetaExercise, getNextMetaExerciseVersion, getNextMetaDefinitionVersion, DefinitionVersion, ExerciseVersion, MetaDefinition, MetaExercise } from '@/lib/api';

interface ReviewWindowContentProps {
  domainId: number;
  onNavigateToNode?: (nodeCode: string) => void;
  windowId: string;
  reviewMode?: 'normal' | 'frenzy';
}

type FrenzyGraphEdge = {
  id: number;
  type: string;
  weight: number;
};

type FrenzyGraphNode = {
  id: number;
  type: string;
  prerequisites: FrenzyGraphEdge[];
  dependents: FrenzyGraphEdge[];
};

type FrenzyVersionStats = {
  seen: number;
  correct: number;
};

type FrenzyMetaExerciseStats = {
  lastCorrectDifficulty: number;
  versionStats: Map<number, FrenzyVersionStats>;
};

type FrenzyMetaDefinitionStats = {
  versionStats: Map<number, FrenzyVersionStats>;
};

export const ReviewWindowContent: React.FC<ReviewWindowContentProps> = ({ 
  domainId, 
  onNavigateToNode,
  windowId,
  reviewMode = 'normal',
}) => {
  const srs = useSRS();
  const ui = useUI();
  const isFrenzyMode = reviewMode === 'frenzy';
  
  const [sessionType, setSessionType] = useState<SessionType>('mixed');
  const [useReverseOrder, setUseReverseOrder] = useState(false);
  const [currentReviewItem, setCurrentReviewItem] = useState<DueReview | null>(null);
  const [reviewQueue, setReviewQueue] = useState<DueReview[]>([]);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [itemDetails, setItemDetails] = useState<any>(null);
  const [sessionStats, setSessionStats] = useState({ total: 0, completed: 0, correct: 0 });
  const [startTime, setStartTime] = useState<number | null>(null);
  const [autoNavigateToNodes, setAutoNavigateToNodes] = useState(false);
  // User answer state for non-verifiable exercises
  const [userAnswer, setUserAnswer] = useState<string>("");
  const [answerPreview, setAnswerPreview] = useState<boolean>(false);
  const [frenzyRound, setFrenzyRound] = useState(1);
  const [frenzyPool, setFrenzyPool] = useState<DueReview[]>([]);
  
  // FIX 1: Add refresh mechanism to update item details when nodes are edited
  const currentItemIdRef = useRef<string | null>(null);

  const frenzyGraphRef = useRef<Map<string, FrenzyGraphNode>>(new Map());
  const frenzyPoolRef = useRef<Set<string>>(new Set());
  const frenzyPoolMapRef = useRef<Map<string, DueReview>>(new Map());
  const frenzyCreditsRef = useRef<Map<string, number>>(new Map());
  const frenzyPersistedRef = useRef<Set<string>>(new Set());
  const frenzyMetaDefinitionCacheRef = useRef<Map<number, MetaDefinition>>(new Map());
  const frenzyMetaExerciseCacheRef = useRef<Map<number, MetaExercise>>(new Map());
  const frenzyMetaDefinitionStatsRef = useRef<Map<number, FrenzyMetaDefinitionStats>>(new Map());
  const frenzyMetaExerciseStatsRef = useRef<Map<number, FrenzyMetaExerciseStats>>(new Map());
  
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
    if (isFrenzyMode) return;
    if (!currentReviewItem || currentItemIdRef.current !== currentReviewItem.nodeCode) return;
    if (!itemDetails?.id) return;

    const refreshCurrentItem = async () => {
      try {
        if (currentReviewItem.nodeType === 'definition') {
          const meta = await getMetaDefinition(currentReviewItem.nodeId);
          const updated = meta.versions?.find(version => version.id === itemDetails.id);
          if (updated) {
            setItemDetails(prev => (prev?.id === itemDetails.id ? { ...prev, ...updated } : prev));
          }
        } else {
          const meta = await getMetaExercise(currentReviewItem.nodeId);
          const updated = meta.versions?.find(version => version.id === itemDetails.id);
          if (updated) {
            setItemDetails(prev => (prev?.id === itemDetails.id ? { ...prev, ...updated } : prev));
          }
        }
      } catch (error) {
        console.error("Error refreshing current item:", error);
      }
    };

    refreshCurrentItem();
  }, [srs.state.lastUpdated, currentReviewItem, itemDetails?.id, isFrenzyMode]);

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

  const getNodeKey = (nodeType: string, nodeId: number) => `${nodeType}_${nodeId}`;

  const parseNodeKey = (key: string): { id: number; type: string } | null => {
    const splitIndex = key.lastIndexOf('_');
    if (splitIndex <= 0) return null;
    const type = key.slice(0, splitIndex);
    const id = Number(key.slice(splitIndex + 1));
    if (!Number.isFinite(id)) return null;
    return { id, type };
  };

  const toPoolType = (nodeType: string) => {
    if (nodeType === 'meta_definition') return 'definition';
    if (nodeType === 'meta_exercise') return 'exercise';
    return nodeType;
  };

  const resolveGraphKey = useCallback((nodeType: string, nodeId: number, graph: Map<string, FrenzyGraphNode>) => {
    const direct = getNodeKey(nodeType, nodeId);
    if (graph.has(direct)) return direct;
    if (nodeType === 'definition' || nodeType === 'exercise') {
      const metaType = nodeType === 'definition' ? 'meta_definition' : 'meta_exercise';
      const metaKey = getNodeKey(metaType, nodeId);
      if (graph.has(metaKey)) return metaKey;
    }
    if (nodeType === 'meta_definition' || nodeType === 'meta_exercise') {
      const baseType = nodeType === 'meta_definition' ? 'definition' : 'exercise';
      const baseKey = getNodeKey(baseType, nodeId);
      if (graph.has(baseKey)) return baseKey;
    }
    return direct;
  }, []);

  const buildFrenzyGraph = useCallback(() => {
    const graph = new Map<string, FrenzyGraphNode>();
    const nodeSet = new Set<string>();

    srs.state.prerequisites.forEach((prereq) => {
      nodeSet.add(getNodeKey(prereq.nodeType, prereq.nodeId));
      nodeSet.add(getNodeKey(prereq.prerequisiteType, prereq.prerequisiteId));
    });

    nodeSet.forEach((key) => {
      const parsed = parseNodeKey(key);
      if (!parsed) return;
      graph.set(key, {
        id: parsed.id,
        type: parsed.type,
        prerequisites: [],
        dependents: [],
      });
    });

    srs.state.prerequisites.forEach((prereq) => {
      const nodeKey = getNodeKey(prereq.nodeType, prereq.nodeId);
      const prereqKey = getNodeKey(prereq.prerequisiteType, prereq.prerequisiteId);
      const weight = prereq.weight || 1;

      const node = graph.get(nodeKey);
      if (node) {
        node.prerequisites.push({ id: prereq.prerequisiteId, type: prereq.prerequisiteType, weight });
      }

      const prereqNode = graph.get(prereqKey);
      if (prereqNode) {
        prereqNode.dependents.push({ id: prereq.nodeId, type: prereq.nodeType, weight });
      }
    });

    frenzyGraphRef.current = graph;
    return graph;
  }, [srs.state.prerequisites]);

  const isDueNow = (nextReview?: string | null, status?: string, isDue?: boolean) => {
    if (typeof isDue === 'boolean') return isDue;
    if (status !== 'grasped') return false;
    if (!nextReview) return true;
    const reviewTime = new Date(nextReview).getTime();
    return Number.isFinite(reviewTime) && reviewTime <= Date.now();
  };

  const buildFrenzyPool = useCallback(() => {
    const pool: DueReview[] = [];
    srs.state.domainProgress.forEach((progress) => {
      if (progress.status !== 'grasped') return;
      if (sessionType !== 'mixed' && progress.nodeType !== sessionType) return;

      const nodeCode = progress.nodeCode || `${progress.nodeType}-${progress.nodeId}`;
      const nodeName = progress.nodeName || nodeCode;
      pool.push({
        nodeId: progress.nodeId,
        nodeType: progress.nodeType,
        nodeCode,
        nodeName,
        status: progress.status,
        nextReview: progress.nextReview,
        isDue: isDueNow(progress.nextReview, progress.status, progress.isDue),
        daysUntilReview: progress.daysUntilReview,
      });
    });
    return pool;
  }, [srs.state.domainProgress, sessionType]);

  const shuffleQueue = (items: DueReview[]) => {
    const next = [...items];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  };

  const getDependentCount = useCallback((item: DueReview, poolKeys: Set<string>, graph: Map<string, FrenzyGraphNode>) => {
    const startKey = resolveGraphKey(item.nodeType, item.nodeId, graph);
    const startNode = graph.get(startKey);
    if (!startNode) return 0;

    const visited = new Set<string>();
    const stack = startNode.dependents.map(edge => getNodeKey(edge.type, edge.id));
    let count = 0;

    while (stack.length > 0) {
      const key = stack.pop();
      if (!key || visited.has(key)) continue;
      visited.add(key);

      const parsed = parseNodeKey(key);
      if (parsed) {
        const poolKey = getNodeKey(toPoolType(parsed.type), parsed.id);
        if (poolKeys.has(poolKey)) {
          count += 1;
        }
      }

      const node = graph.get(key);
      if (node) {
        node.dependents.forEach(edge => {
          const nextKey = getNodeKey(edge.type, edge.id);
          if (!visited.has(nextKey)) {
            stack.push(nextKey);
          }
        });
      }
    }

    return count;
  }, [resolveGraphKey]);

  const buildFrenzyQueue = useCallback((pool: DueReview[], reverseOrder: boolean) => {
    if (pool.length === 0) return [];
    if (!reverseOrder) {
      return shuffleQueue(pool);
    }

    const graph = frenzyGraphRef.current;
    const poolKeys = frenzyPoolRef.current;
    const targetKeys = poolKeys;
    const scored = pool.map(item => ({
      item,
      dependents: getDependentCount(item, targetKeys, graph),
    }));

    scored.sort((a, b) => {
      if (a.dependents !== b.dependents) {
        return b.dependents - a.dependents;
      }
      return a.item.nodeCode.localeCompare(b.item.nodeCode);
    });

    return scored.map(entry => entry.item);
  }, [getDependentCount]);

  const buildReverseOrderQueue = useCallback((items: DueReview[]) => {
    if (items.length === 0) return items;
    const graph = frenzyGraphRef.current.size > 0 ? frenzyGraphRef.current : buildFrenzyGraph();
    const dueKeys = new Set(items.map(item => getNodeKey(item.nodeType, item.nodeId)));
    const scored = items.map(item => ({
      item,
      dependents: getDependentCount(item, dueKeys, graph),
    }));

    scored.sort((a, b) => {
      if (a.dependents !== b.dependents) {
        return b.dependents - a.dependents;
      }
      return a.item.nodeCode.localeCompare(b.item.nodeCode);
    });

    return scored.map(entry => entry.item);
  }, [buildFrenzyGraph, getDependentCount]);

  const getFrenzyDefinitionVersion = useCallback(async (metaId: number): Promise<DefinitionVersion | null> => {
    let meta = frenzyMetaDefinitionCacheRef.current.get(metaId);
    if (!meta) {
      meta = await getMetaDefinition(metaId);
      frenzyMetaDefinitionCacheRef.current.set(metaId, meta);
    }

    const versions = meta.versions || [];
    if (versions.length === 0) return null;

    const stats = frenzyMetaDefinitionStatsRef.current.get(metaId) || { versionStats: new Map() };

    let minSeen = Number.POSITIVE_INFINITY;
    versions.forEach((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      if (versionStats.seen < minSeen) minSeen = versionStats.seen;
    });

    const minSeenVersions = versions.filter((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      return versionStats.seen === minSeen;
    });

    let maxFailures = -1;
    minSeenVersions.forEach((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      const failures = versionStats.seen - versionStats.correct;
      if (failures > maxFailures) maxFailures = failures;
    });

    const pool = minSeenVersions.filter((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      return versionStats.seen - versionStats.correct === maxFailures;
    });

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const chosenStats = stats.versionStats.get(chosen.id) || { seen: 0, correct: 0 };
    chosenStats.seen += 1;
    stats.versionStats.set(chosen.id, chosenStats);
    frenzyMetaDefinitionStatsRef.current.set(metaId, stats);

    return chosen;
  }, []);

  const getFrenzyExerciseVersion = useCallback(async (metaId: number): Promise<ExerciseVersion | null> => {
    let meta = frenzyMetaExerciseCacheRef.current.get(metaId);
    if (!meta) {
      meta = await getMetaExercise(metaId);
      frenzyMetaExerciseCacheRef.current.set(metaId, meta);
    }

    const versions = meta.versions || [];
    if (versions.length === 0) return null;

    const stats = frenzyMetaExerciseStatsRef.current.get(metaId) || {
      lastCorrectDifficulty: 1,
      versionStats: new Map(),
    };

    const eligible = versions.filter((version) => {
      const difficulty = version.difficulty ?? 1;
      return difficulty >= stats.lastCorrectDifficulty;
    });
    const pickSet = eligible.length > 0 ? eligible : versions;

    let minSeen = Number.POSITIVE_INFINITY;
    pickSet.forEach((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      if (versionStats.seen < minSeen) minSeen = versionStats.seen;
    });

    const pool = pickSet.filter((version) => {
      const versionStats = stats.versionStats.get(version.id) || { seen: 0, correct: 0 };
      return versionStats.seen === minSeen;
    });

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const chosenStats = stats.versionStats.get(chosen.id) || { seen: 0, correct: 0 };
    chosenStats.seen += 1;
    stats.versionStats.set(chosen.id, chosenStats);
    frenzyMetaExerciseStatsRef.current.set(metaId, stats);

    return chosen;
  }, []);

  const resetFrenzyState = useCallback(() => {
    setFrenzyRound(1);
    setFrenzyPool([]);
    frenzyGraphRef.current = new Map();
    frenzyPoolRef.current = new Set();
    frenzyPoolMapRef.current = new Map();
    frenzyCreditsRef.current = new Map();
    frenzyPersistedRef.current = new Set();
    frenzyMetaDefinitionCacheRef.current = new Map();
    frenzyMetaExerciseCacheRef.current = new Map();
    frenzyMetaDefinitionStatsRef.current = new Map();
    frenzyMetaExerciseStatsRef.current = new Map();
  }, []);

  const propagateImplicitCredits = useCallback((item: DueReview, success: boolean) => {
    const graph = frenzyGraphRef.current;
    const startKey = resolveGraphKey(item.nodeType, item.nodeId, graph);
    const startNode = graph.get(startKey);
    if (!startNode) return [];

    const bestDist = new Map<string, number>();
    const bestWeight = new Map<string, number>();
    const discovery: string[] = [];

    bestDist.set(startKey, 0);
    bestWeight.set(startKey, 0);

    const queue: Array<{ id: number; type: string; distance: number; pathWeight: number }> = [];
    const nextEdges = (node: FrenzyGraphNode) => (success ? node.prerequisites : node.dependents);

    nextEdges(startNode).forEach(edge => {
      queue.push({ id: edge.id, type: edge.type, distance: 2, pathWeight: edge.weight });
    });

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (current.distance - 1 > 6) continue;

      const key = getNodeKey(current.type, current.id);
      const existingDistance = bestDist.get(key);
      if (existingDistance === undefined) {
        bestDist.set(key, current.distance);
        bestWeight.set(key, current.pathWeight);
        discovery.push(key);

        const node = graph.get(key);
        if (node) {
          nextEdges(node).forEach(edge => {
            queue.push({
              id: edge.id,
              type: edge.type,
              distance: current.distance + 1,
              pathWeight: current.pathWeight * edge.weight,
            });
          });
        }
        continue;
      }

      if (current.distance === existingDistance) {
        const existingWeight = bestWeight.get(key) || 0;
        if (Math.abs(current.pathWeight) > Math.abs(existingWeight)) {
          bestWeight.set(key, current.pathWeight);
        }
      }
    }

    const credits: Array<{ key: string; credit: number }> = [];
    discovery.forEach((key) => {
      const parsed = parseNodeKey(key);
      if (!parsed) return;
      const distance = bestDist.get(key);
      const weight = bestWeight.get(key);
      if (!distance || weight === undefined) return;

      let amount = weight / distance;
      if (Math.abs(amount) < 0.01) return;
      if (!success) amount = -amount;

      const poolKey = getNodeKey(toPoolType(parsed.type), parsed.id);
      credits.push({ key: poolKey, credit: amount });
    });

    return credits;
  }, [resolveGraphKey]);

  const applyFrenzyCreditsToQueue = useCallback((queue: DueReview[], credits: Array<{ key: string; credit: number }>) => {
    const poolKeys = frenzyPoolRef.current;
    const poolMap = frenzyPoolMapRef.current;
    const creditMap = frenzyCreditsRef.current;
    const nextQueue = [...queue];
    const queueKeys = new Set(nextQueue.map(item => getNodeKey(item.nodeType, item.nodeId)));

    credits.forEach(({ key, credit }) => {
      if (!poolKeys.has(key)) return;
      const currentCredit = creditMap.get(key) || 0;
      const nextCredit = currentCredit + credit;
      creditMap.set(key, nextCredit);

      if (nextCredit >= 1) {
        if (queueKeys.has(key)) {
          queueKeys.delete(key);
        }
      } else if (nextCredit <= -1) {
        if (!queueKeys.has(key)) {
          const item = poolMap.get(key);
          if (item) {
            nextQueue.push(item);
            queueKeys.add(key);
          }
        }
      }
    });

    return nextQueue.filter(item => queueKeys.has(getNodeKey(item.nodeType, item.nodeId)));
  }, []);

  // Load review items when session starts
  useEffect(() => {
    if (isFrenzyMode) return;
    if (srs.state.currentSession && srs.state.dueReviews.length > 0 && !currentReviewItem) {
      const filteredReviews = srs.state.dueReviews.filter(review => {
        if (sessionType === 'mixed') return true;
        return review.nodeType === sessionType;
      });
      const orderedReviews = useReverseOrder
        ? buildReverseOrderQueue(filteredReviews)
        : filteredReviews;
      
      setReviewQueue(orderedReviews);
      setSessionStats(prev => ({ 
        ...prev, 
        total: orderedReviews.length, 
        completed: 0, 
        correct: 0 
      }));
      
      if (orderedReviews.length > 0) {
        loadReviewItem(orderedReviews[0]);
      } else {
        showToast("No items due for this session type.", "info");
        srs.endStudySession();
      }
    }
  }, [
    srs.state.currentSession,
    srs.state.dueReviews,
    sessionType,
    currentReviewItem,
    srs,
    isFrenzyMode,
    useReverseOrder,
    buildReverseOrderQueue,
  ]);

  // Load a review item
  const loadReviewItem = useCallback(async (review: DueReview | undefined) => {
    if (!review) {
      setCurrentReviewItem(null);
      setItemDetails(null);
      currentItemIdRef.current = null;
      ui.setReviewState(false, null, false);
      
      if (!isFrenzyMode && srs.state.currentSession) {
        showToast("Study session complete!", "success");
        await srs.endStudySession();
      }
      return;
    }

    setIsLoadingItem(true);
    setShowAnswer(false);
    setUserAnswer("");
    setAnswerPreview(false);
    setCurrentReviewItem(review);
    currentItemIdRef.current = review.nodeCode;
    
    ui.setReviewState(true, review.nodeCode, false);

    try {
      let details;
      if (review.nodeType === 'definition') {
        details = isFrenzyMode
          ? await getFrenzyDefinitionVersion(review.nodeId)
          : await getNextMetaDefinitionVersion(review.nodeId);
      } else {
        details = isFrenzyMode
          ? await getFrenzyExerciseVersion(review.nodeId)
          : await getNextMetaExerciseVersion(review.nodeId);
      }

      if (!details) {
        throw new Error("No version available for review.");
      }

      setItemDetails(details);
      
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
  }, [
    autoNavigateToNodes,
    onNavigateToNode,
    srs,
    ui,
    isFrenzyMode,
    getFrenzyDefinitionVersion,
    getFrenzyExerciseVersion,
  ]);

  const startFrenzyRound = useCallback((round: number, pool: DueReview[]) => {
    frenzyCreditsRef.current = new Map();
    const queue = buildFrenzyQueue(pool, round === 1);
    setReviewQueue(queue);
    setSessionStats({ total: queue.length, completed: 0, correct: 0 });
    if (queue.length > 0) {
      loadReviewItem(queue[0]);
    } else {
      showToast("No items available for this session type.", "info");
    }
  }, [buildFrenzyQueue, loadReviewItem]);

  // Handle session start
  const handleStartSession = useCallback(async () => {
    if (!domainId) {
      showToast("Domain ID is missing.", "error");
      return;
    }
    
    try {
      await srs.startStudySession(sessionType);
      setStartTime(Date.now());

      if (isFrenzyMode) {
        resetFrenzyState();
        if (srs.state.domainProgress.size === 0) {
          await srs.refreshDomainData();
        }
        buildFrenzyGraph();
        const pool = buildFrenzyPool();

        if (pool.length === 0) {
          showToast("No grasped items available for this session type.", "info");
          await srs.endStudySession();
          resetFrenzyState();
          return;
        }

        setFrenzyPool(pool);
        frenzyPoolRef.current = new Set(pool.map(item => getNodeKey(item.nodeType, item.nodeId)));
        frenzyPoolMapRef.current = new Map(pool.map(item => [getNodeKey(item.nodeType, item.nodeId), item]));
        setFrenzyRound(1);
        startFrenzyRound(1, pool);
      }
      
      // Update window title
      ui.updateWindow(windowId, {
        title: `${isFrenzyMode ? 'Frenzy Session' : 'Study Session'}: ${sessionType.charAt(0).toUpperCase() + sessionType.slice(1)}`
      });
    } catch (error) {
      console.error('Failed to start session:', error);
      showToast("Failed to start study session", "error");
    }
  }, [
    domainId,
    sessionType,
    srs,
    ui,
    windowId,
    isFrenzyMode,
    resetFrenzyState,
    buildFrenzyGraph,
    buildFrenzyPool,
    startFrenzyRound,
  ]);

  // Handle showing answer
  const handleShowAnswer = useCallback(() => {
    setShowAnswer(true);
    setAnswerPreview(true);
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
    if (!currentReviewItem || startTime === null) return;

    const success = quality >= 3;
    const timeTaken = Math.round((Date.now() - startTime) / 1000);

    if (isFrenzyMode) {
      setSessionStats(prev => ({
        ...prev,
        completed: prev.completed + 1,
        correct: prev.correct + (success ? 1 : 0),
      }));

      if (currentReviewItem.nodeType === 'definition' && itemDetails?.id) {
        const stats = frenzyMetaDefinitionStatsRef.current.get(currentReviewItem.nodeId) || { versionStats: new Map() };
        const versionStats = stats.versionStats.get(itemDetails.id) || { seen: 0, correct: 0 };
        if (success) versionStats.correct += 1;
        stats.versionStats.set(itemDetails.id, versionStats);
        frenzyMetaDefinitionStatsRef.current.set(currentReviewItem.nodeId, stats);
      }

      if (currentReviewItem.nodeType === 'exercise' && itemDetails?.id) {
        const stats = frenzyMetaExerciseStatsRef.current.get(currentReviewItem.nodeId) || {
          lastCorrectDifficulty: 1,
          versionStats: new Map(),
        };
        const versionStats = stats.versionStats.get(itemDetails.id) || { seen: 0, correct: 0 };
        if (success) {
          versionStats.correct += 1;
          const difficulty = itemDetails?.difficulty ?? 1;
          if (difficulty > stats.lastCorrectDifficulty) {
            stats.lastCorrectDifficulty = difficulty;
          }
        }
        stats.versionStats.set(itemDetails.id, versionStats);
        frenzyMetaExerciseStatsRef.current.set(currentReviewItem.nodeId, stats);
      }

      const reviewKey = getNodeKey(currentReviewItem.nodeType, currentReviewItem.nodeId);
      const shouldPersist = !!currentReviewItem.isDue && !frenzyPersistedRef.current.has(reviewKey) && srs.state.currentSession;

      if (shouldPersist) {
        const reviewData: ReviewRequest = {
          nodeId: currentReviewItem.nodeId,
          nodeType: currentReviewItem.nodeType === 'definition' ? 'meta_definition' : 'exercise',
          success,
          quality,
          timeTaken,
          sessionId: srs.state.currentSession?.id,
          versionId: itemDetails?.id ? itemDetails.id : undefined,
        };
        try {
          await srs.submitReview(reviewData);
          frenzyPersistedRef.current.add(reviewKey);
        } catch (error) {
          console.error('Failed to submit SRS review:', error);
          showToast("Failed to update SRS review", "error");
        }
      }

      let nextQueue = reviewQueue.slice(1);
      if (!success) {
        nextQueue.push(currentReviewItem);
      }

      const credits = propagateImplicitCredits(currentReviewItem, success);
      nextQueue = applyFrenzyCreditsToQueue(nextQueue, credits);
      const unique = new Map(nextQueue.map(item => [getNodeKey(item.nodeType, item.nodeId), item]));
      nextQueue = Array.from(unique.values());

      setStartTime(Date.now());

      if (nextQueue.length === 0) {
        const nextRound = frenzyRound + 1;
        setFrenzyRound(nextRound);
        startFrenzyRound(nextRound, frenzyPool);
        return;
      }

      setReviewQueue(nextQueue);
      loadReviewItem(nextQueue[0]);
      return;
    }

    if (!srs.state.currentSession) return;

    const reviewData: ReviewRequest = {
      nodeId: currentReviewItem.nodeId,
      nodeType: currentReviewItem.nodeType === 'definition' ? 'meta_definition' : 'exercise',
      success,
      quality,
      timeTaken,
      sessionId: srs.state.currentSession.id,
      versionId: itemDetails?.id ? itemDetails.id : undefined,
    };

    try {
      await srs.submitReview(reviewData);

      setSessionStats(prev => ({
        ...prev,
        completed: prev.completed + 1,
        correct: prev.correct + (success ? 1 : 0),
      }));
      
      setStartTime(Date.now());
      
      const newQueue = reviewQueue.slice(1);
      setReviewQueue(newQueue);
      loadReviewItem(newQueue[0]);
    } catch (error) {
      console.error('Failed to submit review:', error);
      showToast("Failed to submit review", "error");
    }
  }, [
    currentReviewItem,
    srs,
    startTime,
    reviewQueue,
    loadReviewItem,
    isFrenzyMode,
    frenzyRound,
    frenzyPool,
    propagateImplicitCredits,
    applyFrenzyCreditsToQueue,
    startFrenzyRound,
    itemDetails,
  ]);

  const handleSkipReview = useCallback(() => {
    if (!isFrenzyMode || !currentReviewItem) return;

    setSessionStats(prev => ({
      ...prev,
      completed: prev.completed + 1,
    }));

    if (currentReviewItem.nodeType === 'definition' && itemDetails?.id) {
      const stats = frenzyMetaDefinitionStatsRef.current.get(currentReviewItem.nodeId) || { versionStats: new Map() };
      const versionStats = stats.versionStats.get(itemDetails.id) || { seen: 0, correct: 0 };
      versionStats.correct += 1;
      stats.versionStats.set(itemDetails.id, versionStats);
      frenzyMetaDefinitionStatsRef.current.set(currentReviewItem.nodeId, stats);
    }

    if (currentReviewItem.nodeType === 'exercise' && itemDetails?.id) {
      const stats = frenzyMetaExerciseStatsRef.current.get(currentReviewItem.nodeId) || {
        lastCorrectDifficulty: 1,
        versionStats: new Map(),
      };
      const versionStats = stats.versionStats.get(itemDetails.id) || { seen: 0, correct: 0 };
      versionStats.correct += 1;
      const difficulty = itemDetails?.difficulty ?? 1;
      if (difficulty > stats.lastCorrectDifficulty) {
        stats.lastCorrectDifficulty = difficulty;
      }
      stats.versionStats.set(itemDetails.id, versionStats);
      frenzyMetaExerciseStatsRef.current.set(currentReviewItem.nodeId, stats);
    }

    const nextQueue = reviewQueue.slice(1);
    setStartTime(Date.now());

    if (nextQueue.length === 0) {
      const nextRound = frenzyRound + 1;
      setFrenzyRound(nextRound);
      startFrenzyRound(nextRound, frenzyPool);
      return;
    }

    setReviewQueue(nextQueue);
    loadReviewItem(nextQueue[0]);
  }, [
    isFrenzyMode,
    currentReviewItem,
    itemDetails,
    reviewQueue,
    frenzyRound,
    frenzyPool,
    startFrenzyRound,
    loadReviewItem,
  ]);

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
      resetFrenzyState();
      
      // Clear review state in UI context
      ui.setReviewState(false, null, false);
      
      showToast("Session ended successfully", "success");
    } catch (error) {
      console.error('Failed to end session:', error);
      showToast("Failed to end session", "error");
    }
  }, [srs, ui, resetFrenzyState]);

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
            {/* Display the prompt from the definition version */}
            <h3 className="text-lg font-semibold mb-2">
              <InlineMarkdownKatex>{currentReviewItem.nodeName}</InlineMarkdownKatex>
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
              Exercise: <InlineMarkdownKatex>{itemDetails.name || currentReviewItem.nodeName}</InlineMarkdownKatex>
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
                  <div className="bg-gray-50 border border-gray-200 rounded p-2 text-sm">
                    {userAnswer?.trim() ? (
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
                )}
              </div>
            )}

            {/* Non-verifiable: after reveal show side-by-side compare */}
            {itemDetails?.verifiable === false && showAnswer && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                      {userAnswer?.trim() ? (
                        <MarkdownKatex className="whitespace-pre-wrap">{userAnswer}</MarkdownKatex>
                      ) : (
                        <span className="text-gray-400 italic">No answer provided</span>
                      )}
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

  const qualityButtons: { label: string; quality: ReviewQuality, color: string }[] = [
    { label: "Again", quality: 0, color: "bg-red-500 hover:bg-red-600" },
    { label: "Hard", quality: 1, color: "bg-orange-500 hover:bg-orange-600" }, 
    { label: "Good", quality: 4, color: "bg-blue-500 hover:bg-blue-600" },      
    { label: "Easy", quality: 5, color: "bg-green-500 hover:bg-green-600" },    
  ];

  return (
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
            {!isFrenzyMode && (
              <label className="flex items-center justify-center text-sm text-gray-600 mb-4">
                <input
                  type="checkbox"
                  checked={useReverseOrder}
                  onChange={(e) => setUseReverseOrder(e.target.checked)}
                  className="mr-2"
                />
                Reverse order (dependents first)
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
                    <span>
                      {isFrenzyMode ? `Round ${frenzyRound} • ` : ''}
                      Item {sessionStats.completed + 1} of {sessionStats.total}
                    </span>
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
                      isFrenzyMode ? (
                        <div>
                          <Loader2 className="animate-spin h-10 w-10 mx-auto text-orange-500 mb-3" />
                          <p className="text-lg font-semibold">Starting next round...</p>
                        </div>
                      ) : (
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
                      )
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

              {isFrenzyMode && currentReviewItem && (
                <Button
                  onClick={handleSkipReview}
                  variant="outline"
                  size="sm"
                  className="w-full"
                >
                  Skip Item
                </Button>
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
    
  );
};
