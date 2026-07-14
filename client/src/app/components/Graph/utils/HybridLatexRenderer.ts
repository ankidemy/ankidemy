// client/src/app/components/Graph/utils/HybridLatexRenderer.ts
// A robust, state-decoupled, high-quality label renderer using an SVG-to-Image pipeline.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { getMathJaxReadyPromise } from '@/app/components/core/mathjaxReady';

// Maximum characters for graph label truncation
// NOTE: We do *not* hard-truncate all labels by character count anymore. We first
// try to render the full label within a max line budget (see createImageFromText)
// and only truncate if it exceeds that budget.
const LEGACY_MAX_LABEL_CHARS = 140;
const HARD_MAX_LABEL_CHARS = 2000;
const DEFAULT_MAX_LABEL_LINES = 3;
const DEFAULT_LINE_HEIGHT = 1.2;
const MAX_FIT_ATTEMPTS = 7;
// MathJax SVG output can visually extend below the container box (subscripts,
// negative vertical-align). Add a small gutter so the foreignObject capture
// doesn't clip the baseline descenders.
const EXTRA_RENDER_GUTTER_BOTTOM_PX = 2;
// Supersample rasterization to reduce pixelation when converting SVG/HTML to PNG.
// Effective raster scale is roughly `devicePixelRatio * factor`.
const RASTER_SUPERSAMPLE_FACTOR = 2;

function getRasterScale(): number {
  const dpr =
    typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
      ? window.devicePixelRatio
      : 1;
  return Math.max(1, Math.round(dpr * RASTER_SUPERSAMPLE_FACTOR));
}

function looksLikeTeX(text: string): boolean {
  const s = text ?? '';
  // $$...$$
  const dbl = s.indexOf('$$');
  if (dbl !== -1 && s.indexOf('$$', dbl + 2) !== -1) return true;
  // \[...\]
  const br = s.indexOf('\\[');
  if (br !== -1 && s.indexOf('\\]', br + 2) !== -1) return true;
  // \(...\)
  const par = s.indexOf('\\(');
  if (par !== -1 && s.indexOf('\\)', par + 2) !== -1) return true;

  // $...$ (unescaped)
  let unescapedDollars = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '$') continue;
    if (i > 0 && s[i - 1] === '\\') continue;
    unescapedDollars++;
    if (unescapedDollars >= 2) return true;
  }

  return false;
}

interface RenderedLabelBackground {
  source: CanvasImageSource;
  width: number;
  height: number;
}

interface RenderedLabel {
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
  maxLines?: number;
  lineHeight?: number;
}

type RenderCallback = () => void;

type LabelTheme = {
  textColor: string;
  backgroundFill: string;
  backgroundStroke: string;
  fallbackTextColor: string;
};

/**
 * Smart truncation that preserves TeX and inline code spans as atomic tokens.
 * Never breaks inside math delimiters ($...$, $$...$$, \(...\), \[...\]) or inline code (`...`).
 * Truncates only at whitespace/punctuation outside atomic tokens.
 */
