"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type ToolbarSection = {
  id: string;
  title: string;
  rows: React.ReactNode[][];
};

export type ToolbarLayout = {
  id: string;
  label: string;
  handleIcon?: React.ReactNode;
  sections: ToolbarSection[];
};

interface ContextToolbarProps {
  id: string;
  layouts: ToolbarLayout[];
  activeLayoutId: string;
  onLayoutChange?: (layoutId: string) => void;
  displayMode?: 'compact' | 'descriptive';
  onDisplayModeChange?: (mode: 'compact' | 'descriptive') => void;
  initialPosition?: { x: number; y: number };
  boundsRef?: React.RefObject<HTMLElement>;
  instructionText?: string;
  instructionContent?: React.ReactNode;
  className?: string;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const ContextToolbar: React.FC<ContextToolbarProps> = ({
  id,
  layouts,
  activeLayoutId,
  onLayoutChange,
  displayMode = 'compact',
  onDisplayModeChange,
  initialPosition = { x: 24, y: 24 },
  boundsRef,
  instructionText,
  instructionContent,
  className,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [swapKey, setSwapKey] = useState(0);
  const [showInstruction, setShowInstruction] = useState(!!instructionText);

  const layout = useMemo(
    () => layouts.find((entry) => entry.id === activeLayoutId) ?? layouts[0],
    [layouts, activeLayoutId]
  );
  const layoutToggleEntries = useMemo(() => {
    const entries = [...layouts];
    entries.sort((a, b) => {
      const order = (id: string) => (id === 'normal' ? 0 : id === 'edit' ? 1 : 2);
      return order(a.id) - order(b.id);
    });
    return entries;
  }, [layouts]);

  useEffect(() => {
    setSwapKey((prev) => prev + 1);
  }, [activeLayoutId]);

  const hasInstruction = !!instructionContent || !!instructionText;

  useEffect(() => {
    setShowInstruction(hasInstruction);
  }, [hasInstruction]);

  const getBoundsRect = useCallback(() => {
    if (boundsRef?.current) {
      return boundsRef.current.getBoundingClientRect();
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }, [boundsRef]);

  const clampToBounds = useCallback(
    (nextX: number, nextY: number) => {
      const bounds = getBoundsRect();
      const rect = toolbarRef.current?.getBoundingClientRect();
      const width = rect?.width ?? 0;
      const height = rect?.height ?? 0;
      const maxX = Math.max(0, bounds.width - width);
      const maxY = Math.max(0, bounds.height - height);
      return {
        x: clamp(nextX, 0, maxX),
        y: clamp(nextY, 0, maxY),
      };
    },
    [getBoundsRect]
  );

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bounds = getBoundsRect();
    dragOffsetRef.current = {
      x: event.clientX - bounds.left - position.x,
      y: event.clientY - bounds.top - position.y,
    };
    setIsDragging(true);
    event.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (event: MouseEvent) => {
      const bounds = getBoundsRect();
      const nextX = event.clientX - bounds.left - dragOffsetRef.current.x;
      const nextY = event.clientY - bounds.top - dragOffsetRef.current.y;
      setPosition(clampToBounds(nextX, nextY));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, getBoundsRect, clampToBounds]);

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => clampToBounds(prev.x, prev.y));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampToBounds]);

  if (!layout) return null;

  return (
    <div
      ref={toolbarRef}
      data-toolbar-id={id}
      className={cn(
        "absolute left-0 top-0 z-30",
        isDragging && "cursor-grabbing",
        className
      )}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }}
    >
        <div className="flex items-center rounded-lg border border-gray-200 bg-white/95 shadow-xl backdrop-blur">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drag toolbar"
            className={cn(
            "flex w-8 flex-col items-center gap-1 rounded-l-lg border-r border-gray-200 bg-gray-50/80 px-0.5 py-0.5 text-gray-400 self-stretch justify-center",
              isDragging ? "cursor-grabbing" : "cursor-grab"
            )}
            onMouseDown={handleMouseDown}
          >
            <div className="flex flex-col items-center gap-0.5 py-1">
              <span className="h-2.5 w-1 rounded-full bg-gray-300" />
              <span className="h-2.5 w-1 rounded-full bg-gray-300" />
              <span className="h-2.5 w-1 rounded-full bg-gray-300" />
            </div>
        </div>

        {(layoutToggleEntries.length > 1 || onDisplayModeChange) && (
          <div className="flex flex-col items-center justify-center gap-1 self-stretch border-r border-gray-200 bg-gray-50/80 px-0.5 py-0.5">
            {layoutToggleEntries.length > 1 && onLayoutChange && (
              <div className="flex flex-col items-center gap-0.5 rounded-md border border-gray-200 bg-white px-0.5 py-0.5 text-[8px] font-semibold uppercase text-gray-500 shadow-sm">
                {layoutToggleEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    title={entry.label}
                    aria-label={entry.label}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLayoutChange(entry.id);
                    }}
                    className={cn(
                      "flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-colors",
                      entry.id === activeLayoutId
                        ? "bg-gray-900 text-white"
                        : "hover:text-gray-700"
                    )}
                  >
                    {entry.handleIcon ?? entry.label.slice(0, 1)}
                  </button>
                ))}
              </div>
            )}

            {onDisplayModeChange && (
              <div className="flex flex-col items-center gap-0.5 rounded-md border border-gray-200 bg-white px-0.5 py-0.5 text-[8px] font-semibold uppercase text-gray-500 shadow-sm">
                <button
                  type="button"
                  title="Compact mode"
                  aria-label="Compact mode"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDisplayModeChange('compact');
                  }}
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-colors",
                    displayMode === 'compact'
                      ? "bg-gray-900 text-white"
                      : "hover:text-gray-700"
                  )}
                >
                  C
                </button>
                <button
                  type="button"
                  title="Descriptive mode"
                  aria-label="Descriptive mode"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDisplayModeChange('descriptive');
                  }}
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded-sm transition-colors",
                    displayMode === 'descriptive'
                      ? "bg-gray-900 text-white"
                      : "hover:text-gray-700"
                  )}
                >
                  D
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col">
          <div
            key={`${layout.id}-${swapKey}`}
            className="flex flex-wrap items-stretch gap-0.5 px-0.5 pb-0.5 pt-0.5 animate-toolbar-swap"
          >
            {layout.sections.map((section) => (
              <div
                key={section.id}
                className="flex w-fit flex-col rounded-md border border-gray-100 bg-white p-0.5 shadow-sm"
              >
                <div className="text-center text-[8px] font-semibold uppercase leading-none tracking-wider text-gray-500">
                  {section.title}
                </div>
                <div className="mt-0.5 flex flex-1 flex-col justify-center gap-0.5">
                  {section.rows.map((row, rowIndex) => (
                    <div
                      key={`${section.id}-row-${rowIndex}`}
                      className="flex flex-wrap items-center justify-center gap-0.5"
                    >
                      {row.map((control, controlIndex) => (
                        <div key={`${section.id}-control-${controlIndex}`}>
                          {control}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-md border border-dashed border-gray-200 bg-white/90 text-center text-[9px] text-gray-500 shadow-sm transition-all duration-200",
          showInstruction ? "mt-1 max-h-24 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {(instructionContent || instructionText) && (
          <div className="px-2 py-1">{instructionContent ?? instructionText}</div>
        )}
      </div>

      <style jsx>{`
        @keyframes toolbar-swap {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-toolbar-swap {
          animation: toolbar-swap 180ms ease-out;
        }
      `}</style>
    </div>
  );
};

export default ContextToolbar;
