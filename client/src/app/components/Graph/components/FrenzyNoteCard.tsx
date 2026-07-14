// Sticky-note editor for definition/exercise/source nodes in Frenzy edit mode.
// Purely presentational: all state and persistence live in KnowledgeGraph.

"use client";

import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/app/components/core/button';
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import VersionHeaderControls from './VersionHeaderControls';
import ZoomableImage from './ZoomableImage';
import type { FrenzyNoteState } from '../knowledge-graph/types';

type ImageTarget = 'prompt' | 'content' | 'solution';

type FrenzyNoteCardProps = {
  note: FrenzyNoteState;
  noteRef: React.RefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
  size: { width: number; height: number } | null;
  codeDraft: string;
  nameDraft: string;
  promptDraft: string;
  contentDraft: string;
  solutionDraft: string;
  promptImagePath: string;
  contentImagePath: string;
  solutionImagePath: string;
  isCodeEditing: boolean;
  isNewVersion: boolean;
  isSaving: boolean;
  isPreview: boolean;
  showSolution: boolean;
  codeConflict: boolean;
  onCodeDraftChange: (value: string) => void;
  onNameDraftChange: (value: string) => void;
  onPromptDraftChange: (value: string) => void;
  onContentDraftChange: (value: string) => void;
  onSolutionDraftChange: (value: string) => void;
  onSetCodeEditing: (editing: boolean) => void;
  onTogglePreview: () => void;
  onToggleSolution: () => void;
  onAutoPromptDismissed: () => void;
  onAutoContentDismissed: () => void;
  onSave: () => void;
  onClose: () => void;
  onVersionNavigate: (index: number) => void;
  onAddVersion: () => void;
  onDeleteVersion: () => void;
  onCancelNewVersion: () => void;
  onPaste: (event: React.ClipboardEvent, target: ImageTarget) => void;
  onUploadImage: (file: File, target: ImageTarget) => void;
  onHeaderMouseDown: (event: React.MouseEvent) => void;
  resizeHandles: React.ReactNode;
};

const ImageAttachmentRow: React.FC<{
  imagePath: string;
  emptyLabel: string;
  alt: string;
  onUpload: (file: File) => void;
}> = ({ imagePath, emptyLabel, alt, onUpload }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      {imagePath ? (
        <ZoomableImage src={imagePath} alt={alt} maxHeightClass="max-h-24" className="max-w-[180px]" />
      ) : (
        <span className="text-[11px] text-yellow-700">{emptyLabel}</span>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            if (e.currentTarget) e.currentTarget.value = '';
          }}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          Upload Image
        </Button>
      </div>
    </div>
  );
};

