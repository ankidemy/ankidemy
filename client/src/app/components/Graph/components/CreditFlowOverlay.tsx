// File: ./src/app/components/Graph/components/CreditFlowOverlay.tsx
// src/app/components/Graph/components/CreditFlowOverlay.tsx

"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { CreditFlowAnimation } from '@/types/srs';

interface CreditFlowOverlayProps {
  animations: CreditFlowAnimation[];
  nodePositions: Map<string, { x: number; y: number }>;
  graphRef: React.RefObject<any>;
}

interface OverlayParticle {
  id: string;
  x: number;
  y: number;
  credit: number;
  type: CreditFlowAnimation['type'];
  startTime: number;
}

class OverlayLifecycle {
  private processed = new Set<string>();
  private counter = 0;
  private lastCommit: number | null = null;

  constructor(private commit: (particles: OverlayParticle[]) => void) {}

  private uid() {
    return `particle-${Date.now()}-${this.counter++}-${Math.random().toString(36).slice(2, 9)}`;
  }

  pump(
    newAnimations: CreditFlowAnimation[],
    toScreen: (nodeId: string) => { x: number; y: number } | null,
    existing: OverlayParticle[]
  ) {
    if (!newAnimations || newAnimations.length === 0) return;

    const additions: OverlayParticle[] = [];

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
      const now = Date.now();
      const pruned = existing.filter((particle) => now - particle.startTime < 2000);
      const merged = pruned.concat(additions);

      // Defer commit to after paint; avoid setting state during render.
      if (this.lastCommit !== now) {
        this.lastCommit = now;
        setTimeout(() => this.commit(merged), 0);
      }
    }

    if (this.processed.size > 2000) {
      const cutoff = Date.now() - 10000;
      for (const key of Array.from(this.processed)) {
        const parts = key.split('-');
        const ts = parseInt(parts[1]);
        if (!isNaN(ts) && ts < cutoff) {
          this.processed.delete(key);
        }
      }
    }
  }
}

const CreditFlowOverlay: React.FC<CreditFlowOverlayProps> = ({ animations, nodePositions, graphRef }) => {
  const [activeParticles, setActiveParticles] = useState<OverlayParticle[]>([]);

  const lifecycle = useMemo(() => {
    return new OverlayLifecycle((particles) => setActiveParticles(particles));
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const toScreen = (nodeId: string) => {
      const pos = nodePositions.get(nodeId);
      if (!pos) return null;
      try {
        return graph.graph2ScreenCoords(pos.x, pos.y);
      } catch {
        return null;
      }
    };

    lifecycle.pump(animations, toScreen, activeParticles);
  }, [activeParticles, animations, graphRef, lifecycle, nodePositions]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      <style jsx>{`
        @keyframes credit-flow-fade {
          0% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-50px) scale(0.3);
          }
        }
      `}</style>
      {activeParticles.map((particle) => {
        return (
          <div
            key={particle.id}
            className="absolute text-xs font-bold px-1 py-0.5 rounded-full shadow-lg transition-opacity duration-100"
            style={{
              left: `${particle.x - 10}px`,
              top: `${particle.y - 20}px`,
              color: 'white',
              backgroundColor: particle.type === 'positive' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)',
              animation: 'credit-flow-fade 1.5s linear forwards',
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
