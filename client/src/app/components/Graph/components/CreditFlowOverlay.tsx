// File: ./src/app/components/Graph/components/CreditFlowOverlay.tsx
// src/app/components/Graph/components/CreditFlowOverlay.tsx

"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CreditFlowAnimation } from '@/types/srs';

interface CreditFlowOverlayProps {
  animations: CreditFlowAnimation[];
  nodePositions: Map<string, { x: number; y: number }>; 
  graphRef: React.RefObject<any>; 
}

const CreditFlowOverlay: React.FC<CreditFlowOverlayProps> = ({ animations, nodePositions, graphRef }) => {
  const [activeParticles, setActiveParticles] = useState<any[]>([]);
  
  // FIX: Use a more robust counter system
  const particleCounterRef = useRef(0);
  const processedAnimationsRef = useRef(new Set<string>());

  const generateUniqueParticleId = useCallback(() => {
    return `particle-${Date.now()}-${particleCounterRef.current++}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  const createParticlesFromAnimations = useCallback((newAnimations: CreditFlowAnimation[]) => {
    if (!graphRef.current || newAnimations.length === 0) return;

    const newParticles = newAnimations
      .filter(anim => {
        const animKey = `${anim.nodeId}-${anim.timestamp}-${anim.credit}-${anim.type}`;
        if (processedAnimationsRef.current.has(animKey)) {
          console.debug('Skipping duplicate animation:', animKey);
          return false;
        }
        processedAnimationsRef.current.add(animKey);
        return true;
      })
      .map(anim => {
        const nodePos = nodePositions.get(anim.nodeId);
        if (!nodePos) {
          console.warn(`No position for node ${anim.nodeId}`);
          return null;
        }
        const screenPos = graphRef.current.graph2ScreenCoords(nodePos.x, nodePos.y);
        return {
          id: generateUniqueParticleId(),
          x: screenPos.x,
          y: screenPos.y,
          credit: anim.credit,
          type: anim.type,
          startTime: Date.now(),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (newParticles.length > 0) {
      setActiveParticles(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const filtered = newParticles.filter(p => !existingIds.has(p.id));
        return [...prev, ...filtered];
      });

      // Cleanup old animation keys
      const cutoffTime = Date.now() - 10000;
      Array.from(processedAnimationsRef.current).forEach(key => {
        const parts = key.split('-');
        const timestamp = parseInt(parts[1]);
        if (!isNaN(timestamp) && timestamp < cutoffTime) {
          processedAnimationsRef.current.delete(key);
        }
      });
    }
  }, [nodePositions, graphRef, generateUniqueParticleId]);

  useEffect(() => {
    if (animations.length > 0) {
      createParticlesFromAnimations(animations);
    }
  }, [animations, createParticlesFromAnimations]);

  useEffect(() => {
    return () => {
      processedAnimationsRef.current.clear();
      particleCounterRef.current = 0;
    };
  }, []);

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
