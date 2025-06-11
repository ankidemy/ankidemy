// src/app/components/Graph/components/StatusIndicator.tsx
"use client";

import React from 'react';
import { NodeStatus } from '@/types/srs';
import { getStatusColor, getStatusIcon, formatNextReview } from '@/lib/srs-api';
import { Clock, AlertTriangle } from 'lucide-react';

interface StatusIndicatorProps {
  status: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null;
  nextReviewDate?: string | null; // Add nextReviewDate prop
  compact?: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  isDue,
  daysUntilReview,
  nextReviewDate,
  compact = false,
}) => {
  const color = getStatusColor(status);
  const icon = getStatusIcon(status);

  const dueTextColor = isDue ? 'text-orange-600' : 'text-gray-500';
  const dueBgColor = isDue ? 'bg-orange-100' : 'bg-gray-100';

  if (compact) {
    return (
      <div className="flex items-center" title={`Status: ${status}`}>
        <span style={{ color }} className="mr-1 text-lg">
          {icon}
        </span>
        {isDue && <Clock size={14} className="text-orange-500" title="Due for review" />}
      </div>
    );
  }

  return (
    <div className="p-2 border rounded-md bg-white space-y-1.5 text-xs">
      <div className="flex items-center">
        <span
          style={{ backgroundColor: color }}
          className="w-3 h-3 rounded-full mr-2 shrink-0"
          title={`Status: ${status}`}
        />
        <span className="font-medium capitalize">{status}</span>
        {isDue && (
          <span className={`ml-auto px-1.5 py-0.5 rounded text-xs font-semibold ${dueBgColor} ${dueTextColor} flex items-center`}>
            <AlertTriangle size={12} className="mr-1" /> Due
          </span>
        )}
      </div>
      {nextReviewDate && (
        <div className="flex items-center text-gray-600">
          <Clock size={12} className="mr-1.5 shrink-0" />
          <span>{formatNextReview(nextReviewDate)}</span>
        </div>
      )}
      {typeof daysUntilReview === 'number' && daysUntilReview > 1 && !isDue && (
         <div className="text-gray-500">
           {daysUntilReview} days until next review
         </div>
      )}
    </div>
  );
};

export default StatusIndicator;
