"use client";

import React, { useRef, useState } from "react";
import { Button } from "@/app/components/core/button";
import { showToast } from "@/app/components/core/ToastNotification";
import ZoomableImage from "./ZoomableImage";

interface ImageUploadFieldProps {
  label: string;
  helperText?: string;
  imagePath?: string;
  disabled?: boolean;
  compact?: boolean;
  onUpload: (file: File) => Promise<string>;
  onChange: (path: string) => void;
  onClear?: () => void;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  helperText,
  imagePath,
  disabled,
  compact = false,
  onUpload,
  onChange,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = async (file: File | null | undefined) => {
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await onUpload(file);
      onChange(result);
    } catch (error: any) {
      showToast(error?.message || "Failed to upload image", "error");
    } finally {
      setIsUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFile(event.target.files?.[0]);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled || isUploading) return;
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith("image/"));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void uploadFile(file);
  };

  return (
    <div
      className={compact ? "space-y-1 min-w-0" : "space-y-2 min-w-0"}
      onPaste={handlePaste}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="block min-w-0 text-xs font-medium text-gray-600">{label}</label>
        {compact ? (
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <span>paste image or</span>
            <button
              type="button"
              className="text-[11px] text-gray-700 underline underline-offset-2 disabled:text-gray-400"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {isUploading ? "uploading..." : imagePath ? "replace" : "upload"}
            </button>
            {imagePath && onClear && (
              <>
                <span className="text-gray-400">|</span>
                <button
                  type="button"
                  className="text-[11px] text-gray-700 underline underline-offset-2 disabled:text-gray-400"
                  onClick={onClear}
                  disabled={disabled || isUploading}
                >
                  remove
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {imagePath && onClear && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onClear}
                disabled={disabled || isUploading}
              >
                Remove
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {isUploading ? "Uploading..." : imagePath ? "Replace" : "Upload"}
            </Button>
          </div>
        )}
      </div>
      {!compact && helperText && <p className="text-[11px] text-gray-500">{helperText}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelect}
        disabled={disabled}
      />
      {imagePath ? (
        <ZoomableImage src={imagePath} alt={label} className="max-w-full" />
      ) : (
        !compact && <div className="text-xs text-gray-400">No image attached.</div>
      )}
    </div>
  );
};

export default ImageUploadField;
