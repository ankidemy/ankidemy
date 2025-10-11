// client/src/app/components/Graph/utils/HybridLatexRenderer.ts
// A robust, state-decoupled, high-quality label renderer using an SVG-to-Image pipeline.

export interface RenderedLabel {
  image: HTMLImageElement;
  width: number;
  height: number;
}

interface RenderOptions {
  fontSize?: number;
  padding?: number;
  color?: string;
  backgroundColor?: string;
  fontFamily?: string;
  maxWidth?: number;
}

type RenderCallback = () => void;

export class LabelRenderer {
  // The cache now stores the final RenderedLabel object directly.
  private cache: Map<string, RenderedLabel> = new Map();
  // A set to track which labels are currently being rendered to avoid duplicate work.
  private renderingInProgress: Set<string> = new Set();
  // Concurrency-limited queue to avoid blocking the main thread with many MathJax jobs at once
  private queue: Array<{ text: string; onRendered: RenderCallback }>= [];
  private activeCount = 0;
  private readonly maxConcurrent = 3;
  private readonly maxCacheSize = 1500;

  /**
   * Requests a label to be rendered. If not in cache, it starts the async rendering process.
   * The callback will be invoked once rendering is complete, signaling the UI to update.
   * @param text The text to render (can include LaTeX).
   * @param onRendered A callback function to execute when the label is ready.
   */
  public render(text: string, onRendered: RenderCallback): void {
    if (this.cache.has(text) || this.renderingInProgress.has(text)) {
      return; // Already cached or being rendered.
    }

    // Queue and pump with concurrency limit
    this.queue.push({ text, onRendered });
    this.pump();
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      const { text, onRendered } = job;

      if (this.cache.has(text)) {
        onRendered();
        continue;
      }
      if (this.renderingInProgress.has(text)) {
        continue;
      }

      this.renderingInProgress.add(text);
      this.activeCount++;

      this.createImageFromText(text)
        .then(renderedLabel => {
          this.cache.set(text, renderedLabel);
          this.pruneCache();
          onRendered();
        })
        .catch(error => {
          console.error(`Failed to render label for "${text}":`, error);
          return this.createFallbackImage(text).then(fallback => {
            this.cache.set(text, fallback);
            onRendered();
          }).catch(() => { /* swallow */ });
        })
        .finally(() => {
          this.renderingInProgress.delete(text);
          this.activeCount--;
          // Defer next pump to avoid deep recursion
          setTimeout(() => this.pump(), 0);
        });
    }
  }

  /**
   * Retrieves a rendered label from the cache if it exists.
   * @param text The text of the label.
   * @returns The RenderedLabel object or undefined.
   */
  public getCache(text: string): RenderedLabel | undefined {
    return this.cache.get(text);
  }

  /**
   * Creates a simple fallback image using canvas when SVG method fails
   */
  private async createFallbackImage(text: string): Promise<RenderedLabel> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Device pixel ratio aware rendering for crisp text
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    const fontSize = 14; // CSS pixels seen by ForceGraph coordinates
    const padding = 2;   // CSS pixels

    // Measure in CSS pixels first
    ctx.font = `${fontSize}px Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    const widthCSS = Math.ceil(metrics.width + padding * 2);
    const heightCSS = Math.ceil(fontSize * 1.05 + padding * 2);

    // Allocate backing store in device pixels for crispness
    canvas.width = Math.max(1, widthCSS * dpr);
    canvas.height = Math.max(1, heightCSS * dpr);

    // Map drawing units to CSS pixel space
    ctx.scale(dpr, dpr);

    // Optional: avoid extra smoothing when downscaling on canvas
    // (has effect when browser rescales images; text is drawn at native res)
    (ctx as any).imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';

    // Draw background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.fillRect(0, 0, widthCSS, heightCSS);

    // Subtle border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, widthCSS, heightCSS);

    // Draw sharp text in CSS pixel space (scaled by DPR under the hood)
    ctx.fillStyle = '#1f2937';
    ctx.font = `${fontSize}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, widthCSS / 2, heightCSS / 2);

    // Convert canvas to image; report CSS dimensions so drawImage uses proper size
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ image, width: widthCSS, height: heightCSS });
      image.src = canvas.toDataURL();
    });
  }

  /**
   * The core SVG-to-Image pipeline. This is a private, async method.
   */
  private async createImageFromText(
    text: string,
    options: RenderOptions = {}
  ): Promise<RenderedLabel> {
    const {
      fontSize = 12,
      padding = 2,
      color = '#333333',
      backgroundColor = 'rgba(255, 255, 255, 0.95)',
      fontFamily = 'Arial, sans-serif',
      maxWidth = 250,
    } = options;

    // Truncate very long text to prevent performance issues and oversized labels.
    const truncatedText = text.length > 80 ? text.substring(0, 77) + '...' : text;

    // 1. Create a temporary off-screen div to render the content with styles.
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: -9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: ${padding}px;
      font-family: ${fontFamily};
      font-size: ${fontSize}px;
      color: ${color};
      background-color: ${backgroundColor};
      border-radius: 2px;
      border: 1px solid rgba(0,0,0,0.1);
      line-height: 1.05;
      max-width: ${maxWidth}px;
      word-wrap: break-word;
      visibility: visible;
    `;
    // Set text safely; MathJax can parse TeX delimiters in text nodes
    container.textContent = truncatedText;
    document.body.appendChild(container);

    try {
      // 2. Typeset LaTeX with MathJax.
      if ((window as any).MathJax?.typesetPromise) {
        await (window as any).MathJax.typesetPromise([container]);
      }

      // 3. Measure the final dimensions of the rendered div.
      const rect = container.getBoundingClientRect();
      const width = Math.max(20, Math.ceil(rect.width)) + 10;
      const height = Math.max(16, Math.ceil(rect.height)) + 10;

      // Render at device-pixel ratio for crisp results while keeping CSS size
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

      // 4. Create an SVG with <foreignObject> to capture the styled HTML.
      // This is the magic step that leverages the browser's high-quality rendering engine.
      const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width * dpr}" height="${height * dpr}" viewBox="0 0 ${width} ${height}">
          <foreignObject x="0" y="0" width="${width}" height="${height}">
            <div xmlns="http://www.w3.org/1999/xhtml" style="padding: ${padding}px; font-family: ${fontFamily}; font-size: ${fontSize}px; color: ${color}; background-color: ${backgroundColor}; border-radius: 2px; border: 1px solid rgba(0,0,0,0.1); line-height: 1.05; max-width: ${maxWidth}px; word-wrap: break-word; display: inline-block; box-sizing: border-box;">
              ${container.innerHTML}
            </div>
          </foreignObject>
        </svg>`;

      // 5. Convert the SVG string into a usable Image object via a Blob.
      return new Promise((resolve, reject) => {
        const image = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        image.onload = () => {
          resolve({ image, width, height });
          // Don't revoke URL here - let cleanup handle it
        };
        image.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        image.src = url;
      });
    } finally {
      // 6. Always clean up the temporary div.
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }

  /**
   * Manages cache size to prevent memory leaks.
   */
  private pruneCache(): void {
    if (this.cache.size > this.maxCacheSize) {
      // Simple strategy: delete the first (oldest) entry.
      const oldestKey = this.cache.keys().next().value;
      const oldestEntry = this.cache.get(oldestKey);
      if (oldestEntry) {
        this.revokeObjectURL(oldestEntry);
      }
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Clears the entire cache and revokes all associated Blob URLs to free up memory.
   * This should be called when the graph structure changes or the component unmounts.
   */
  public clearCache(): void {
    this.cache.forEach(renderedLabel => this.revokeObjectURL(renderedLabel));
    this.cache.clear();
    this.renderingInProgress.clear();
  }

  private revokeObjectURL(renderedLabel: RenderedLabel): void {
    if (renderedLabel.image.src && renderedLabel.image.src.startsWith('blob:')) {
      URL.revokeObjectURL(renderedLabel.image.src);
    }
  }

  public getCacheSize(): number {
    return this.cache.size;
  }
}
