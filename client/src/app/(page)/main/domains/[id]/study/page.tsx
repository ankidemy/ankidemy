//src/app/(page)/main/domains/[id]/study/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { use } from 'react';
import KnowledgeGraph from '@/app/components/Graph/KnowledgeGraph';
import {
  exportDomain,
  updateGraphPositions,
  GraphData,
  ContentBinding,
  detachLiveImportBinding,
  getLiveImportDomainBinding,
  getLiveImportStatus,
  resyncLiveImportBinding,
  subscribeLiveImportEvents,
} from '@/lib/api';
import { useAppDarkMode } from '@/lib/use-app-dark-mode';
import { showToast } from '@/app/components/core/ToastNotification';
import { Radio, RefreshCw, Unplug, Unlink } from 'lucide-react';
import { REVIEW_SUBMISSION_STATE_EVENT } from '@/app/components/Graph/utils/reviewSyncEvents';

// Add correct typing for params
interface StudyPageProps {
  // In Next.js 15 with React 19, page `params` can be a Promise
  // when using Client Components with `use()` to unwrap.
  params: Promise<{ id: string }>;
}

export default function StudyPage({ params }: StudyPageProps) {
  const router = useRouter();
  // Unwrap params to access the id safely
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const isDarkMode = useAppDarkMode();
  
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveBinding, setLiveBinding] = useState<ContentBinding | null>(null);
  const [bridgeConnection, setBridgeConnection] = useState<'online' | 'connecting' | 'offline'>('offline');
  const [livePresenceCode, setLivePresenceCode] = useState<string | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const reviewSubmissionInFlightRef = useRef(false);
  const pendingRootDomainRef = useRef<number | null>(null);

  useEffect(() => {
    const handleReviewSubmission = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ inFlight?: boolean }>;
      reviewSubmissionInFlightRef.current = !!event.detail?.inFlight;
      if (!reviewSubmissionInFlightRef.current && pendingRootDomainRef.current) {
        const pendingDomain = pendingRootDomainRef.current;
        pendingRootDomainRef.current = null;
        router.replace(`/main/domains/${pendingDomain}/study`);
      }
    };
    window.addEventListener(REVIEW_SUBMISSION_STATE_EVENT, handleReviewSubmission as EventListener);
    return () => window.removeEventListener(REVIEW_SUBMISSION_STATE_EVENT, handleReviewSubmission as EventListener);
  }, [router]);

  const loadGraph = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const domainId = parseInt(id);
      if (isNaN(domainId)) throw new Error('Invalid domain ID');
      const data = await exportDomain(domainId);
      setGraphData(data);
      setError(null);
    } catch (loadError) {
      console.error('Error fetching graph data:', loadError);
      setError('Failed to load domain data. Please try again.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadGraph(true);
  }, [loadGraph]);

  useEffect(() => {
    const domainId = Number.parseInt(id, 10);
    if (!Number.isFinite(domainId)) return;
    let active = true;
    let stopEvents: (() => void) | undefined;
    const connect = async () => {
      try {
        const [domainBinding, status] = await Promise.all([
          getLiveImportDomainBinding(domainId),
          getLiveImportStatus(),
        ]);
        if (!active || !status.enabled) return;
        setLiveBinding(domainBinding.managed ? domainBinding.binding || null : null);
        setBridgeConnection(status.connectionState);
        stopEvents = subscribeLiveImportEvents(event => {
          if (!active) return;
          if (event.type === 'connection.changed' && event.connectionState) {
            setBridgeConnection(event.connectionState);
          }
          if (event.type === 'root.available' && event.domainId && event.domainId !== domainId) {
            if (reviewSubmissionInFlightRef.current) {
              pendingRootDomainRef.current = event.domainId;
            } else {
              router.replace(`/main/domains/${event.domainId}/study`);
            }
          }
          if (event.type === 'presence.changed') {
            if (event.domainId === domainId) setLivePresenceCode(event.code || null);
          }
          if (event.type === 'sync.accepted' && event.domainId === domainId) {
            void loadGraph(false);
          }
          if (event.type === 'sync.rejected' && event.domainId === domainId) {
            showToast(event.message || 'Org changes were rejected; the previous snapshot remains active.', 'error');
          }
          if (event.type === 'binding.detached' && event.domainId === domainId) {
            setLiveBinding(null);
            setLivePresenceCode(null);
          }
        });
      } catch (liveError) {
        console.warn('Development live import is unavailable', liveError);
      }
    };
    void connect();
    return () => {
      active = false;
      stopEvents?.();
    };
  }, [id, loadGraph, router]);

  const handleResync = async () => {
    if (!liveBinding || isResyncing) return;
    setIsResyncing(true);
    try {
      await resyncLiveImportBinding(liveBinding.id);
      await loadGraph(false);
      showToast('Org notebook synchronized', 'success');
    } catch (syncError: any) {
      showToast(syncError?.message || 'Live import failed', 'error');
    } finally {
      setIsResyncing(false);
    }
  };

  const handleDetach = async () => {
    if (!liveBinding || !window.confirm('Detach this notebook? The domain and learning history stay intact, but Org updates will stop.')) return;
    try {
      await detachLiveImportBinding(liveBinding.id);
      setLiveBinding(null);
      setLivePresenceCode(null);
      showToast('Notebook detached; this domain is editable again', 'success');
    } catch (detachError: any) {
      showToast(detachError?.message || 'Could not detach notebook', 'error');
    }
  };

  const handleBack = () => {
    router.push('/main');
  };

  const handlePositionUpdate = async (positions: Record<string, { x: number; y: number }>) => {
    try {
      const domainId = parseInt(id);
      if (!isNaN(domainId) && positions && Object.keys(positions).length > 0) {
        await updateGraphPositions(domainId, positions);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating positions:', error);
      return false;
    }
  };

  if (loading) {
    return (
      <div className={`h-screen flex items-center justify-center ${isDarkMode ? 'bg-slate-950 text-slate-100' : ''}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading domain graph...</p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className={`h-screen flex items-center justify-center ${isDarkMode ? 'bg-slate-950' : ''}`}>
        <div className={`max-w-md p-6 rounded-lg shadow-md ${isDarkMode ? 'bg-slate-900 border border-slate-700 text-slate-100' : 'bg-white'}`}>
          <h2 className="text-xl font-bold text-red-600 mb-4">Error Loading Domain</h2>
          <p className={`mb-4 ${isDarkMode ? 'text-slate-300' : 'text-gray-700'}`}>{error || 'Could not load domain data.'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Note: We don't need to wrap the KnowledgeGraph with MathJaxProvider here
  // because KnowledgeGraph already has its own MathJaxProvider
  return (
    <div className={`h-screen relative ${isDarkMode ? 'bg-slate-950' : ''}`}>
      {liveBinding && (
        <div className={`absolute top-2 left-1/2 z-[80] -translate-x-1/2 rounded-lg border px-3 py-2 shadow-lg flex items-center gap-3 text-sm ${
          bridgeConnection === 'online'
            ? 'border-cyan-300 bg-cyan-50 text-cyan-950'
            : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}>
          {bridgeConnection === 'online' ? <Radio size={16} /> : <Unplug size={16} />}
          <span>
            <strong>Org-managed</strong>
            {bridgeConnection === 'online'
              ? ' · edit content in Emacs'
              : ' · Emacs offline; showing the last accepted snapshot'}
          </span>
          <button
            type="button"
            onClick={handleResync}
            disabled={bridgeConnection !== 'online' || isResyncing}
            className="rounded px-2 py-1 hover:bg-black/5 disabled:opacity-40"
            title="Request a complete snapshot now"
          >
            <RefreshCw size={14} className={isResyncing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={handleDetach}
            className="rounded px-2 py-1 hover:bg-black/5"
            title="Detach notebook"
          >
            <Unlink size={14} />
          </button>
        </div>
      )}
      <KnowledgeGraph
        graphData={graphData}
        subjectMatterId={id}
        onBack={handleBack}
        onPositionUpdate={handlePositionUpdate}
        isContentManaged={!!liveBinding}
        livePresenceCode={livePresenceCode}
      />
    </div>
  );
}
