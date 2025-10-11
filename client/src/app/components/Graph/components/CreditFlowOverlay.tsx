// File: ./src/app/components/Graph/components/CreditFlowOverlay.tsx
// src/app/components/Graph/components/CreditFlowOverlay.tsx

"use client";

import React, { useState, useRef } from 'react';
import { CreditFlowAnimation } from '@/types/srs';

interface CreditFlowOverlayProps {
  animations: CreditFlowAnimation[];
  nodePositions: Map<string, { x: number; y: number }>; 
  graphRef: React.RefObject<any>; 
}

const CreditFlowOverlay: React.FC<CreditFlowOverlayProps> = ({ animations, nodePositions, graphRef }) => {
  const [activeParticles, setActiveParticles] = useState<any[]>([]);

  // Internal lifecycle without useEffect
  class OverlayLifecycle {
    private processed = new Set<string>();
    private counter = 0;
    private lastCommit: number | null = null;

    constructor(private commit: (particles: any[]) => void) {}

    private uid() {
      return `particle-${Date.now()}-${this.counter++}-${Math.random().toString(36).slice(2, 9)}`;
    }

    pump(newAnimations: CreditFlowAnimation[], toScreen: (nodeId: string) => { x: number; y: number } | null, existing: any[]) {
      if (!newAnimations || newAnimations.length === 0) return;

      const additions: any[] = [];
      for (const anim of newAnimations) {
        const key = `${anim.nodeId}-${anim.timestamp}-${anim.credit}-${anim.type}`;
        if (this.processed.has(key)) continue;
        const pt = toScreen(anim.nodeId);
        if (!pt) continue;
        this.processed.add(key);
        additions.push({
          id: this.uid(),
          x: pt.x,
          y: pt.y,
          credit: anim.credit,
          type: anim.type,
          startTime: Date.now(),
        });
      }

      if (additions.length > 0) {
        // Prune very old particles to avoid unbounded growth
        const now = Date.now();
        const pruned = existing.filter(p => now - p.startTime < 2000);
        const merged = pruned.concat(additions);
        // Defer commit to after paint; avoid setting state during render
        if (this.lastCommit !== now) {
          this.lastCommit = now;
          setTimeout(() => this.commit(merged), 0);
        }
      }

      // Periodically forget very old processed keys
      if (this.processed.size > 2000) {
        const cutoff = Date.now() - 10000;
        for (const key of Array.from(this.processed)) {
          const parts = key.split('-');
          const ts = parseInt(parts[1]);
          if (!isNaN(ts) && ts < cutoff) this.processed.delete(key);
        }
      }
    }
  }

  const lifecycleRef = useRef<OverlayLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new OverlayLifecycle((particles) => setActiveParticles(particles));
  }

  // Drive lifecycle each render; dedup/commit happens internally
  if (graphRef.current) {
    const toScreen = (nodeId: string) => {
      const pos = nodePositions.get(nodeId);
      if (!pos) return null;
      try { return graphRef.current.graph2ScreenCoords(pos.x, pos.y); } catch { return null; }
    };
    lifecycleRef.current.pump(animations, toScreen, activeParticles);
  }

  if (!graphRef.current) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {activeParticles.map(particle => {
        const age = Date.now() - particle.startTime;
        const opacity = Math.max(0, 1 - (age / 1500));
        const scale = Math.max(0.3, 1 - (age / 3000));
        const translateY = -(age / 30);

        return (
          <div
            key={particle.id} // Now guaranteed to be unique
            className="absolute text-xs font-bold px-1 py-0.5 rounded-full shadow-lg transition-opacity duration-100"
            style={{
              left: `${particle.x - 10}px`,
              top: `${particle.y - 20}px`,
              color: 'white',
              backgroundColor: particle.type === 'positive' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
              opacity: opacity,
              transform: `translateY(${translateY}px) scale(${scale})`,
              pointerEvents: 'none',
            }}
          >
            {particle.credit > 0 ? `+${particle.credit.toFixed(1)}` : particle.credit.toFixed(1)}
          </div>
        );
      })}
    </div>
  );
};

export default CreditFlowOverlay;
