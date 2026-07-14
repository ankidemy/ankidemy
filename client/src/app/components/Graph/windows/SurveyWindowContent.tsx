// client/src/app/components/Graph/windows/SurveyWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { showToast } from '@/app/components/core/ToastNotification';
import {
  SurveyQueueItem,
  getDomainRelations,
  getSurveyQueue,
  postSurveyEvent,
  getQuest,
  MetaQuestDTO,
  SurveyEventRequest,
} from '@/lib/api';
import { GraphData } from '../utils/types';

interface SurveyWindowContentProps {
  domainId: number;
  graphData?: GraphData;
  onNavigateToNode?: (nodeCode: string) => void;
  onQuestUpdated?: (updated: MetaQuestDTO) => void;
  onStatsUpdated?: (count: number) => void;
}

const snoozeForMinutes = (minutes: number) => {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
};

export const SurveyWindowContent: React.FC<SurveyWindowContentProps> = ({
  domainId,
  graphData,
  onNavigateToNode,
  onQuestUpdated,
  onStatsUpdated,
}) => {
  const [queue, setQueue] = useState<SurveyQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState<Record<number, number>>({});
  const [relevantOverrides, setRelevantOverrides] = useState<Record<number, SurveyQueueItem['relevantNodes']>>({});

  const codeLookup = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(graphData?.definitions || {}).forEach(def => {
      if (def.id) map.set(`definition:${def.id}`, def.code);
    });
    Object.values(graphData?.exercises || {}).forEach(ex => {
      if (ex.id) map.set(`exercise:${ex.id}`, ex.code);
    });
    Object.values(graphData?.sources || {}).forEach(src => {
      if (src.id) map.set(`source:${src.id}`, src.code);
    });
    Object.values(graphData?.quests || {}).forEach(q => {
      if (q.id) map.set(`meta_quest:${q.id}`, q.code);
    });
    return map;
  }, [graphData]);

  const refreshQueue = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getSurveyQueue(domainId);
      setQueue(items);
      const selection: Record<number, number> = {};
      items.forEach(item => {
        selection[item.questId] = item.selectedVersionId;
      });
      setSelectedVersions(selection);
      setRelevantOverrides({});
      onStatsUpdated?.(items.length);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load survey queue.', 'error');
    } finally {
      setLoading(false);
    }
  }, [domainId, onStatsUpdated]);

  const loadRelevantForVersion = useCallback(async (questId: number, versionId: number) => {
    if (!versionId || codeLookup.size === 0) return;
    try {
      const relations = await getDomainRelations(domainId);
      const filtered = relations.filter(rel =>
        rel.fromType === 'meta_quest' &&
        rel.fromId === questId &&
        (rel.contextKey || '') === `quest_version:${versionId}`
      );
      const mapped = filtered
        .map(rel => {
          const code = codeLookup.get(`${rel.toType}:${rel.toId}`);
          if (!code) return null;
          return {
            nodeType: rel.toType,
            nodeId: rel.toId,
            code,
          };
        })
        .filter((item): item is NonNullable<typeof item> => !!item);
      setRelevantOverrides(prev => ({ ...prev, [questId]: mapped }));
    } catch (err) {
      console.warn('Failed to refresh relevant nodes:', err);
    }
  }, [domainId, codeLookup]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const handleEvent = useCallback(async (item: SurveyQueueItem, eventType: SurveyEventRequest['eventType'], payload?: any) => {
    const questVersionId = selectedVersions[item.questId] || item.selectedVersionId;
    try {
      await postSurveyEvent({
        metaQuestId: item.questId,
        eventType,
        questVersionId,
        payload,
      });
      const updated = await getQuest(item.questId);
      onQuestUpdated?.(updated);
      await refreshQueue();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record event.', 'error');
    }
  }, [selectedVersions, refreshQueue, onQuestUpdated]);

  const handleSwapVersion = useCallback(async (item: SurveyQueueItem, versionId: number) => {
    setSelectedVersions(prev => ({ ...prev, [item.questId]: versionId }));
    loadRelevantForVersion(item.questId, versionId);
    try {
      await postSurveyEvent({
        metaQuestId: item.questId,
        eventType: 'version_swapped',
        questVersionId: versionId,
        payload: { swapToVersionId: versionId },
      });
    } catch (err) {
      console.warn('Failed to log version swap:', err);
    }
  }, [loadRelevantForVersion]);

  const queueCountLabel = useMemo(() => {
    if (loading) return 'Loading…';
    return `${queue.length} due`;
  }, [loading, queue.length]);

  return (
    <div className="flex flex-col gap-4 text-sm p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">Survey Queue</div>
          <div className="text-xs text-gray-500">{queueCountLabel}</div>
        </div>
        <Button size="sm" variant="outline" onClick={refreshQueue} disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="text-xs text-gray-500">Loading queue…</div>
      )}

      {!loading && queue.length === 0 && (
        <div className="text-xs text-gray-500">No quests due right now.</div>
      )}

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {queue.map(item => {
          const selectedVersionId = selectedVersions[item.questId] || item.selectedVersionId;
          const selectedVersion = item.versions.find(v => v.id === selectedVersionId) || item.versions[0];
          const relevantNodes = relevantOverrides[item.questId] ?? item.relevantNodes;
          return (
            <div key={item.questId} className="rounded-md border border-gray-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-900">
                  {selectedVersion?.title || item.questName || item.questCode}
                </div>
                <span className={`kg-font-tag text-[10px] uppercase px-2 py-0.5 rounded ${
                  item.questKind === 'habit'
                    ? 'bg-emerald-100 text-emerald-700'
                    : item.questKind === 'daily'
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {item.questKind}
                </span>
              </div>

              {selectedVersion?.descriptionMd && (
                <MarkdownKatex className="text-xs whitespace-pre-wrap bg-gray-50 border rounded-md p-2">
                  {selectedVersion.descriptionMd}
                </MarkdownKatex>
              )}

              <div className="flex items-center flex-wrap gap-2 text-xs text-gray-500">
                {item.nextDueAt && (
                  <span>{item.isOverdue ? 'Overdue' : 'Due'}: {new Date(item.nextDueAt).toLocaleString()}</span>
                )}
                {item.visibility && (
                  <span className="kg-font-tag uppercase text-[10px] bg-gray-100 px-2 py-0.5 rounded">{item.visibility}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600">Version</label>
                <select
                  value={selectedVersionId}
                  onChange={(e) => handleSwapVersion(item, Number(e.target.value))}
                  className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
                >
                  {item.versions.map(v => (
                    <option key={v.id} value={v.id}>{v.title || `Version ${v.id}`}</option>
                  ))}
                </select>
              </div>

              {relevantNodes && relevantNodes.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-gray-600">Relevant nodes</div>
                  <div className="flex flex-wrap gap-2">
                    {relevantNodes.map(node => (
                      <Button
                        key={`${node.nodeType}-${node.nodeId}`}
                        size="sm"
                        variant="outline"
                        onClick={() => node.code && onNavigateToNode?.(node.code)}
                      >
                        {node.code || `${node.nodeType}:${node.nodeId}`}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" onClick={() => handleEvent(item, 'completed')}>
                  Complete
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEvent(item, 'skipped')}>
                  Skip
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEvent(item, 'snoozed', { snoozedUntil: snoozeForMinutes(120) })}>
                  Snooze 2h
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEvent(item, 'snoozed', { snoozedUntil: snoozeForMinutes(24 * 60) })}>
                  Snooze 1d
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleEvent(item, 'deactivated')}>
                  Deactivate
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SurveyWindowContent;
