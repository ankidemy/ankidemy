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
  onUpload: (file: File) => Promise<string>;
  onChange: (path: string) => void;
  onClear?: () => void;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  helperText,
  imagePath,
  disabled,
  onUpload,
  onChange,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        <div className="flex items-center gap-2">
          {imagePath && onClear && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
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
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            {isUploading ? "Uploading..." : imagePath ? "Replace" : "Upload"}
          </Button>
        </div>
      </div>
      {helperText && <p className="text-[11px] text-gray-500">{helperText}</p>}
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
        <div className="text-xs text-gray-400">No image attached.</div>
      )}
    </div>
  );
};

export default ImageUploadField;
