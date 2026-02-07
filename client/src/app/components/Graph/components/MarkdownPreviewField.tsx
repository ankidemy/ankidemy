"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';

interface MarkdownPreviewFieldProps {
  id?: string;
  label: string;
  value?: string;
  onChange: (value: string) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLTextAreaElement>) => void;
  onDragOver?: (event: React.DragEvent<HTMLTextAreaElement>) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  labelClassName?: string;
  textareaClassName?: string;
  previewClassName?: string;
  buttonClassName?: string;
  emptyPreviewText?: string;
}

const MarkdownPreviewField: React.FC<MarkdownPreviewFieldProps> = ({
  id,
  label,
  value,
  onChange,
  onPaste,
  onDrop,
  onDragOver,
  rows = 3,
  placeholder,
  disabled,
  required,
  helperText,
  labelClassName = "block text-sm font-medium text-gray-700",
  textareaClassName = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400",
  previewClassName = "p-3 border rounded-md bg-gray-50 text-sm",
  buttonClassName = "h-6 text-xs px-1",
  emptyPreviewText = "Nothing to preview",
}) => {
  const [isPreview, setIsPreview] = useState(false);
  const safeValue = value ?? '';
  const hasValue = safeValue.trim().length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className={labelClassName}>{label}</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClassName}
          onClick={() => setIsPreview(prev => !prev)}
        >
          {isPreview ? 'Edit' : 'Preview'}
        </Button>
      </div>
      {isPreview ? (
        <div className={previewClassName}>
          {hasValue ? (
            <MarkdownKatex className="whitespace-pre-wrap">{safeValue}</MarkdownKatex>
          ) : (
            <span className="text-gray-400 italic">{emptyPreviewText}</span>
          )}
        </div>
      ) : (
        <textarea
          id={id}
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={onDragOver}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={textareaClassName}
        />
      )}
      {helperText && <p className="text-xs text-gray-500 mt-1">{helperText}</p>}
    </div>
  );
};

export default MarkdownPreviewField;
