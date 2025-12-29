// File: src/app/components/Graph/details/MetaExerciseVersionsViewer.tsx
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import ZoomableImage from '../components/ZoomableImage';
import type { MetaExercise } from '@/lib/api';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface MetaExerciseVersionsViewerProps {
  meta: MetaExercise;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  isOwner: boolean;
  onEditVersion?: (index: number) => void;
}

const MetaExerciseVersionsViewer: React.FC<MetaExerciseVersionsViewerProps> = ({
  meta,
  activeIndex,
  setActiveIndex,
  isOwner,
  onEditVersion,
}) => {
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const versions = meta.versions || [];
  const hasVersions = versions.length > 0;

  if (!hasVersions) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No versions available.</p>
        {isOwner && onEditVersion && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onEditVersion(0)}
            className="mt-2"
          >
            Add First Version
          </Button>
        )}
      </div>
    );
  }

  // Clamp activeIndex to valid range
  const safeIndex = Math.max(0, Math.min(activeIndex || 0, Math.max(versions.length - 1, 0)));
  const currentVersion = versions[safeIndex];

  const handlePrev = () => {
    if (safeIndex > 0) {
      setActiveIndex(safeIndex - 1);
      // Reset toggles when switching versions
      setShowSolution(false);
      setShowHints(false);
      setShowNotes(false);
    }
  };

  const handleNext = () => {
    if (safeIndex < versions.length - 1) {
      setActiveIndex(safeIndex + 1);
      // Reset toggles when switching versions
      setShowSolution(false);
      setShowHints(false);
      setShowNotes(false);
    }
  };

  const handleVersionClick = (index: number) => {
    setActiveIndex(index);
    // Reset toggles when switching versions
    setShowSolution(false);
    setShowHints(false);
    setShowNotes(false);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Navigation controls */}
      <div className="flex flex-col gap-2">
        {/* Prev/Next arrows with version indicator */}
        <div className="flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            disabled={safeIndex === 0}
            onClick={handlePrev}
            className="h-7 px-2 text-xs"
          >
            Prev
          </Button>
          <span className="text-sm font-medium">
            Ver {safeIndex + 1}/{versions.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={safeIndex >= versions.length - 1}
            onClick={handleNext}
            className="h-7 px-2 text-xs"
          >
            Next
          </Button>
        </div>

        {/* Version tabs */}
        <div className="flex flex-wrap gap-1">
          {versions.map((_, idx) => (
            <Button
              key={idx}
              variant={idx === safeIndex ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleVersionClick(idx)}
              className="h-6 px-2 text-xs"
            >
              V{idx + 1}
            </Button>
          ))}
        </div>

        {/* Intentionally no per-version edit button; use the window's top-right Edit */}
      </div>

      {/* Statement */}
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">
          Problem Statement
        </h4>
        <Card className="bg-gray-50 border shadow-sm">
          <CardContent className="p-3 text-sm">
            {currentVersion.statement && currentVersion.statement.trim().length > 0 ? (
              <MarkdownKatex className="whitespace-pre-wrap">
                {currentVersion.statement}
              </MarkdownKatex>
            ) : (
              <span className="text-gray-400 italic">N/A</span>
            )}
            {currentVersion.statementImagePath && (
              <div className="mt-2">
                <ZoomableImage src={currentVersion.statementImagePath} alt="Statement image" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Solution */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">
            Solution
          </h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSolution(!showSolution)}
            className="h-6 text-xs px-1 flex items-center"
          >
            {showSolution ? (
              <ChevronUp size={12} className="mr-1" />
            ) : (
              <ChevronDown size={12} className="mr-1" />
            )}
            {showSolution ? 'Hide' : 'Show'}
          </Button>
        </div>
        {showSolution && (
          <Card className="bg-blue-50 border border-blue-200 shadow-sm">
            <CardContent className="p-3 text-sm">
              {currentVersion.description && currentVersion.description.trim().length > 0 ? (
                <MarkdownKatex className="whitespace-pre-wrap">
                  {currentVersion.description}
                </MarkdownKatex>
              ) : (
                <span className="text-gray-400 italic">N/A</span>
              )}
              {currentVersion.descriptionImagePath && (
                <div className="mt-2">
                  <ZoomableImage src={currentVersion.descriptionImagePath} alt="Solution image" />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hints */}
      {currentVersion.hints && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">
              Hints
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHints(!showHints)}
              className="h-6 text-xs px-1 flex items-center"
            >
              {showHints ? (
                <ChevronUp size={12} className="mr-1" />
              ) : (
                <ChevronDown size={12} className="mr-1" />
              )}
              {showHints ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showHints && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MarkdownKatex className="whitespace-pre-wrap">
                  {currentVersion.hints}
                </MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Notes */}
      {currentVersion.notes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">
              Notes
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
              className="h-6 text-xs px-1 flex items-center"
            >
              {showNotes ? (
                <ChevronUp size={12} className="mr-1" />
              ) : (
                <ChevronDown size={12} className="mr-1" />
              )}
              {showNotes ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showNotes && (
            <Card className="bg-purple-50 border border-purple-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MarkdownKatex className="whitespace-pre-wrap">
                  {currentVersion.notes}
                </MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Version metadata */}
      <div className="text-xs text-gray-500 space-y-1 border-t pt-2">
        <div>Difficulty: {currentVersion.difficulty || 'N/A'}</div>
        <div>Verifiable: {currentVersion.verifiable ? 'Yes' : 'No'}</div>
        {currentVersion.result && <div>Expected Result: {currentVersion.result}</div>}
      </div>
    </div>
  );
};

export default MetaExerciseVersionsViewer;
