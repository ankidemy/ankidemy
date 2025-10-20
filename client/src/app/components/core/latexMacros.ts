// Shared LaTeX macros for KaTeX and MathJax
// This ensures consistent rendering across all surfaces (titles and graph labels)

/**
 * Macros for KaTeX (used in titles - draggable window header + left panel)
 * Format: { macroName: expansion }
 */
export const latexMacrosKatex: Record<string, string> = {
  // Common mathematical sets
  '\\RR': '\\mathbb{R}',
  '\\NN': '\\mathbb{N}',
  '\\ZZ': '\\mathbb{Z}',
  '\\QQ': '\\mathbb{Q}',
  '\\CC': '\\mathbb{C}',

  // Vector notation
  '\\vect': '\\mathbf{#1}',

  // Absolute value and norms
  '\\abs': '\\left\\lvert #1 \\right\\rvert',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',

  // Sets and inner products
  '\\set': '\\left\\{ #1 \\right\\}',
  '\\ip': '\\left\\langle #1, #2 \\right\\rangle',
};

/**
 * Macros for MathJax (used in graph labels)
 * Format: { macroName: expansion } or { macroName: [expansion, argCount] }
 * Use array format for macros with arguments
 */
export const latexMacrosMathJax: Record<string, string | [string, number]> = {
  // Common mathematical sets
  RR: '\\mathbb{R}',
  NN: '\\mathbb{N}',
  ZZ: '\\mathbb{Z}',
  QQ: '\\mathbb{Q}',
  CC: '\\mathbb{C}',

  // Vector notation (1 argument)
  vect: ['\\mathbf{#1}', 1],

  // Absolute value and norms (1 argument each)
  abs: ['\\left\\lvert #1 \\right\\rvert', 1],
  norm: ['\\left\\lVert #1 \\right\\rVert', 1],

  // Sets (1 argument)
  set: ['\\left\\{ #1 \\right\\}', 1],

  // Inner products (2 arguments)
  ip: ['\\left\\langle #1, #2 \\right\\rangle', 2],
};
