export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MAX_INTERVAL = 180; // cap at 6 months — even known words come back

export const MODE_MULTIPLIER: Record<string, number> = {
  dictation: 1.3,
  context: 1.1,
  flashcard: 1.0,
  choice: 0.8,
};

const STEP_DURATIONS = [10 * 60_000, HOUR_MS, DAY_MS];

// Workload smoothing: spread graduated cards' due-times by ±15% so a bulk
// import doesn't all come back due on the same calendar day. Applied only
// to graduated `got_it`/`uncertain` outcomes (lapses skip jitter — a failed
// card needs to come back soon, not be randomly delayed). The reported
// `intervalDays` keeps its rounded number; only the actual `nextReview`
// timestamp shifts.
const JITTER_RATIO = 0.15;
function jitterMs(intervalDays: number): number {
  if (intervalDays < 1) return 0;
  const offset = (Math.random() * 2 - 1) * JITTER_RATIO;
  return intervalDays * DAY_MS * offset;
}

export interface SM2Input {
  easeFactor: number;
  intervalDays: number;
  learningStep: number;
  updatedAt: number;
}

export interface SM2Output {
  easeFactor: number;
  intervalDays: number;
  nextReview: number;
  learningStep: number;
}

export type ReviewQuality = 'got_it' | 'uncertain' | 'still_learning';

/**
 * Pure SM-2 spaced-repetition calculation.
 * No side effects — takes current card state + answer and returns next state.
 */
export function calculateNextReview(
  input: SM2Input,
  quality: ReviewQuality,
  mode: string,
  now: number,
): SM2Output {
  const prevInterval = input.intervalDays || 1;
  const mult = MODE_MULTIPLIER[mode] ?? 1.0;
  let newInterval: number;
  let newEase: number;
  let nextReview: number;
  let newStep = input.learningStep;

  // Learning steps: 0→10min, 1→1hr, 2→1day, 3→graduate(3days)
  const inLearning = input.learningStep < 3 && input.intervalDays <= 1;

  if (quality === 'got_it') {
    if (inLearning) {
      newEase = input.easeFactor;
      const step = input.learningStep;
      if (step < 2) {
        newInterval = 0;
        nextReview = now + Math.round(STEP_DURATIONS[step] * mult);
        newStep = step + 1;
      } else if (step === 2) {
        newInterval = 1;
        nextReview = now + Math.round(DAY_MS * mult);
        newStep = 3;
      } else {
        // First graduation from learning steps. Jitter critical here: this
        // is where a bulk import (50 cards added Monday) would otherwise
        // all land due on the same day → review storm.
        newInterval = Math.round(3 * mult);
        nextReview = now + newInterval * DAY_MS + jitterMs(newInterval);
        newEase = Math.min(3.0, input.easeFactor + 0.1);
        newStep = 3;
      }
    } else {
      // Graduated card. Use max(scheduled, actual elapsed) so late reviews
      // get growth credit (memory must have been stronger than predicted),
      // but early reviews don't shrink the interval.
      const elapsed = (now - input.updatedAt) / DAY_MS;
      const baseInterval = Math.max(prevInterval, elapsed);
      newInterval = Math.round(baseInterval * input.easeFactor * mult);
      newInterval = Math.min(newInterval, MAX_INTERVAL);
      newEase = Math.min(3.0, input.easeFactor + 0.1);
      nextReview = now + newInterval * DAY_MS + jitterMs(newInterval);
    }
  } else if (quality === 'uncertain') {
    if (inLearning) {
      const step = input.learningStep;
      const repeatMs = step < STEP_DURATIONS.length ? STEP_DURATIONS[step] : DAY_MS;
      newInterval = input.intervalDays;
      nextReview = now + Math.round(repeatMs * mult);
      newEase = Math.max(1.3, input.easeFactor - 0.1);
    } else {
      // Graduated "Hard": don't shrink — just slow growth via lower ease.
      // Anki-style: keep current interval, ease −0.1.
      newInterval = Math.min(prevInterval, MAX_INTERVAL);
      newEase = Math.max(1.3, input.easeFactor - 0.1);
      nextReview = now + newInterval * DAY_MS + jitterMs(newInterval);
    }
  } else {
    // still_learning
    if (inLearning) {
      // Card was still in learning steps — full reset is appropriate.
      newInterval = 0;
      newEase = Math.max(1.3, input.easeFactor - 0.2);
      nextReview = now;
      newStep = 0;
    } else {
      // Graduated card lapse: preserve half the interval and stay graduated.
      // Resetting to learning step 0 erases weeks of progress for one slip.
      newInterval = Math.max(1, Math.round(prevInterval * 0.5));
      newInterval = Math.min(newInterval, MAX_INTERVAL);
      newEase = Math.max(1.3, input.easeFactor - 0.15);
      nextReview = now + newInterval * DAY_MS;
      newStep = input.learningStep;
    }
  }

  return {
    easeFactor: newEase,
    intervalDays: newInterval,
    nextReview,
    learningStep: newStep,
  };
}
