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
    masterGain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
    masterGain.gain.setValueAtTime(0.075, now + 0.42);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);
    masterGain.connect(ctx.destination);

    [
      { frequency: 523.25, offset: 0, duration: 0.34 },
      { frequency: 659.25, offset: 0.16, duration: 0.4 },
      { frequency: 783.99, offset: 0.34, duration: 0.46 },
    ].forEach(({ frequency, offset, duration }) => {
      const toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(0.0001, now + offset);
      toneGain.gain.exponentialRampToValueAtTime(0.72, now + offset + 0.018);
      toneGain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      toneGain.connect(masterGain);

      const tone = ctx.createOscillator();
      tone.type = 'sine';
      tone.frequency.setValueAtTime(frequency, now + offset);
      tone.connect(toneGain);
      tone.start(now + offset);
      tone.stop(now + offset + duration);
    });
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
