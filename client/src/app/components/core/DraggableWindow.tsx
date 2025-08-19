// client/src/app/components/core/DraggableWindow.tsx
"use client";

import React, { useState, useRef, useEffect } from 'react';
import { X, Minus, Maximize2 } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface DraggableWindowProps {
  id: string;
  title: React.ReactNode;
  children: React.ReactNode;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  onClose: () => void;
  onFocus: () => void;
  zIndex: number;
  isMinimized?: boolean;
  onMinimize?: () => void;
  className?: string;
}

export const DraggableWindow: React.FC<DraggableWindowProps> = ({
  id,
  title,
  children,
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 400, height: 500 },
  minWidth = 300,
  minHeight = 200,
  maxWidth,
  maxHeight,
  onClose,
  onFocus,
  zIndex,
  isMinimized = false,
  onMinimize,
  className
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<string>('');
  
  const windowRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  // FIX: Store initial position and size when resize starts
  const resizeStartPos = useRef({ 
    x: 0, 
    y: 0, 
    width: 0, 
    height: 0,
    initialX: 0,  // Add initial window position
    initialY: 0   // Add initial window position
  });

  // Ensure window stays within viewport
  useEffect(() => {
    const constrainPosition = () => {
      if (!windowRef.current) return;
      
      const rect = windowRef.current.getBoundingClientRect();
      const newPos = { ...position };
      
      // Keep header visible
      if (rect.top < 0) newPos.y = 0;
      if (rect.left < -rect.width + 100) newPos.x = -rect.width + 100;
      if (rect.right > window.innerWidth + rect.width - 100) {
        newPos.x = window.innerWidth - 100;
      }
      if (rect.bottom > window.innerHeight) {
        newPos.y = window.innerHeight - rect.height;
      }
      
      if (newPos.x !== position.x || newPos.y !== position.y) {
        setPosition(newPos);
      }
    };

    constrainPosition();
    window.addEventListener('resize', constrainPosition);
    return () => window.removeEventListener('resize', constrainPosition);
  }, [position]);

  // Drag handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.window-controls')) return;
    
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    onFocus();
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    } else if (isResizing) {
      const deltaX = e.clientX - resizeStartPos.current.x;
      const deltaY = e.clientY - resizeStartPos.current.y;
      
      let newWidth = resizeStartPos.current.width;
      let newHeight = resizeStartPos.current.height;
      // FIX: Use initial position instead of current position
      let newX = resizeStartPos.current.initialX;
      let newY = resizeStartPos.current.initialY;

      if (resizeDirection.includes('right')) {
        newWidth = Math.max(minWidth, resizeStartPos.current.width + deltaX);
        if (maxWidth) newWidth = Math.min(maxWidth, newWidth);
      }
      if (resizeDirection.includes('left')) {
        newWidth = Math.max(minWidth, resizeStartPos.current.width - deltaX);
        if (maxWidth) newWidth = Math.min(maxWidth, newWidth);
        // FIX: Calculate position based on initial position and size change
        newX = resizeStartPos.current.initialX + (resizeStartPos.current.width - newWidth);
      }
      if (resizeDirection.includes('bottom')) {
        newHeight = Math.max(minHeight, resizeStartPos.current.height + deltaY);
        if (maxHeight) newHeight = Math.min(maxHeight, newHeight);
      }
      if (resizeDirection.includes('top')) {
        newHeight = Math.max(minHeight, resizeStartPos.current.height - deltaY);
        if (maxHeight) newHeight = Math.min(maxHeight, newHeight);
        // FIX: Calculate position based on initial position and size change
        newY = resizeStartPos.current.initialY + (resizeStartPos.current.height - newHeight);
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection('');
  };

  const startResize = (direction: string) => (e: React.MouseEvent) => {
    setIsResizing(true);
    setResizeDirection(direction);
    // FIX: Store both mouse position, size, AND window position when resize starts
    resizeStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      initialX: position.x,  // Store initial window position
      initialY: position.y   // Store initial window position
    };
    onFocus();
    e.preventDefault();
    e.stopPropagation();
  };

  // Global mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, position, size, resizeDirection, minWidth, minHeight, maxWidth, maxHeight]);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && zIndex === Math.max(...Array.from(document.querySelectorAll('[data-window-id]')).map(el => 
        parseInt(window.getComputedStyle(el).zIndex) || 0
      ))) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [zIndex, onClose]);

  if (isMinimized) {
    return (
      <div
        ref={windowRef}
        data-window-id={id}
        className="fixed bg-white border border-gray-300 rounded-t-md shadow-lg overflow-hidden"
        style={{
          left: position.x,
          bottom: 0,
          width: 200,
          zIndex,
          cursor: 'pointer'
        }}
        onClick={onMinimize}
      >
        <div className="bg-gray-100 px-3 py-1 flex items-center justify-between">
          <span className="text-sm font-medium truncate">{title}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={windowRef}
      data-window-id={id}
      className={cn(
        "fixed bg-white border border-gray-300 rounded-lg shadow-2xl overflow-hidden flex flex-col",
        isDragging && "cursor-move",
        className
      )}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex
      }}
      onMouseDown={() => onFocus()}
    >
      {/* Header */}
      <div
        className="bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-2 flex items-center justify-between cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <h3 className="text-sm font-semibold text-gray-700 truncate flex-1">{title}</h3>
        <div className="window-controls flex items-center gap-1 ml-2">
          {onMinimize && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 p-0 hover:bg-gray-200"
              onClick={onMinimize}
            >
              <Minus size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0 hover:bg-gray-200"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* Resize handles */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Edges */}
        <div className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize pointer-events-auto" onMouseDown={startResize('top')} />
        <div className="absolute bottom-0 left-0 right-0 h-1 cursor-ns-resize pointer-events-auto" onMouseDown={startResize('bottom')} />
        <div className="absolute top-0 bottom-0 left-0 w-1 cursor-ew-resize pointer-events-auto" onMouseDown={startResize('left')} />
        <div className="absolute top-0 bottom-0 right-0 w-1 cursor-ew-resize pointer-events-auto" onMouseDown={startResize('right')} />
        
        {/* Corners */}
        <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize pointer-events-auto" onMouseDown={startResize('top-left')} />
        <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize pointer-events-auto" onMouseDown={startResize('top-right')} />
        <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize pointer-events-auto" onMouseDown={startResize('bottom-left')} />
        <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize pointer-events-auto" onMouseDown={startResize('bottom-right')} />
      </div>
    </div>
  );
};
