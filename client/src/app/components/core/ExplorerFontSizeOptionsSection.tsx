"use client";

import React from 'react';
import { Button } from '@/app/components/core/button';
import {
  ExplorerFontSizeCategory,
  ExplorerFontSizeSteps,
  formatExplorerFontSizeStep,
} from '@/lib/explorer-font-sizes';

type ExplorerFontSizeRow = {
  category: ExplorerFontSizeCategory;
  label: string;
};

const FONT_SIZE_ROWS: ExplorerFontSizeRow[] = [
  { category: 'tags', label: 'Tags' },
  { category: 'markdown', label: 'Markdown + textarea' },
  { category: 'ui', label: 'Windows / menus' },
  { category: 'toolbar', label: 'Context toolbar text' },
];

interface ExplorerFontSizeOptionsSectionProps {
  steps: ExplorerFontSizeSteps;
  onAdjust: (category: ExplorerFontSizeCategory, delta: -1 | 1) => void;
  className?: string;
}

const ExplorerFontSizeOptionsSection: React.FC<ExplorerFontSizeOptionsSectionProps> = ({
  steps,
  onAdjust,
  className = '',
}) => {
  return (
    <div className={`rounded-md border border-gray-200 bg-gray-50 px-3 py-2 ${className}`.trim()}>
      <div className="text-xs font-semibold text-gray-700">Font size</div>
      <div className="mt-2 space-y-2">
        {FONT_SIZE_ROWS.map((row) => (
          <div key={row.category} className="flex items-center justify-between gap-2">
            <span className="text-xs text-gray-600">{row.label}</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => onAdjust(row.category, -1)}
                title={`Decrease ${row.label}`}
              >
                -
              </Button>
              <span className="min-w-[52px] text-center text-[11px] font-semibold text-gray-600">
                {formatExplorerFontSizeStep(steps[row.category])}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => onAdjust(row.category, 1)}
                title={`Increase ${row.label}`}
              >
                +
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExplorerFontSizeOptionsSection;
