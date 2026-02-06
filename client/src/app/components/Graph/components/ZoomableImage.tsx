"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/app/components/core/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8765";

interface ZoomableImageProps {
  src?: string;
  alt?: string;
  className?: string;
  maxHeightClass?: string;
}

const resolveUrl = (raw?: string): string | null => {
  if (!raw) return null;
  if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("http")) {
    return raw;
  }
  if (raw.startsWith("/")) {
    return `${API_URL}${raw}`;
  }
  return `${API_URL}/${raw}`;
};

const isInlineImageSource = (value: string): boolean => {
  return value.startsWith("data:") || value.startsWith("blob:");
};

interface ZoomableImageRendererProps {
  imageSrc: string;
  alt?: string;
  className?: string;
  maxHeightClass?: string;
}

const ZoomableImageRenderer: React.FC<ZoomableImageRendererProps> = ({
  imageSrc,
  alt,
  className,
  maxHeightClass,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Image
        src={imageSrc}
        alt={alt || "attachment"}
        width={1200}
        height={900}
        unoptimized
        onClick={() => setIsOpen(true)}
        className={`h-auto w-auto rounded border border-gray-200 cursor-zoom-in ${maxHeightClass || "max-h-48"} ${className || ""}`}
      />

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setIsOpen(false)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <Image
              src={imageSrc}
              alt={alt || "zoomed"}
              width={1920}
              height={1080}
              unoptimized
              className="h-auto w-auto max-h-[85vh] max-w-[90vw] rounded shadow-lg"
            />
            <Button
              size="sm"
              variant="secondary"
              className="absolute -top-3 -right-3"
              onClick={() => setIsOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

interface RemoteZoomableImageProps extends ZoomableImageProps {
  resolved: string;
}

const RemoteZoomableImage: React.FC<RemoteZoomableImageProps> = ({
  resolved,
  alt,
  className,
  maxHeightClass,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let revokedUrl: string | null = null;
    const controller = new AbortController();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers: Record<string, string> = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    fetch(resolved, { headers, signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load image");
        }
        return response.blob();
      })
      .then((blob) => {
        revokedUrl = URL.createObjectURL(blob);
        setBlobUrl(revokedUrl);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
          return;
        }

        setHasError(true);
        setIsLoading(false);
      });

    return () => {
      controller.abort();
      if (revokedUrl) {
        URL.revokeObjectURL(revokedUrl);
      }
    };
  }, [resolved]);

  if (hasError) {
    return <div className="text-xs text-red-500">Image failed to load.</div>;
  }

  if (!blobUrl) {
    return <div className="text-xs text-gray-400">{isLoading ? "Loading image..." : "Image unavailable"}</div>;
  }

  return (
    <ZoomableImageRenderer
      imageSrc={blobUrl}
      alt={alt}
      className={className}
      maxHeightClass={maxHeightClass}
    />
  );
};

const ZoomableImage: React.FC<ZoomableImageProps> = ({ src, alt, className, maxHeightClass }) => {
  const resolved = useMemo(() => resolveUrl(src), [src]);

  if (!resolved) {
    return null;
  }

  if (isInlineImageSource(resolved)) {
    return (
      <ZoomableImageRenderer
        key={resolved}
        imageSrc={resolved}
        alt={alt}
        className={className}
        maxHeightClass={maxHeightClass}
      />
    );
  }

  return (
    <RemoteZoomableImage
      key={resolved}
      resolved={resolved}
      alt={alt}
      className={className}
      maxHeightClass={maxHeightClass}
    />
  );
};

export default ZoomableImage;
