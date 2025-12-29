export type DotCodeParts = {
  major: number;
  minor: number;
  patch: number;
};

const parseDotCode = (code: string): DotCodeParts | null => {
  const match = code.match(/^(\d+)\.(\d)\.(\d)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
};

export const getNextDotCode = (existingCodes: Set<string>): string => {
  let best: DotCodeParts | null = null;
  existingCodes.forEach(code => {
    const parsed = parseDotCode(code);
    if (!parsed) return;
    if (
      !best ||
      parsed.major > best.major ||
      (parsed.major === best.major && parsed.minor > best.minor) ||
      (parsed.major === best.major && parsed.minor === best.minor && parsed.patch > best.patch)
    ) {
      best = parsed;
    }
  });

  if (!best) return '0.0.0';

  let major = best.major;
  let minor = best.minor;
  let patch = best.patch;

  const increment = () => {
    patch += 1;
    if (patch > 9) {
      patch = 0;
      minor += 1;
    }
    if (minor > 9) {
      minor = 0;
      major += 1;
    }
  };

  increment();
  let candidate = `${major}.${minor}.${patch}`;
  while (existingCodes.has(candidate)) {
    increment();
    candidate = `${major}.${minor}.${patch}`;
  }
  return candidate;
};

export const getNextExerciseCode = (existingCodes: Set<string>): string => {
  let bestNumber: number | null = null;
  existingCodes.forEach(code => {
    const match = code.match(/^E(\d+)$/);
    if (!match) return;
    const value = parseInt(match[1], 10);
    if (Number.isNaN(value)) return;
    if (bestNumber === null || value > bestNumber) {
      bestNumber = value;
    }
  });

  let nextNumber = bestNumber !== null ? bestNumber + 1 : 1;
  let candidate = `E${nextNumber}`;
  while (existingCodes.has(candidate)) {
    nextNumber += 1;
    candidate = `E${nextNumber}`;
  }
  return candidate;
};
