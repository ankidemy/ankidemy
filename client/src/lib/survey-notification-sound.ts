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

export const playSurveyQueueNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime + 0.01;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.028, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    masterGain.connect(ctx.destination);

    const toneA = ctx.createOscillator();
    toneA.type = 'sine';
    toneA.frequency.setValueAtTime(784, now);
    toneA.frequency.exponentialRampToValueAtTime(659, now + 0.15);
    toneA.connect(masterGain);
    toneA.start(now);
    toneA.stop(now + 0.16);

    const toneBGain = ctx.createGain();
    toneBGain.gain.setValueAtTime(0.58, now + 0.17);
    toneBGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.33);
    toneBGain.connect(masterGain);

    const toneB = ctx.createOscillator();
    toneB.type = 'sine';
    toneB.frequency.setValueAtTime(988, now + 0.17);
    toneB.connect(toneBGain);
    toneB.start(now + 0.17);
    toneB.stop(now + 0.33);
  } catch {}
};

export const primeSurveyQueueNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {}
};
