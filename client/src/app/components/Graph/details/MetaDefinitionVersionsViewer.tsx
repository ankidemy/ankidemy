// File: src/app/components/Graph/details/MetaDefinitionVersionsViewer.tsx
"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import ZoomableImage from '../components/ZoomableImage';
import type { MetaDefinition } from '@/lib/api';

interface MetaDefinitionVersionsViewerProps {
  meta: MetaDefinition;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  isOwner: boolean;
  onEditVersion?: (index: number) => void;
}

const MetaDefinitionVersionsViewer: React.FC<MetaDefinitionVersionsViewerProps> = ({
  meta,
  activeIndex,
  setActiveIndex,
  isOwner,
  onEditVersion,
}) => {
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

  const safeIndex = Math.max(0, Math.min(activeIndex || 0, Math.max(versions.length - 1, 0)));
  const currentVersion = versions[safeIndex];

  const handlePrev = () => {
    if (safeIndex > 0) {
      setActiveIndex(safeIndex - 1);
    }
  };

  const handleNext = () => {
    if (safeIndex < versions.length - 1) {
      setActiveIndex(safeIndex + 1);
    }
  };

  const handleVersionClick = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Navigation controls */}
      <div className="flex flex-col gap-2">
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

        {/* Per-version edit button removed; use window's top-right Edit */}
      </div>

      {/* Prompt */}
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">
          Review Prompt
        </h4>
        <Card className="bg-gray-50 border shadow-sm">
          <CardContent className="p-3 text-sm">
            {currentVersion.prompt && currentVersion.prompt.trim().length > 0 ? (
              <MarkdownKatex className="whitespace-pre-wrap">
                {currentVersion.prompt}
              </MarkdownKatex>
            ) : (
              <span className="text-gray-400 italic">N/A</span>
            )}
            {currentVersion.promptImagePath && (
              <div className="mt-2">
                <ZoomableImage src={currentVersion.promptImagePath} alt="Prompt image" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Definition text (description) */}
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">
          Definition Text
        </h4>
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
                <ZoomableImage src={currentVersion.descriptionImagePath} alt="Description image" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {currentVersion.notes && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">
            Notes
          </h4>
          <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
            <CardContent className="p-3 text-sm">
              <MarkdownKatex className="whitespace-pre-wrap">
                {currentVersion.notes}
              </MarkdownKatex>
            </CardContent>
          </Card>
        </div>
      )}

      {/* References */}
      {!!(currentVersion.references && currentVersion.references.length) && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">References</h4>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
            {(currentVersion.references || []).map((ref, i) => (
              <li key={`${ref}-${i}`} className="text-xs">{ref}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MetaDefinitionVersionsViewer;
