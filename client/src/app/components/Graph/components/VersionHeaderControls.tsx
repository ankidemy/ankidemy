"use client";

import React from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { Button } from '@/app/components/core/button';

interface VersionHeaderControlsProps {
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  onAdd?: () => void;
  onDelete?: () => void;
  addDisabled?: boolean;
  deleteDisabled?: boolean;
  className?: string;
}

const VersionHeaderControls: React.FC<VersionHeaderControlsProps> = ({
  index,
  count,
  onPrevious,
  onNext,
  onAdd,
  onDelete,
  addDisabled = false,
  deleteDisabled = false,
  className = '',
}) => {
  if (count <= 0) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`.trim()}>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={deleteDisabled}
          className="h-8 w-8"
          title="Delete version"
        >
          <Minus size={14} />
        </Button>
      )}
      {onAdd && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onAdd}
          disabled={addDisabled}
          className="h-8 w-8"
          title="Add version"
        >
          <Plus size={14} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={index <= 0}
        className="h-8 w-8"
        title="Previous version"
      >
        <ChevronLeft size={16} />
      </Button>
      <span className="text-xs text-gray-500 min-w-[70px] text-center">
        Ver {index + 1}/{count}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={index >= count - 1}
        className="h-8 w-8"
        title="Next version"
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
};

export default VersionHeaderControls;
