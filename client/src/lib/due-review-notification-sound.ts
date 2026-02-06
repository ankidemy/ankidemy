let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContext) {
      audioContext = new AudioContextCtor();
    }
    return audioContext;
  } catch {
    return null;
  }
};

export const playDueReviewNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.01;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.024, now + 0.015);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    masterGain.connect(ctx.destination);

    const toneA = ctx.createOscillator();
    toneA.type = 'triangle';
    toneA.frequency.setValueAtTime(523.25, now);
    toneA.frequency.exponentialRampToValueAtTime(587.33, now + 0.09);
    toneA.connect(masterGain);
    toneA.start(now);
    toneA.stop(now + 0.1);

    const toneBGain = ctx.createGain();
    toneBGain.gain.setValueAtTime(0.52, now + 0.11);
    toneBGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    toneBGain.connect(masterGain);

    const toneB = ctx.createOscillator();
    toneB.type = 'triangle';
    toneB.frequency.setValueAtTime(659.25, now + 0.11);
    toneB.connect(toneBGain);
    toneB.start(now + 0.11);
    toneB.stop(now + 0.25);
  } catch {}
};

export const primeDueReviewNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {}
};
