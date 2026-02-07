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
  compact?: boolean;
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
  compact = false,
  className = '',
}) => {
  if (count <= 0) return null;

  const iconButtonSize = compact ? 'h-6 w-6' : 'h-8 w-8';
  const iconSize = compact ? 12 : 14;
  const navIconSize = compact ? 14 : 16;
  const labelClass = compact
    ? 'text-[11px] text-gray-500 min-w-[56px] text-center'
    : 'text-xs text-gray-500 min-w-[70px] text-center';
  const gapClass = compact ? 'gap-0.5' : 'gap-1';

  return (
    <div className={`flex items-center ${gapClass} ${className}`.trim()}>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={deleteDisabled}
          className={iconButtonSize}
          title="Delete version"
        >
          <Minus size={iconSize} />
        </Button>
      )}
      {onAdd && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onAdd}
          disabled={addDisabled}
          className={iconButtonSize}
          title="Add version"
        >
          <Plus size={iconSize} />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrevious}
        disabled={index <= 0}
        className={iconButtonSize}
        title="Previous version"
      >
        <ChevronLeft size={navIconSize} />
      </Button>
      <span className={labelClass}>
        Ver {index + 1}/{count}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={index >= count - 1}
        className={iconButtonSize}
        title="Next version"
      >
        <ChevronRight size={navIconSize} />
      </Button>
    </div>
  );
};

export default VersionHeaderControls;
