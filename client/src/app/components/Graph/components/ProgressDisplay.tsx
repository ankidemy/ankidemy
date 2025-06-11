// src/app/components/Graph/components/ProgressDisplay.tsx
"use client";

import React from 'react';
import { NodeProgress } from '@/types/srs';
import { calculateSuccessRate, formatNextReview } from '@/lib/srs-api';

interface ProgressDisplayProps {
  progress: NodeProgress | null | undefined; // Allow null or undefined
  compact?: boolean;
}

const ProgressDisplay: React.FC<ProgressDisplayProps> = ({ progress, compact = false }) => {
  if (!progress) {
    return (
      <div className={`p-2 border rounded-md text-xs ${compact ? 'bg-gray-50' : 'bg-blue-50 border-blue-200'}`}>
        <p className="text-gray-500 italic">No review progress yet.</p>
      </div>
    );
  }

  const successRate = calculateSuccessRate(progress.successfulReviews, progress.totalReviews);

  if (compact) {
    return (
      <div className="text-xs space-y-0.5">
        <p>Rep: {progress.repetitions}, Int: {progress.intervalDays}d</p>
        <p>EF: {progress.easinessFactor.toFixed(2)}</p>
        <p>Due: {formatNextReview(progress.nextReview)}</p>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-md bg-indigo-50 border-indigo-200 text-xs space-y-1.5">
      <h4 className="font-semibold text-indigo-700 mb-1">Review Stats</h4>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <div><span className="font-medium text-gray-600">Repetitions:</span> {progress.repetitions}</div>
        <div><span className="font-medium text-gray-600">Interval:</span> {progress.intervalDays} days</div>
        <div><span className="font-medium text-gray-600">Easiness:</span> {progress.easinessFactor.toFixed(2)}</div>
        <div>
          <span className="font-medium text-gray-600">Success:</span> {progress.successfulReviews}/{progress.totalReviews} ({successRate}%)
        </div>
      </div>
      <p><span className="font-medium text-gray-600">Last Review:</span> {progress.lastReview ? new Date(progress.lastReview).toLocaleDateString() : 'N/A'}</p>
      <p><span className="font-medium text-gray-600">Next Review:</span> {formatNextReview(progress.nextReview)}</p>
      {progress.accumulatedCredit !== 0 && (
         <p className={`font-medium ${progress.accumulatedCredit > 0 ? 'text-green-600' : 'text-red-600'}`}>
           Implicit Credit: {Math.round(progress.accumulatedCredit * 100)}%
           {progress.creditPostponed && " (Postponed)"}
         </p>
      )}
    </div>
  );
};

export default ProgressDisplay;
