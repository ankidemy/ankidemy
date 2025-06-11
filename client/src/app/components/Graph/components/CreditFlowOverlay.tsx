// File: ./src/app/components/Graph/components/CreditFlowOverlay.tsx
// src/app/components/Graph/components/CreditFlowOverlay.tsx
"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CreditFlowAnimation } from '@/types/srs';

interface CreditFlowOverlayProps {
  animations: CreditFlowAnimation[];
  nodePositions: Map<string, { x: number; y: number }>; // Map node ID to its current {x, y} position
  graphRef: React.RefObject<any>; // Ref to the ForceGraph2D instance
}

const CreditFlowOverlay: React.FC<CreditFlowOverlayProps> = ({ animations, nodePositions, graphRef }) => {
  const [activeParticles, setActiveParticles] = useState<any[]>([]);
  
  // FIX: Use useRef instead of state for counter to avoid dependency issues
  const particleCounterRef = useRef(0);
  
  // FIX: Use useRef to track processed animations to prevent duplicates
  const processedAnimationsRef = useRef(new Set<string>());

  // FIX: Stable callback for creating particles
  const createParticlesFromAnimations = useCallback((newAnimations: CreditFlowAnimation[]) => {
    if (!graphRef.current || newAnimations.length === 0) return;

    const newParticles = newAnimations
      .filter(anim => {
        // Create a unique key for this animation
        const animKey = `${anim.nodeId}-${anim.timestamp}-${anim.credit}`;
        
        // Skip if already processed
        if (processedAnimationsRef.current.has(animKey)) {
          return false;
        }
        
        // Mark as processed
        processedAnimationsRef.current.add(animKey);
        return true;
      })
      .map((anim, index) => {
        const nodePos = nodePositions.get(anim.nodeId);
        if (!nodePos) {
          console.warn(`No position found for node ${anim.nodeId}`);
          return null;
        }

        const screenPos = graphRef.current.graph2ScreenCoords(nodePos.x, nodePos.y);
        
        // Create unique ID using counter + timestamp + index to prevent collisions
        const uniqueId = `${anim.nodeId}-${anim.timestamp}-${particleCounterRef.current + index}`;
        
        return {
          id: uniqueId,
          x: screenPos.x,
          y: screenPos.y,
          credit: anim.credit,
          type: anim.type,
          startTime: Date.now(),
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (newParticles.length > 0) {
      setActiveParticles(prev => [...prev, ...newParticles]);
      
      // Increment counter for next batch
      particleCounterRef.current += newParticles.length;
      
      // Clean up old processed animations (keep only recent ones to prevent memory leak)
      const cutoffTime = Date.now() - 10000; // 10 seconds
      const keysToDelete = Array.from(processedAnimationsRef.current).filter(key => {
        const timestamp = parseInt(key.split('-')[1]);
        return timestamp < cutoffTime;
      });
      keysToDelete.forEach(key => processedAnimationsRef.current.delete(key));
    }
  }, [nodePositions, graphRef]);

  // FIX: Process new animations with stable dependencies
  useEffect(() => {
    if (animations.length > 0) {
      createParticlesFromAnimations(animations);
    }
  }, [animations, createParticlesFromAnimations]);

  // FIX: Separate useEffect for particle animation with stable interval
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveParticles(prev => {
        const now = Date.now();
        return prev
          .filter(p => now - p.startTime < 1500) // Particle lifetime: 1.5 seconds
          .map(p => ({ ...p, y: p.y - 2 })); // Move particles upwards
      });
    }, 50); // Update every 50ms

    return () => clearInterval(timer);
  }, []); // Empty dependency array - this interval should run consistently

  // FIX: Cleanup effect for when component unmounts
  useEffect(() => {
    return () => {
      processedAnimationsRef.current.clear();
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
            key={particle.id}
            className="absolute text-xs font-bold px-1 py-0.5 rounded-full shadow-lg transition-opacity duration-100"
            style={{
              left: `${particle.x - 10}px`, // Center the particle horizontally
              top: `${particle.y - 20}px`,  // Start above the node
              color: 'white',
              backgroundColor: particle.type === 'positive' ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)', // Emerald-500 or Red-500
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
