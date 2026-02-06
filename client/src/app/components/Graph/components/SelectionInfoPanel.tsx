import React from 'react';

import type { GraphNode } from '../utils/types';

type InfoFilter = 'general' | 'versions' | 'links' | 'groups' | 'status';

type ToolboxButtonOptions = {
  variant?: 'outline' | 'secondary' | 'ghost' | 'destructive';
  enabled?: boolean;
  onClick?: () => void;
};

type SelectionInfoPanelProps = {
  selectedNodeIds: Set<string>;
  stableNodes: GraphNode[];
  expandedInfoNodes: Set<string>;
  onToggleNodeExpanded: (nodeId: string) => void;
  showAllInfoFields: boolean;
  infoFilterSet: Set<InfoFilter>;
  onToggleInfoFilter: (filter: InfoFilter) => void;
  incomingAdjacency: Map<string, Set<string>>;
  outgoingAdjacency: Map<string, Set<string>>;
  nodeGroupsByCode: Map<string, string[]>;
  nodeDataCache: Map<string, unknown>;
  infoVersionCounts: Map<string, number>;
  toolboxButton: (label: string, icon: React.ReactNode, options?: ToolboxButtonOptions) => React.ReactNode;
};

const SelectionInfoPanel: React.FC<SelectionInfoPanelProps> = ({
  selectedNodeIds,
  stableNodes,
  expandedInfoNodes,
  onToggleNodeExpanded,
  showAllInfoFields,
  infoFilterSet,
  onToggleInfoFilter,
  incomingAdjacency,
  outgoingAdjacency,
  nodeGroupsByCode,
  nodeDataCache,
  infoVersionCounts,
  toolboxButton,
}) => {
  const shouldShow = (filter: InfoFilter) => showAllInfoFields || infoFilterSet.has(filter);
  const selectedIds = Array.from(selectedNodeIds);
  const nodeMap = new Map(stableNodes.map(node => [node.id, node]));

  const filterButton = (label: string, filter: InfoFilter) => (
    toolboxButton(label, null, {
      onClick: () => onToggleInfoFilter(filter),
      variant: infoFilterSet.has(filter) ? 'secondary' : 'outline',
    })
  );

  const formatList = (items: string[]) => (items.length > 0 ? items.join(', ') : 'None');

  return (
    <div className="w-48">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-center gap-0.5">
          {filterButton('G', 'general')}
          {filterButton('V', 'versions')}
          {filterButton('L', 'links')}
          {filterButton('GR', 'groups')}
          {filterButton('S', 'status')}
        </div>

        {selectedIds.length === 0 && (
          <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-left text-[9px] text-gray-500">
            No nodes selected.
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="max-h-36 space-y-1 overflow-auto pr-0.5">
            {selectedIds.map(nodeId => {
              const node = nodeMap.get(nodeId);
              if (!node) return null;

              const isExpanded = expandedInfoNodes.has(nodeId);
              const groups = nodeGroupsByCode.get(nodeId) ?? [];
              const incoming = Array.from(incomingAdjacency.get(nodeId) ?? []);
              const outgoing = Array.from(outgoingAdjacency.get(nodeId) ?? []);

              const cached = nodeDataCache.get(nodeId) as { versionCount?: number; versions?: unknown[] } | undefined;
              const cachedCount = typeof cached?.versionCount === 'number'
                ? cached.versionCount
                : (Array.isArray(cached?.versions) ? cached.versions.length : undefined);
              const rawVersionCount = infoVersionCounts.get(nodeId) ?? cachedCount;

              const versionCount = (node.type === 'definition' || node.type === 'exercise')
                ? (typeof rawVersionCount === 'number' && rawVersionCount > 0 ? rawVersionCount : undefined)
                : rawVersionCount;

              const statusValue = node.progress?.status ?? node.status;
              const versionLabel = (node.type === 'definition' || node.type === 'exercise')
                ? (typeof versionCount === 'number' ? versionCount : '...')
                : (typeof versionCount === 'number' ? versionCount : 'n/a');

              return (
                <div key={nodeId} className="rounded border border-gray-100 bg-white px-1 py-1 text-[9px] text-gray-600">
                  <button
                    type="button"
                    onClick={() => onToggleNodeExpanded(nodeId)}
                    className="flex w-full items-center justify-between gap-1 text-left text-[9px] font-semibold text-gray-700"
                  >
                    <span className="truncate">{node.name}</span>
                    <span className="text-[8px] font-semibold text-gray-400">{isExpanded ? 'v' : '>'}</span>
                  </button>
                  <div className="text-[8px] text-gray-400">{node.id}</div>
                  {isExpanded && (
                    <div className="mt-1 space-y-0.5">
                      {shouldShow('general') && (
                        <div>
                          <div>Type: {node.type}</div>
                          <div>Code: {node.id}</div>
                          <div>Name: {node.name}</div>
                        </div>
                      )}
                      {shouldShow('versions') && (
                        <div>
                          Versions: {versionLabel}
                        </div>
                      )}
                      {shouldShow('links') && (
                        <div>
                          <div>Parents ({incoming.length}): {formatList(incoming)}</div>
                          <div>Children ({outgoing.length}): {formatList(outgoing)}</div>
                        </div>
                      )}
                      {shouldShow('groups') && (
                        <div>
                          Groups ({groups.length}): {formatList(groups)}
                        </div>
                      )}
                      {shouldShow('status') && (
                        <div>
                          Status: {statusValue ?? 'n/a'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectionInfoPanel;
