import type { NodeStatus } from '@/types/srs';

export const SRS_NODE_STATUS_CHANGED_EVENT = 'ankidemy:srs-node-status-changed';

export interface SRSNodeStatusChangedDetail {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  status: NodeStatus;
}

export const dispatchSRSNodeStatusChanged = (detail: SRSNodeStatusChangedDetail): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SRSNodeStatusChangedDetail>(SRS_NODE_STATUS_CHANGED_EVENT, { detail }),
  );
};