function smartTruncateTeXGfm(
  input: string,
  maxChars = LEGACY_MAX_LABEL_CHARS
): { text: string; wasTruncated: boolean } {
  if (!input || input.length <= maxChars) {
    return { text: input, wasTruncated: false };
  }

  // State machine to track atomic tokens
  let insideMath = false;
  let insideCode = false;
  let mathDelimiter = '';
  let mathStart = -1;
  let codeStart = -1;
  let result = '';
  let i = 0;

  // Track token boundaries
  const safeBreakPoints: number[] = [];

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1] || '';
    const twoChar = char + next;

    // Track math delimiters
    if (!insideCode) {
      // Check for $$
      if (twoChar === '$$' && !insideMath) {
        insideMath = true;
        mathDelimiter = '$$';
        mathStart = result.length; // mark where this math token would start in result
        result += twoChar;
        i += 2;
        continue;
      } else if (twoChar === '$$' && insideMath && mathDelimiter === '$$') {
        insideMath = false;
        mathDelimiter = '';
        mathStart = -1;
        result += twoChar;
        i += 2;
        continue;
      }

      // Check for \[
      if (twoChar === '\\[' && !insideMath) {
        insideMath = true;
        mathDelimiter = '\\[';
        mathStart = result.length;
        result += twoChar;
        i += 2;
        continue;
      } else if (twoChar === '\\]' && insideMath && mathDelimiter === '\\[') {
        insideMath = false;
        mathDelimiter = '';
        mathStart = -1;
        result += twoChar;
        i += 2;
        continue;
      }

      // Check for \(
      if (twoChar === '\\(' && !insideMath) {
        insideMath = true;
        mathDelimiter = '\\(';
        mathStart = result.length;
        result += twoChar;
        i += 2;
        continue;
      } else if (twoChar === '\\)' && insideMath && mathDelimiter === '\\(') {
        insideMath = false;
        mathDelimiter = '';
        mathStart = -1;
        result += twoChar;
        i += 2;
        continue;
      }

      // Check for single $
      if (char === '$' && !insideMath) {
        insideMath = true;
        mathDelimiter = '$';
        mathStart = result.length;
        result += char;
        i++;
        continue;
      } else if (char === '$' && insideMath && mathDelimiter === '$') {
        insideMath = false;
        mathDelimiter = '';
        mathStart = -1;
        result += char;
        i++;
        // Safe break point after closing math
        if (result.length <= maxChars) {
          safeBreakPoints.push(result.length);
        }
        continue;
      }
    }

    // Track inline code (`...`)
    if (!insideMath && char === '`') {
      if (!insideCode) {
        insideCode = true;
        codeStart = result.length;
      } else {
        insideCode = false;
        codeStart = -1;
      }
      result += char;
      i++;
      if (!insideCode && result.length <= maxChars) {
        safeBreakPoints.push(result.length);
      }
      continue;
    }

    // Add character
    result += char;

    // Track safe break points (whitespace/punctuation outside tokens)
    if (!insideMath && !insideCode) {
      if (char === ' ' || char === ',' || char === '.' || char === ';' || char === '\n') {
        if (result.length <= maxChars) {
          safeBreakPoints.push(result.length);
        }
      }
    }

    i++;

    // If we've exceeded maxChars, try to break at last safe point
    if (result.length > maxChars) {
      if (safeBreakPoints.length > 0) {
        const breakPoint = safeBreakPoints[safeBreakPoints.length - 1];
        return {
          text: result.substring(0, breakPoint).trim() + '…',
          wasTruncated: true
        };
      } else {
        // No safe break points found; avoid cutting inside a token
        let cutIndex = Math.max(0, maxChars - 1);
        if (insideMath && mathStart >= 0 && mathStart < cutIndex) {
          cutIndex = Math.max(0, mathStart);
        }
        if (insideCode && codeStart >= 0 && codeStart < cutIndex) {
          cutIndex = Math.max(0, codeStart);
        }
        const trimmed = result.substring(0, cutIndex).trim();
        return { text: (trimmed ? trimmed + '…' : '…'), wasTruncated: true };
      }
    }
  }

  return { text: result, wasTruncated: false };
}

/**
 * Builds a unified processor for converting Markdown (with GFM) to sanitized HTML.
 * This processor is reused across all label renders for efficiency.
 * Allows inline formatting only (no <p> tags to avoid extra vertical spacing in labels).
 * NOTE: Does NOT include remark-math - raw TeX delimiters ($...$) are preserved in HTML
 * text nodes so MathJax can typeset them after the HTML is rendered.
 */
function buildLabelMarkdownProcessor() {
  // Custom sanitize schema: allow inline-safe content only (no <p> to prevent extra spacing)
  const customSchema = {
    ...defaultSchema,
    // Allow paragraphs; we will remove their default margins in post-processing
    tagNames: ['a', 'span', 'b', 'strong', 'i', 'em', 's', 'code', 'br', 'sub', 'sup', 'p'],
    attributes: {
      ...defaultSchema.attributes,
      a: ['href', 'target', 'rel'],
      span: ['class'],
    },
  };

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    // Do NOT use remark-math here - we want raw $...$ delimiters preserved for MathJax
    .use(remarkRehype)
    .use(rehypeSanitize, customSchema)
    .use(rehypeStringify);
}

type TypesetResult = {
  fits: boolean;
  htmlForSvg: string;
  // DOM-measured content box height (CSS px) used only for fit checks
  contentHeight: number;
  width: number;
  height: number;
};

export class LabelRenderer {
  // The cache now stores the final RenderedLabel object directly.
  private cache: Map<string, RenderedLabel> = new Map();
  private backgroundCache: Map<string, RenderedLabelBackground> = new Map();
  // A set to track which labels are currently being rendered to avoid duplicate work.
  private renderingInProgress: Set<string> = new Set();
  // Concurrency-limited queue to avoid blocking the main thread with many MathJax jobs at once
  private queue: Array<{ text: string; onRendered: RenderCallback }>= [];
  private activeCount = 0;
  private readonly maxConcurrent = 3;
  private readonly maxCacheSize = 1500;
  private readonly maxBackgroundCacheSize = 600;
  private renderEpoch = 0;
  private theme: LabelTheme = {
    textColor: '#333333',
    backgroundFill: 'rgba(255, 255, 255, 0.95)',
    backgroundStroke: 'rgba(0, 0, 0, 0.12)',
    fallbackTextColor: '#1f2937',
  };
  // Markdown processor instance (built once and reused for all labels)
  private mdProcessor: ReturnType<typeof buildLabelMarkdownProcessor>;
  private readonly transparentPixel =
    'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAACAkQBADs=';

