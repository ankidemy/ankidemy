// client/src/app/components/Graph/utils/PositionManager.ts
// Utility class for managing node positions with stability tracking

import { GraphNode } from './types';

interface SavedPosition {
  x: number;
  y: number;
  isFixed: boolean;
  timestamp: number;
}

export class PositionManager {
  private savedPositions = new Map<string, SavedPosition>();
  private isStable = false;
  private lastStabilityChange = 0;

  /**
   * Extract positions from current nodes and save them
   */
  extractPositions(nodes: GraphNode[]): void {
    const now = Date.now();
    nodes.forEach(node => {
      if (node?.id && typeof node.x === 'number' && typeof node.y === 'number') {
        this.savedPositions.set(node.id, {
          x: node.x,
          y: node.y,
          isFixed: !!(node.fx !== undefined && node.fy !== undefined),
          timestamp: now
        });
      }
    });
    console.log(`Extracted ${this.savedPositions.size} node positions`);
  }

  /**
   * Apply saved positions to nodes
   */
  applyPositions(nodes: GraphNode[]): void {
    let appliedCount = 0;
    nodes.forEach(node => {
      const saved = this.savedPositions.get(node.id);
      if (saved) {
        // Apply position
        node.x = saved.x;
        node.y = saved.y;
        
        // Apply fixed constraints if they were fixed before
        if (saved.isFixed) {
          node.fx = saved.x;
          node.fy = saved.y;
        }
        
        appliedCount++;
      } else {
        // Use database position if available
        if (node.xPosition !== undefined && node.yPosition !== undefined) {
          node.x = node.xPosition;
          node.y = node.yPosition;
          node.fx = node.xPosition;
          node.fy = node.yPosition;
        }
      }
    });
    
    if (appliedCount > 0) {
      console.log(`Applied ${appliedCount} saved positions to nodes`);
    }
  }

  /**
   * Fix a node at a specific position
   */
  fixPosition(nodeId: string, x: number, y: number): void {
    this.savedPositions.set(nodeId, {
      x,
      y,
      isFixed: true,
      timestamp: Date.now()
    });
  }

  /**
   * Get all saved positions
   */
  getAllPositions(): Map<string, { x: number; y: number }> {
    const positions = new Map<string, { x: number; y: number }>();
    this.savedPositions.forEach((saved, nodeId) => {
      positions.set(nodeId, { x: saved.x, y: saved.y });
    });
    return positions;
  }

  /**
   * Mark simulation as unstable (structure changed)
   */
  markUnstable(): void {
    if (this.isStable) {
      this.isStable = false;
      this.lastStabilityChange = Date.now();
      console.log('Graph marked as unstable - physics will reset');
    }
  }

  /**
   * Mark simulation as stable (physics settled)
   */
  markStable(): void {
    if (!this.isStable) {
      this.isStable = true;
      this.lastStabilityChange = Date.now();
      console.log('Graph marked as stable');
    }
  }

  /**
   * Check if the simulation is currently stable
   */
  isSimulationStable(): boolean {
    return this.isStable;
  }

  /**
   * Get the timestamp of the last stability change
   */
  getLastStabilityChange(): number {
    return this.lastStabilityChange;
  }

  /**
   * Clear all saved positions
   */
  clearPositions(): void {
    this.savedPositions.clear();
    console.log('Cleared all saved positions');
  }

  /**
   * Remove position for a specific node
   */
  removePosition(nodeId: string): boolean {
    return this.savedPositions.delete(nodeId);
  }

  /**
   * Check if position exists for a node
   */
  hasPosition(nodeId: string): boolean {
    return this.savedPositions.has(nodeId);
  }

  /**
   * Get position for a specific node
   */
  getPosition(nodeId: string): { x: number; y: number } | null {
    const saved = this.savedPositions.get(nodeId);
    return saved ? { x: saved.x, y: saved.y } : null;
  }

  /**
   * Update position without fixing it
   */
  updatePosition(nodeId: string, x: number, y: number): void {
    const existing = this.savedPositions.get(nodeId);
    this.savedPositions.set(nodeId, {
      x,
      y,
      isFixed: existing?.isFixed ?? false,
      timestamp: Date.now()
    });
  }

  /**
   * Get statistics about saved positions
   */
  getStats(): { total: number; fixed: number; recent: number } {
    const now = Date.now();
    const recentThreshold = 5000; // 5 seconds
    
    let total = 0;
    let fixed = 0;
    let recent = 0;

    this.savedPositions.forEach(saved => {
      total++;
      if (saved.isFixed) fixed++;
      if (now - saved.timestamp < recentThreshold) recent++;
    });

    return { total, fixed, recent };
  }
}
