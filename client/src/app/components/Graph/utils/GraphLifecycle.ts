// client/src/app/components/Graph/utils/GraphLifecycle.ts
// A tiny, event-driven lifecycle controller to replace scattered useEffect logic.

import type { GraphNode } from './types';

export type GraphLifecycleDeps = {
  loadDomain: (domainId: number) => Promise<void>;
  checkEnrollmentAndInit: (domainId: number) => Promise<void>;
  setIsProcessingData: (value: boolean) => void;
  srs: { clearError?: () => void };
  getPendingFocusNodeId: () => string | null;
  clearPendingFocusNodeId: () => void;
  focusNodeById: (nodeId: string) => void;
};

export type GraphLifecycleSnapshot = {
  subjectMatterId: string;
  stableGraphNodes: GraphNode[];
  isProcessingData: boolean;
  enhancedCreditFlowAnimationsLength: number;
  isEnrolled: boolean | null;
};

export class GraphLifecycle {
  private lastDomainId: number | null = null;
  private enrollmentCheckedFor: number | null = null;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scheduled: Map<string, boolean> = new Map();

  constructor(private deps: GraphLifecycleDeps) {}

  tick(snapshot: GraphLifecycleSnapshot) {
    const domainIdNum = parseInt(snapshot.subjectMatterId, 10);

    if (!Number.isNaN(domainIdNum)) {
      if (this.lastDomainId !== domainIdNum) {
        this.lastDomainId = domainIdNum;
        this.enrollmentCheckedFor = null;
        // Defer to after paint to avoid setState during render
        if (!this.scheduled.get('loadDomain')) {
          this.scheduled.set('loadDomain', true);
          setTimeout(() => {
            this.scheduled.delete('loadDomain');
            void this.deps.loadDomain(domainIdNum);
          }, 0);
        }
      }

      if (this.enrollmentCheckedFor !== domainIdNum) {
        this.enrollmentCheckedFor = domainIdNum;
        if (!this.scheduled.get('checkEnroll')) {
          this.scheduled.set('checkEnroll', true);
          setTimeout(() => {
            this.scheduled.delete('checkEnroll');
            void this.deps.checkEnrollmentAndInit(domainIdNum);
          }, 0);
        }
      }
    }

    // Mark initial processing complete when nodes are available
    if (snapshot.isProcessingData && snapshot.stableGraphNodes.length > 0 && !this.timers.has('processing')) {
      const t = setTimeout(() => {
        this.deps.setIsProcessingData(false);
        this.timers.delete('processing');
      }, 100);
      this.timers.set('processing', t);
    }

    // Focus newly created node when it materializes in the stable graph
    const pendingId = this.deps.getPendingFocusNodeId();
    if (pendingId) {
      const exists = snapshot.stableGraphNodes.some(n => n.id === pendingId);
      if (exists) {
        // Defer UI open to avoid updating UIProvider during render
        setTimeout(() => {
          this.deps.focusNodeById(pendingId);
          this.deps.clearPendingFocusNodeId();
        }, 0);
      }
    }

    // Clear credit-flow animations after a grace period
    if (snapshot.enhancedCreditFlowAnimationsLength > 0) {
      const existing = this.timers.get('creditClear');
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        try { this.deps.srs.clearError && this.deps.srs.clearError(); } catch {}
        this.timers.delete('creditClear');
      }, 5000);
      this.timers.set('creditClear', t);
    }
  }

  dispose() {
    for (const [, t] of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