export const FrenzyNoteCard: React.FC<FrenzyNoteCardProps> = ({
  note,
  noteRef,
  position,
  size,
  codeDraft,
  nameDraft,
  promptDraft,
  contentDraft,
  solutionDraft,
  promptImagePath,
  contentImagePath,
  solutionImagePath,
  isCodeEditing,
  isNewVersion,
  isSaving,
  isPreview,
  showSolution,
  codeConflict,
  onCodeDraftChange,
  onNameDraftChange,
  onPromptDraftChange,
  onContentDraftChange,
  onSolutionDraftChange,
  onSetCodeEditing,
  onTogglePreview,
  onToggleSolution,
  onAutoPromptDismissed,
  onAutoContentDismissed,
  onSave,
  onClose,
  onVersionNavigate,
  onAddVersion,
  onDeleteVersion,
  onCancelNewVersion,
  onPaste,
  onUploadImage,
  onHeaderMouseDown,
  resizeHandles,
}) => {
  const commitCodeEdit = () => {
    const hasConflict = codeConflict;
    onSave();
    if (!hasConflict) onSetCodeEditing(false);
  };

  const promptShowsDefault = note.isAutoPrompt && promptDraft === note.defaultPrompt;
  const contentShowsDefault = note.isAutoContent && contentDraft === note.defaultContent;

  return (
    <div
      ref={noteRef}
      className="kg-font-ui frenzy-note-theme absolute z-40 w-[420px] min-w-[320px] min-h-[240px] max-w-[calc(100vw-1rem)] max-h-[80vh] bg-yellow-100 border border-yellow-300 rounded-md shadow-xl flex flex-col overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: size?.width,
        height: size?.height,
      }}
    >
      <div className="frenzy-note-theme-header px-3 pt-3 pb-2 border-b border-yellow-300 bg-yellow-100/95">
        <div
          className="flex items-start justify-between gap-2 cursor-move select-none"
          onMouseDown={onHeaderMouseDown}
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-yellow-900 truncate">
              {nameDraft.trim() || note.nodeName}
            </div>
            {isCodeEditing ? (
              <input
                value={codeDraft}
                onChange={(e) => onCodeDraftChange(e.target.value)}
                onBlur={commitCodeEdit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitCodeEdit();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    onSetCodeEditing(false);
                  }
                }}
                autoFocus
                disabled={isNewVersion}
                className={`mt-0.5 h-6 w-full max-w-[140px] bg-yellow-50 border rounded px-1.5 text-[11px] focus:outline-none focus:ring-2 ${
                  codeConflict
                    ? 'border-red-400 focus:ring-red-200 text-red-700'
                    : 'border-yellow-200 focus:ring-yellow-300 text-gray-800'
                } ${isNewVersion ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-invalid={codeConflict}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isNewVersion || isSaving) return;
                  onSetCodeEditing(true);
                }}
                disabled={isNewVersion || isSaving}
                className={`mt-0.5 text-[11px] text-left truncate ${
                  isNewVersion || isSaving
                    ? 'text-yellow-700/70 cursor-default'
                    : 'text-yellow-700 hover:underline'
                }`}
                title="Click to edit code"
              >
                {codeDraft.trim() || note.nodeId}
              </button>
            )}
          </div>
          <div className="flex items-start gap-2">
            {note.nodeType !== 'source' && note.allVersions.length > 0 && (
              <div className="flex items-center gap-1">
                <VersionHeaderControls
                  index={note.versionIndex}
                  count={note.allVersions.length}
                  onPrevious={() => onVersionNavigate(note.versionIndex - 1)}
                  onNext={() => onVersionNavigate(note.versionIndex + 1)}
                  onAdd={onAddVersion}
                  onDelete={onDeleteVersion}
                  addDisabled={isSaving || isNewVersion}
                  deleteDisabled={isSaving || isNewVersion || note.allVersions.length <= 1}
                  compact
                  className="rounded-md border border-yellow-300 bg-yellow-50/70 px-0.5 py-0"
                />
                {isNewVersion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancelNewVersion}
                    className="h-7 px-2 text-[11px] text-red-600"
                  >
                    Cancel draft
                  </Button>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="icon"
                variant="ghost"
                onClick={onClose}
                disabled={isSaving}
                className="h-7 w-7"
                title="Close"
              >
                <X size={14} />
              </Button>
            </div>
          </div>
        </div>
        {codeConflict && (
          <div className="mt-1 text-xs text-red-600">
            Code already exists in this domain.
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <div className="mb-2">
          <label className="block text-xs text-yellow-800 mb-1">Name</label>
          <input
            value={nameDraft}
            onChange={(e) => onNameDraftChange(e.target.value)}
            onBlur={onSave}
            disabled={isNewVersion}
            className={`w-full bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-800 ${isNewVersion ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
        {note.nodeType === 'definition' && (
          <div className="mb-2">
            <label className="block text-xs text-yellow-800 mb-1">Review Prompt</label>
            {isPreview ? (
              <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-32 overflow-y-auto">
                <MarkdownKatex className="whitespace-pre-wrap">
                  {promptDraft || note.defaultPrompt}
                </MarkdownKatex>
              </div>
            ) : (
              <textarea
                value={promptDraft}
                onChange={(e) => {
                  const value = e.target.value;
                  onPromptDraftChange(value);
                  if (note.isAutoPrompt && value !== note.defaultPrompt) {
                    onAutoPromptDismissed();
                  }
                }}
                onPaste={(e) => onPaste(e, 'prompt')}
                onFocus={(e) => {
                  if (promptShowsDefault) e.currentTarget.select();
                }}
                onClick={(e) => {
                  if (promptShowsDefault) e.currentTarget.select();
                }}
                onBlur={onSave}
                rows={3}
                className={`w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                  promptShowsDefault ? 'text-gray-500' : 'text-gray-800'
                }`}
              />
            )}
            <ImageAttachmentRow
              imagePath={promptImagePath}
              emptyLabel="No prompt image"
              alt="Prompt image"
              onUpload={(file) => onUploadImage(file, 'prompt')}
            />
          </div>
        )}
        <div className="mb-2">
          <label className="block text-xs text-yellow-800 mb-1">
            {note.nodeType === 'definition'
              ? 'Definition'
              : note.nodeType === 'source'
                ? 'Source'
                : 'Statement'}
          </label>
          {isPreview ? (
            <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-56 overflow-y-auto">
              <MarkdownKatex className="whitespace-pre-wrap">
                {contentDraft || note.defaultContent}
              </MarkdownKatex>
            </div>
          ) : (
            <textarea
              value={contentDraft}
              onChange={(e) => {
                const value = e.target.value;
                onContentDraftChange(value);
                if (note.isAutoContent && value !== note.defaultContent) {
                  onAutoContentDismissed();
                }
              }}
              onPaste={(e) => onPaste(e, 'content')}
              onFocus={(e) => {
                if (contentShowsDefault) e.currentTarget.select();
              }}
              onClick={(e) => {
                if (contentShowsDefault) e.currentTarget.select();
              }}
              onBlur={onSave}
              rows={6}
              placeholder={note.defaultContent}
              className={`w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                contentShowsDefault ? 'text-gray-500' : 'text-gray-800'
              }`}
            />
          )}
          {note.nodeType !== 'source' && (
            <ImageAttachmentRow
              imagePath={contentImagePath}
              emptyLabel="No image attached"
              alt="Content image"
              onUpload={(file) => onUploadImage(file, 'content')}
            />
          )}
        </div>
        {note.nodeType === 'exercise' && (
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-yellow-800">Solution</label>
              <Button
                size="sm"
                variant="ghost"
                onClick={onToggleSolution}
                className="text-[11px]"
              >
                {showSolution ? 'Hide' : 'Show'}
              </Button>
            </div>
            {showSolution && (
              <>
                {isPreview ? (
                  <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-40 overflow-y-auto">
                    <MarkdownKatex className="whitespace-pre-wrap">
                      {solutionDraft || 'No solution'}
                    </MarkdownKatex>
                  </div>
                ) : (
                  <textarea
                    value={solutionDraft}
                    onChange={(e) => onSolutionDraftChange(e.target.value)}
                    onPaste={(e) => onPaste(e, 'solution')}
                    onBlur={onSave}
                    rows={4}
                    placeholder="Solution or explanation..."
                    className="w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-800"
                  />
                )}
                <ImageAttachmentRow
                  imagePath={solutionImagePath}
                  emptyLabel="No solution image"
                  alt="Solution image"
                  onUpload={(file) => onUploadImage(file, 'solution')}
                />
              </>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            onClick={onTogglePreview}
          >
            {isPreview ? 'Edit' : 'Preview'}
          </Button>
          {isSaving && (
            <span className="text-xs text-gray-600">Saving...</span>
          )}
        </div>
      </div>
      {resizeHandles}
    </div>
  );
};

export default FrenzyNoteCard;
