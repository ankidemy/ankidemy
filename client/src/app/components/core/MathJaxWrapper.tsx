// File: src/app/components/core/MathJaxWrapper.tsx
"use client";

import React, { ReactNode, memo, useEffect, useRef, useState } from 'react';
import { MathJaxContext } from 'better-react-mathjax';
import type { MathJaxConfig } from '@mathjax/src/cjs/components/startup.js';
import { latexMacrosMathJax } from './latexMacros';
import { announceMathJaxReadyOnce } from './mathjaxReady';

const MATHJAX_V4_SVG_SRC =
  'https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js';

// ---- Default config ----
const defaultConfig: MathJaxConfig = {
  loader: { load: ['[tex]/noerrors'] },
  tex: {
    // Ensure common TeX packages are enabled without relying on runtime loading.
    packages: { '[+]': ['ams', 'noerrors', 'noundefined'] },
    inlineMath: [["$", "$"], ["\\(", "\\)"]],
    displayMath: [["$$", "$$"], ["\\[", "\\]"]],
    processEscapes: true,
    processEnvironments: true,
    macros: latexMacrosMathJax,
  },
  // Labels are captured into standalone SVG/PNG images; don't rely on a global glyph cache.
  svg: { fontCache: 'local' },
  // Labels call `MathJax.typesetPromise([el])` manually as needed.
  startup: {
    typeset: false,
    loadAllFontFiles: false,
    ready: () => {
      const mj = (window as any)?.MathJax;
      if (mj?.startup?.defaultReady) mj.startup.defaultReady();
      announceMathJaxReadyOnce();
    },
  },
  options: {
    enableMenu: false,
    // Assistive MathML can become visible when MathJax output is snapshotted into an SVG foreignObject.
    // Disable it globally; graph labels are images anyway.
    renderActions: { assistiveMml: [] },
  },
};

interface MathJaxProviderProps { children: ReactNode; config?: MathJaxConfig }

// ---- Provider ----
export const MathJaxProvider: React.FC<MathJaxProviderProps> = memo(({ children, config = defaultConfig }) => {
  // Silence noisy unhandled rejections coming from MathJax internals during hot reload/unmount races
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = (e?.reason && (e.reason.message || String(e.reason))) || '';
      if (typeof msg === 'string' && msg.includes('Typesetting failed')) {
        e.preventDefault?.();
        // Still log for diagnostics without crashing overlay
        console.warn('[MathJax] Suppressed async typeset error:', e.reason);
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  // If MathJax is already loaded (e.g. route transitions), announce readiness so renderers can proceed.
  useEffect(() => {
    const mj = (window as any)?.MathJax;
    if (mj && typeof mj.typesetPromise === 'function') {
      announceMathJaxReadyOnce();
    }
  }, []);

  return (
    <MathJaxContext
      version={4}
      src={MATHJAX_V4_SVG_SRC}
      config={config}
    >
      {children}
    </MathJaxContext>
  );
});
MathJaxProvider.displayName = 'MathJaxProvider';

// ---- Safe, manual typesetting (no <MathJax> component) ----
interface MathTextProps {
  text: string;
  inline?: boolean;
  className?: string;
  errorFallback?: ReactNode;
}

export const MathText: React.FC<MathTextProps> = ({ text, inline = false, className = '', errorFallback = <span className="text-red-500">Error rendering LaTeX</span> }) => {
  const ref = useRef<HTMLSpanElement | HTMLDivElement>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
    const el = ref.current;
    if (!el) return;

    // Reset previous content before typesetting to avoid nested markup
    el.innerHTML = '';
    el.append(document.createTextNode(text ?? ''));

    const anyWindow = window as any;
    const mj = anyWindow?.MathJax;

    if (!mj || typeof mj.typesetPromise !== 'function') {
      // MathJax not ready yet; try again on next tick
      const id = requestAnimationFrame(() => {
        const mj2 = (window as any)?.MathJax;
        if (mj2 && typeof mj2.typesetPromise === 'function' && ref.current) {
          mj2.typesetPromise([ref.current]).catch((err: any) => {
            console.warn('[MathJax] Typeset error (raf retry):', err);
            setErrored(true);
          });
        }
      });
      return () => cancelAnimationFrame(id);
    }

    let cancelled = false;
    mj.typesetPromise([el]).catch((err: any) => {
      if (!cancelled) {
        console.warn('[MathJax] Typeset error:', err);
        setErrored(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  const Tag: any = inline ? 'span' : 'div';
  if (errored) return <>{errorFallback}</>;
  return <Tag ref={ref} className={`${className} ${inline ? 'inline-block' : 'block'}`} />;
};

// Convenience wrappers
export const InlineMath: React.FC<Omit<MathTextProps, 'inline'>> = (props) => <MathText {...props} inline={true} />;
export const BlockMath: React.FC<Omit<MathTextProps, 'inline'>> = (props) => <MathText {...props} inline={false} />;

// Utilities (kept from previous API)
export const formatLaTeX = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\n\s*\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
    .replace(/\\n/g, '<br/>')
    .replace(/\\$/g, '\\\\$')
    .replace(/([^\\])\$\$/g, '$1\n$$')
    .replace(/\$\$([^\n])/g, '$$\n$1');
};

export const sanitizeLatex = (text: string): string => {
  if (!text) return '';
  return text.replace(/\\(include|input|write|openout|closeout|loop|repeat|csname|endcsname)/g, '\\textbackslash$1');
};

// (Deprecated wrapper MathJaxContent removed. Use MathText/InlineMath/BlockMath.)
