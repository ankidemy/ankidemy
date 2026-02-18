"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import type { ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { latexMacrosKatex } from "./latexMacros";

type CommonProps = {
  className?: string;
  children: string;
  prose?: boolean; // toggles typography wrapper easily later
};

/**
 * Normalizes display math delimiters to inline math for title rendering.
 * Converts $...$ to $...$ and \[...\] to \(...\), preserving content.
 * Collapses multiple newlines and whitespace to single spaces.
 */
export function normalizeToInlineMath(text: string): string {
  if (!text) return '';

  let result = text;

  // Replace display math delimiters $$...$$ with inline $...$
  // Handle multi-line display math by replacing internal newlines with spaces
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return `$${normalized}$`;
  });

  // Replace \[...\] with \(...\)
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_match, content) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return `\\(${normalized}\\)`;
  });

  // Collapse runs of whitespace/newlines to single spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Normalizes display math delimiters so $$...$$ renders as block math
 * even when authored inline (same line). Skips code fences and inline code.
 */
export function normalizeDisplayMathBlocks(text: string): string {
  if (!text) return '';

  let result = '';
  let i = 0;
  let insideFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let insideInlineCode = false;
  let inlineCodeLen = 0;

  const isLineStart = (idx: number) => idx === 0 || text[idx - 1] === '\n';
  const isOnlyWhitespace = (value: string) => /^\s*$/.test(value);

  while (i < text.length) {
    // Detect fenced code blocks at line start (``` or ~~~)
    if (!insideInlineCode && isLineStart(i)) {
      let j = i;
      while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j += 1;
      const fenceStart = text.slice(j);
      const fenceMatch = fenceStart.match(/^(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        if (!insideFence) {
          insideFence = true;
          fenceChar = marker[0];
          fenceLen = marker.length;
        } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
          insideFence = false;
          fenceChar = '';
          fenceLen = 0;
        }
        result += text.slice(i, j) + marker;
        i = j + marker.length;
        continue;
      }
    }

    if (!insideFence) {
      // Detect inline code spans using backticks
      if (text[i] === '`') {
        let j = i;
        while (j < text.length && text[j] === '`') j += 1;
        const runLen = j - i;
        if (!insideInlineCode) {
          insideInlineCode = true;
          inlineCodeLen = runLen;
        } else if (runLen === inlineCodeLen) {
          insideInlineCode = false;
          inlineCodeLen = 0;
        }
        result += text.slice(i, j);
        i = j;
        continue;
      }
    }

    if (!insideFence && !insideInlineCode && text[i] === '$' && text[i + 1] === '$') {
      const lineStart = text.lastIndexOf('\n', i - 1) + 1;
      const lineEndIdx = text.indexOf('\n', i + 2);
      const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
      const before = text.slice(lineStart, i);
      const after = text.slice(i + 2, lineEnd);
      const beforeIsWhitespace = isOnlyWhitespace(before);
      const afterIsWhitespace = isOnlyWhitespace(after);

      if (!beforeIsWhitespace) result += '\n';
      result += '$$';
      if (!afterIsWhitespace) result += '\n';
      i += 2;
      continue;
    }

    result += text[i];
    i += 1;
  }

  return result;
}

/**
 * Block Markdown renderer with KaTeX for math and GFM enabled.
 * - Raw HTML is disabled (safe by default in react-markdown)
 * - Code/pre blocks are untouched by math parsing
 */
export const MarkdownKatex: React.FC<CommonProps> = ({ children, className = "", prose = false }) => {
  const processedChildren = normalizeDisplayMathBlocks(children);
  return (
    <div className={`kg-font-markdown ${prose ? "prose prose-sm" : ""} ${className}`.trim()}>
      <ReactMarkdown
        // Security: do not allow raw HTML from user input
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex as any, { macros: latexMacrosKatex }]]}
        // Keep styling lean; typography can be adjusted later globally
        components={{
          // Keep paragraphs and lists compact for our cards
          p: ({ node: _node, ...props }) => <p {...props} />,
          // Never emit <pre> from code; block styling handled by <pre> below.
          code: ({ className, children, ...props }: React.ComponentProps<"code"> & ExtraProps) => (
            <code className={className} {...props}>{String(children).replace(/\n$/, "")}</code>
          ),
          // Style block code containers created by react-markdown for fenced code blocks.
          pre: ({ node: _node, children, ...props }) => (
            <pre className="rounded bg-gray-100 border border-gray-200 p-2 overflow-auto text-sm" {...props}>
              {children}
            </pre>
          ),
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto"><table className="table-auto w-full" {...props} /></div>
          ),
          a: ({ node: _node, href, ...props }) => {
            const isExternal = typeof href === 'string' && /^(?:[a-z]+:)?\/\//i.test(href);
            return (
              <a
                href={href}
                className="text-blue-600 underline"
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              />
            );
          },
        }}
      >
        {processedChildren || ""}
      </ReactMarkdown>
    </div>
  );
};

/**
 * Inline renderer suitable for short text (titles/labels) that may include $...$.
 * Renders markdown paragraphs as spans to stay inline.
 */
export const InlineMarkdownKatex: React.FC<CommonProps & { enforceInlineMath?: boolean }> = ({
  children,
  className = "",
  enforceInlineMath = true
}) => {
  const processedChildren = enforceInlineMath ? normalizeToInlineMath(children) : children;

  return (
    <span className={className}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex as any, { macros: latexMacrosKatex }]]}
        components={{
          p: ({ node: _node, ...props }) => <span {...props} />,
          a: ({ node: _node, href, ...props }) => {
            const isExternal = typeof href === 'string' && /^(?:[a-z]+:)?\/\//i.test(href);
            return (
              <a
                href={href}
                className="text-blue-600 underline"
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              />
            );
          },
          // Avoid block elements in inline context
          ul: ({ node: _node, ...props }) => <span {...props} />,
          ol: ({ node: _node, ...props }) => <span {...props} />,
          table: ({ node: _node, ...props }) => <span {...props} />,
          code: ({ inline: _inline, className, children, ...props }: React.ComponentProps<"code"> & ExtraProps & { inline?: boolean }) => (
            <code className={className} {...props}>{String(children).replace(/\n$/, "")}</code>
          ),
        }}
      >
        {processedChildren || ""}
      </ReactMarkdown>
    </span>
  );
};

export default MarkdownKatex;
