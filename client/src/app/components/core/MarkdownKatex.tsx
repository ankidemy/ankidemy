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
 * Block Markdown renderer with KaTeX for math and GFM enabled.
 * - Raw HTML is disabled (safe by default in react-markdown)
 * - Code/pre blocks are untouched by math parsing
 */
export const MarkdownKatex: React.FC<CommonProps> = ({ children, className = "", prose = false }) => {
  return (
    <div className={`${prose ? "prose prose-sm" : ""} ${className}`.trim()}>
      <ReactMarkdown
        // Security: do not allow raw HTML from user input
        skipHtml
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex as any, { macros: latexMacrosKatex }]]}
        // Keep styling lean; typography can be adjusted later globally
        components={{
          // Keep paragraphs and lists compact for our cards
          p: ({ node, ...props }) => <p {...props} />,
          code: ({ inline, className, children, ...props }: React.ComponentProps<"code"> & ExtraProps & { inline?: boolean }) => {
            const c = String(children).replace(/\n$/, "");
            if (inline) return <code className={className}>{c}</code>;
            return (
              <pre className="rounded bg-gray-100 border border-gray-200 p-2 overflow-auto text-sm">
                <code className={className} {...props}>{c}</code>
              </pre>
            );
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto"><table className="table-auto w-full" {...props} /></div>
          ),
          a: ({ node, href, ...props }) => {
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
        {children || ""}
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
          p: ({ node, ...props }) => <span {...props} />,
          a: ({ node, href, ...props }) => {
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
          ul: ({ node, ...props }) => <span {...props} />,
          ol: ({ node, ...props }) => <span {...props} />,
          table: ({ node, ...props }) => <span {...props} />,
          code: ({ inline, className, children, ...props }: React.ComponentProps<"code"> & ExtraProps & { inline?: boolean }) => (
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
