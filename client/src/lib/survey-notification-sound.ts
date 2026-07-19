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
    masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.025);
    masterGain.gain.setValueAtTime(0.08, now + 0.38);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
    masterGain.connect(ctx.destination);

    [
      { frequency: 587.33, offset: 0, duration: 0.36 },
      { frequency: 739.99, offset: 0.18, duration: 0.4 },
      { frequency: 880, offset: 0.34, duration: 0.42 },
    ].forEach(({ frequency, offset, duration }) => {
      const toneGain = ctx.createGain();
      toneGain.gain.setValueAtTime(0.0001, now + offset);
      toneGain.gain.exponentialRampToValueAtTime(0.68, now + offset + 0.02);
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

export const primeSurveyQueueNotificationSound = () => {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  } catch {}
};
