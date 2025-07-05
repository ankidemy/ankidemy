// src/app/components/core/MathJaxWrapper.tsx
"use client";

import React, { ReactNode, memo, useState, useEffect } from 'react';
import { MathJax, MathJaxContext } from 'better-react-mathjax';

// Define typed MathJax configuration
interface MathJaxConfig {
  loader?: {
    load?: string[];
  };
  tex?: {
    packages?: string[] | { "[+]": string[] };
    inlineMath?: [string, string][];
    displayMath?: [string, string][];
    processEscapes?: boolean;
    processEnvironments?: boolean;
  };
  svg?: {
    fontCache?: "local" | "global" | "none";
  };
  startup?: {
    typeset?: boolean;
  };
  options?: {
    enableMenu?: boolean;
    renderActions?: any;
  };
}

// Comprehensive default configuration
const defaultConfig: MathJaxConfig = {
  loader: { load: ["[tex]/html", "[tex]/ams", "[tex]/noerrors", "[tex]/noundefined"] },
  tex: {
    packages: { "[+]": ["html", "ams", "noerrors", "noundefined"] },
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"]
    ],
    displayMath: [
      ["$$", "$$"],
      ["\\[", "\\]"]
    ],
    processEscapes: true,
    processEnvironments: true
  },
  svg: {
    fontCache: "global"
  },
  startup: {
    typeset: true
  },
  options: {
    enableMenu: false, // Disable the right-click menu for a cleaner UI
  }
};

interface MathJaxProviderProps {
  children: ReactNode;
  config?: MathJaxConfig;
}

interface MathJaxContentProps {
  children: ReactNode;
  className?: string;
  inline?: boolean;
  errorFallback?: ReactNode;
}

// Error boundary component for LaTeX rendering errors
class MathJaxErrorBoundary extends React.Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Provider component - memoized for performance
export const MathJaxProvider: React.FC<MathJaxProviderProps> = memo(({ 
  children, 
  config = defaultConfig 
}) => {
  return (
    <MathJaxContext config={config}>
      {children}
    </MathJaxContext>
  );
});
MathJaxProvider.displayName = 'MathJaxProvider';

// Content component with error handling
export const MathJaxContent: React.FC<MathJaxContentProps> = memo(({ 
  children,
  className = "",
  inline = false,
  errorFallback = <span className="text-red-500">Error rendering LaTeX</span>
}) => {
  return (
    <MathJaxErrorBoundary fallback={errorFallback}>
      <MathJax className={`${className} ${inline ? 'inline-block' : 'block'}`}>
        {children}
      </MathJax>
    </MathJaxErrorBoundary>
  );
});
MathJaxContent.displayName = 'MathJaxContent';

// Convenience components for specific use cases
export const InlineMath: React.FC<Omit<MathJaxContentProps, 'inline'>> = (props) => (
  <MathJaxContent {...props} inline={true} />
);
InlineMath.displayName = 'InlineMath';

export const BlockMath: React.FC<Omit<MathJaxContentProps, 'inline'>> = (props) => (
  <MathJaxContent {...props} inline={false} />
);
BlockMath.displayName = 'BlockMath';

// Enhanced LaTeX formatting utility
export const formatLaTeX = (text: string): string => {
  if (!text) return '';
  
  return text
    // Convert newlines to HTML breaks for proper display
    .replace(/\n\s*\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
    .replace(/\\n/g, '<br/>')
    // Fix common LaTeX errors
    .replace(/\\$/g, '\\\\$') // Escape dollar signs that follow backslashes
    .replace(/([^\\])\$\$/g, '$1\n$$') // Ensure display math has proper spacing
    .replace(/\$\$([^\n])/g, '$$\n$1'); // Ensure display math has proper spacing
};

// LaTeX sanitizer for user-generated content
export const sanitizeLatex = (text: string): string => {
  if (!text) return '';
  
  // Remove potentially dangerous LaTeX commands
  return text
    .replace(/\\(include|input|write|openout|closeout|loop|repeat|csname|endcsname)/g, '\\textbackslash$1');
};

// Hook for lazy-loading MathJax only when needed
export const useLazyMathJax = (shouldLoad: boolean = true): boolean => {
  const [loaded, setLoaded] = useState(false);
  
  useEffect(() => {
    if (shouldLoad && !loaded) {
      // MathJax will be loaded by the MathJaxContext when it's rendered
      setLoaded(true);
    }
  }, [shouldLoad, loaded]);
  
  return loaded;
};
