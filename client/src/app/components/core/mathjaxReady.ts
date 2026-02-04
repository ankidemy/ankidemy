// client/src/app/components/core/mathjaxReady.ts
// Small helper utilities for coordinating MathJax startup across non-DOM renderers.

export const MATHJAX_READY_EVENT = 'ankidemy:mathjax-ready';
export const MATHJAX_READY_FLAG = '__ANKIDEMY_MATHJAX_READY__';

let didAnnounceMathJaxReady = false;

export function announceMathJaxReadyOnce(): void {
  if (didAnnounceMathJaxReady) return;
  didAnnounceMathJaxReady = true;
  if (typeof window === 'undefined') return;

  try {
    (window as any)[MATHJAX_READY_FLAG] = true;
  } catch {}

  try {
    window.dispatchEvent(new Event(MATHJAX_READY_EVENT));
  } catch {}
}

export function isMathJaxReady(): boolean {
  if (typeof window === 'undefined') return false;
  const anyWindow = window as any;
  if (anyWindow?.[MATHJAX_READY_FLAG]) return true;
  return typeof anyWindow?.MathJax?.typesetPromise === 'function';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let mathJaxReadyPromise: Promise<void> | null = null;

export function getMathJaxReadyPromise(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (isMathJaxReady()) return Promise.resolve();
  if (mathJaxReadyPromise) return mathJaxReadyPromise;

  mathJaxReadyPromise = new Promise<void>((resolve) => {
    const markReady = () => {
      try {
        (window as any)[MATHJAX_READY_FLAG] = true;
      } catch {}
      resolve();
    };

    const onReady = () => {
      try {
        window.removeEventListener(MATHJAX_READY_EVENT, onReady);
      } catch {}
      markReady();
    };

    try {
      window.addEventListener(MATHJAX_READY_EVENT, onReady, { once: true });
    } catch {}

    const mj = (window as any)?.MathJax;
    const startupPromise = mj?.startup?.promise;
    if (startupPromise && typeof startupPromise.then === 'function') {
      startupPromise.then(onReady).catch(onReady);
      return;
    }

    if (typeof mj?.typesetPromise === 'function') {
      onReady();
    }
  });

  return mathJaxReadyPromise;
}

export async function waitForMathJaxReady(timeoutMs: number): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isMathJaxReady()) return true;
  await Promise.race([getMathJaxReadyPromise(), sleep(timeoutMs)]);
  return isMathJaxReady();
}