  constructor() {
    this.mdProcessor = buildLabelMarkdownProcessor();
  }

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
      const epochAtStart = this.renderEpoch;

      this.renderLabel(text)
        .then(renderedLabel => {
          if (epochAtStart !== this.renderEpoch) return;
          this.cache.set(text, renderedLabel);
          this.pruneCache();
          onRendered();
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

  public setTheme(theme: Partial<LabelTheme>): void {
    this.theme = {
      ...this.theme,
      ...theme,
    };
    this.renderEpoch++;
    this.queue = [];
    this.renderingInProgress.clear();
    this.backgroundCache.clear();
  }

  public getLabelBackground(width: number, height: number): RenderedLabelBackground {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const key = `${w}x${h}:${this.theme.backgroundFill}:${this.theme.backgroundStroke}`;
    const cached = this.backgroundCache.get(key);
    if (cached) return cached;

    const created = this.createBackgroundCanvas(w, h);
    this.backgroundCache.set(key, created);
    this.pruneBackgroundCache();
    return created;
  }

  private pruneBackgroundCache(): void {
    if (this.backgroundCache.size <= this.maxBackgroundCacheSize) return;
    const oldestKey = this.backgroundCache.keys().next().value as string | undefined;
    if (!oldestKey) return;
    this.backgroundCache.delete(oldestKey);
  }

  private createBackgroundCanvas(width: number, height: number): RenderedLabelBackground {
    const canvas = document.createElement('canvas');
    const dpr = getRasterScale();
    canvas.width = Math.max(1, Math.ceil(width * dpr));
    canvas.height = Math.max(1, Math.ceil(height * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const radius = 3;
    const x = 0.5; // crisp 1px stroke alignment
    const y = 0.5;
    const w = Math.max(1, width - 1);
    const h = Math.max(1, height - 1);

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    ctx.fillStyle = this.theme.backgroundFill;
    ctx.fill();
    ctx.strokeStyle = this.theme.backgroundStroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    return { source: canvas, width, height };
  }

  /**
   * Creates a simple fallback image using canvas when SVG method fails
   */
  private async createFallbackImage(text: string): Promise<RenderedLabel> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // Supersampled device pixel ratio aware rendering for crisp text
    const dpr = getRasterScale();

    const fontSize = 12; // Keep consistent with main label renderer defaults
    const padding = 4;   // CSS pixels

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

    // Draw sharp text in CSS pixel space (scaled by DPR under the hood)
    ctx.fillStyle = this.theme.fallbackTextColor;
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

  private async renderLabel(text: string): Promise<RenderedLabel> {
    try {
      return await this.createImageFromText(text);
    } catch {
      try {
        return await this.createFallbackImage(text);
      } catch {
        return this.createTransparentLabel();
      }
    }
  }

  private createTransparentLabel(): RenderedLabel {
    const image = new Image();
    image.src = this.transparentPixel;
    return { image, width: 1, height: 1 };
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
      padding = 4,
      color = this.theme.textColor,
      backgroundColor = 'transparent',
      fontFamily = 'Arial, sans-serif',
      maxWidth = 250,
      maxLines = DEFAULT_MAX_LABEL_LINES,
      lineHeight = DEFAULT_LINE_HEIGHT,
    } = options;

    const baseText = (() => {
      const raw = text ?? '';
      if (raw.length <= HARD_MAX_LABEL_CHARS) return raw;
      // Guardrail against pathological long labels (keeps rendering bounded)
      return smartTruncateTeXGfm(raw, HARD_MAX_LABEL_CHARS).text;
    })();

    // Ensure MathJax is ready before snapshotting/caching labels that include TeX delimiters.
    if (looksLikeTeX(baseText)) {
      await getMathJaxReadyPromise();
    }

    // Inline TeX can appear awkward when forced to wrap due to a narrow max width.
    // Give math labels a bit more horizontal room by default to keep expressions inline.
    const effectiveMaxWidth = looksLikeTeX(baseText) ? Math.max(maxWidth, 320) : maxWidth;

    const maxAllowedHeightPx = Math.max(
      16,
      // Line budget should be based on the inner DOM box height (lines + padding),
      // not any potential MathJax overflow outside the box.
      Math.ceil(fontSize * lineHeight * Math.max(1, maxLines) + padding * 2 + 2)
    );

    const sanitizeAndHardenHtml = (markdownText: string): string => {
      let html = String(this.mdProcessor.processSync(markdownText));

      // Post-process HTML: ensure paragraph margins don't introduce extra spacing
      // Add inline style margin:0 to all <p> elements (sanitizer stripped styles earlier)
      if (html.includes('<p')) {
        html = html.replace(/<p(?![^>]*style=)/g, '<p style="margin:0"');
      }

      // Harden <a> tags: enforce target/rel and reject unsafe protocols
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      tmp.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href') || '';
        const isExternal = /^(https?:)?\/\//i.test(href);
        // Drop obviously unsafe protocols if somehow present
        if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
          a.removeAttribute('href');
        }
        if (isExternal) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      });

      return tmp.innerHTML;
    };

    const createContainer = (html: string): HTMLDivElement => {
      const container = document.createElement('div');
      container.style.cssText = `
        position: absolute;
        left: -9999px;
        top: -9999px;
        display: inline-block;
        box-sizing: border-box;
        padding: ${padding}px;
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        color: ${color};
        background-color: ${backgroundColor};
        border-radius: 0px;
        border: none;
        line-height: ${lineHeight};
        text-align: center;
        max-width: ${effectiveMaxWidth}px;
        overflow: visible;
        overflow-wrap: break-word;
        word-break: break-word;
        visibility: visible;
      `;
      container.innerHTML = html;
      document.body.appendChild(container);
      return container;
    };

    const typesetIfNeeded = async (container: HTMLDivElement, fallbackText: string) => {
      if (!looksLikeTeX(fallbackText)) return;
      if (!(window as any).MathJax?.typesetPromise) return;
      try {
        await (window as any).MathJax.typesetPromise([container]);
      } catch {
        throw new Error(`MathJax typeset failed for label: ${fallbackText}`);
      }
    };

    const stripMathJaxAssistiveMarkup = (container: HTMLDivElement) => {
      // MathJax adds hidden accessibility markup (<mjx-assistive-mml>).
      // Our snapshot pipeline embeds MathJax output into a standalone SVG foreignObject,
      // where MathJax’s global CSS may not be present. Strip it defensively.
      container.querySelectorAll('mjx-assistive-mml').forEach(el => el.remove());
    };

    const normalizeMathSizing = (container: HTMLDivElement) => {
      // MathJax SVG output can look slightly larger than adjacent text in a
      // foreignObject capture. Nudge it down to visually match surrounding
      // markdown text.
      container.querySelectorAll('mjx-container').forEach(el => {
        const node = el as HTMLElement;
        // In a standalone SVG foreignObject snapshot, MathJax's global CSS isn't
        // guaranteed to apply. Inline the critical layout so inline math stays
        // inline and display math stays block-level.
        const isDisplay = node.getAttribute('display') === 'true';
        if (isDisplay) {
          node.style.display = 'block';
          node.style.textAlign = 'center';
          node.style.margin = '0';
        } else {
          node.style.display = 'inline-block';
        }

        node.style.fontSize = '0.95em';
        node.style.lineHeight = '1';
      });
    };

    const dpr = getRasterScale();

    const typesetMarkdown = async (markdownText: string): Promise<TypesetResult> => {
      const html = sanitizeAndHardenHtml(markdownText);
      const container = createContainer(html);
      try {
        await typesetIfNeeded(container, markdownText);
        stripMathJaxAssistiveMarkup(container);
        normalizeMathSizing(container);

        // Ensure style/layout changes are reflected before we measure.
        void container.offsetHeight;

        // Wait for fonts to settle when available (prevents bbox drift).
        const fontsReady = (document as any).fonts?.ready;
        if (fontsReady && typeof fontsReady.then === 'function') {
          try { await fontsReady; } catch {}
        }

        const hasMath = container.querySelector('mjx-container') != null;

        const rect = container.getBoundingClientRect();
        const heightBox = Math.ceil(Math.max(rect.height, container.scrollHeight, container.offsetHeight));
        const widthBox = Math.ceil(Math.max(rect.width, container.scrollWidth, container.offsetWidth));

        const width = Math.max(20, widthBox);
        const height = Math.max(16, heightBox + (hasMath ? EXTRA_RENDER_GUTTER_BOTTOM_PX : 0));

        const contentHeight = Math.max(1, rect.height);
        const fits = heightBox <= maxAllowedHeightPx + 0.5;
        return { fits, htmlForSvg: container.innerHTML, contentHeight, width, height };
      } finally {
        const mj = (window as any).MathJax;
        if (mj?.typesetClear) {
          try { mj.typesetClear([container]); } catch {}
        }
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }
    };

    const svgStringForTypesetHtml = (htmlForSvg: string, width: number, height: number): string => {
      const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width * dpr}" height="${height * dpr}" viewBox="0 0 ${width} ${height}">
          <style>
            mjx-assistive-mml{display:none!important}
            mjx-container{display:inline-block;margin:0;padding:0}
            mjx-container[display="true"]{display:block;text-align:center;margin:0}
            mjx-container[jax="SVG"]>svg{overflow:visible;min-height:1px;min-width:1px}
          </style>
          <foreignObject x="0" y="0" width="${width}" height="${height}">
            <div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block; box-sizing:border-box; width:${width}px; height:${height}px; padding:${padding}px; font-family:${fontFamily}; font-size:${fontSize}px; color:${color}; line-height:${lineHeight}; text-align:center; max-width:${effectiveMaxWidth}px; background:transparent; border:none; overflow:visible; overflow-wrap:break-word; word-break:break-word;">
              ${htmlForSvg}
            </div>
          </foreignObject>
        </svg>`;

      return svgString;
    };

    const svgToImageElement = (svgString: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve(image);
        };
        image.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        image.src = url;
      });

    // First: attempt full render without truncation. This fixes cases where
    // formulas were previously chopped purely due to a character cap even
    // though wrapping would have fit them.
    try {
      const full = await typesetMarkdown(baseText);
      if (full.fits) {
        const svgString = svgStringForTypesetHtml(full.htmlForSvg, full.width, full.height);
        const image = await svgToImageElement(svgString);
        return { image, width: full.width, height: full.height };
      }
    } catch {
      return await this.createFallbackImage(baseText);
    }

    // Second: if it doesn't fit, search for the longest smart-truncated text
    // that fits within the max line budget.
    // If full text doesn't fit, search for the longest safe truncation that fits.
    let bestFit: TypesetResult | null = null;
    let low = 1;
    let high = baseText.length;
    let attempts = 0;

    while (low <= high && attempts < MAX_FIT_ATTEMPTS) {
      attempts++;
      const mid = Math.floor((low + high) / 2);
      const candidate = smartTruncateTeXGfm(baseText, mid).text;

      try {
        const measured = await typesetMarkdown(candidate);
        if (measured.fits) {
          bestFit = measured;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      } catch {
        high = mid - 1;
      }
    }

    if (bestFit) {
      const svgString = svgStringForTypesetHtml(bestFit.htmlForSvg, bestFit.width, bestFit.height);
      const image = await svgToImageElement(svgString);
      return { image, width: bestFit.width, height: bestFit.height };
    }

    // Last resort: fall back to the legacy truncation cap so we always render something.
    const legacy = smartTruncateTeXGfm(baseText, LEGACY_MAX_LABEL_CHARS).text;
    try {
      const measured = await typesetMarkdown(legacy);
      const svgString = svgStringForTypesetHtml(measured.htmlForSvg, measured.width, measured.height);
      const image = await svgToImageElement(svgString);
      return { image, width: measured.width, height: measured.height };
    } catch {}

    return await this.createFallbackImage(legacy);
  }

  /**
   * Manages cache size to prevent memory leaks.
   */
  private pruneCache(): void {
    if (this.cache.size > this.maxCacheSize) {
      // Simple strategy: delete the first (oldest) entry.
      const oldestKey = this.cache.keys().next().value as string;
      const oldestEntry = this.cache.get(oldestKey);
      if (oldestEntry) {
        this.revokeObjectURL(oldestEntry);
      }
      this.cache.delete(oldestKey as string);
    }
  }

  /**
   * Clears the entire cache and revokes all associated Blob URLs to free up memory.
   * This should be called when the graph structure changes or the component unmounts.
   */
  public clearCache(): void {
    this.renderEpoch++;
    this.cache.forEach(renderedLabel => this.revokeObjectURL(renderedLabel));
    this.cache.clear();
    this.queue = [];
    this.renderingInProgress.clear();
    this.backgroundCache.clear();
  }

  /**
   * Clears only cached labels that look like TeX, so they can be re-rendered
   * after MathJax becomes available/ready.
   */
  public invalidateMathLabels(): void {
    if (this.cache.size === 0) return;
    for (const [key, value] of this.cache.entries()) {
      if (!looksLikeTeX(key)) continue;
      this.revokeObjectURL(value);
      this.cache.delete(key);
    }
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
