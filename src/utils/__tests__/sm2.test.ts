import {
  calculateNextReview,
  DAY_MS,
  HOUR_MS,
  MAX_INTERVAL,
  MODE_MULTIPLIER,
  type SM2Input,
} from '../sm2';

const NOW = 1_700_000_000_000;

function makeInput(overrides: Partial<SM2Input> = {}): SM2Input {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    learningStep: 0,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('calculateNextReview', () => {
  describe('learning steps progression with got_it', () => {
    it('advances from step 0 to step 1', () => {
      const result = calculateNextReview(makeInput({ learningStep: 0 }), 'got_it', 'flashcard', NOW);
      expect(result.learningStep).toBe(1);
      expect(result.intervalDays).toBe(0);
    });

    it('advances from step 1 to step 2', () => {
      const result = calculateNextReview(makeInput({ learningStep: 1 }), 'got_it', 'flashcard', NOW);
      expect(result.learningStep).toBe(2);
      expect(result.intervalDays).toBe(0);
    });

    it('advances from step 2 to step 3 (graduation)', () => {
      const result = calculateNextReview(makeInput({ learningStep: 2 }), 'got_it', 'flashcard', NOW);
      expect(result.learningStep).toBe(3);
      expect(result.intervalDays).toBe(1);
    });

    it('full progression: 0 -> 1 -> 2 -> 3', () => {
      let input = makeInput({ learningStep: 0 });
      let result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.learningStep).toBe(1);

      input = makeInput({ learningStep: result.learningStep, intervalDays: result.intervalDays, updatedAt: result.nextReview });
      result = calculateNextReview(input, 'got_it', 'flashcard', result.nextReview);
      expect(result.learningStep).toBe(2);

      input = makeInput({ learningStep: result.learningStep, intervalDays: result.intervalDays, updatedAt: result.nextReview });
      result = calculateNextReview(input, 'got_it', 'flashcard', result.nextReview);
      expect(result.learningStep).toBe(3);
    });
  });

  describe('learning step durations', () => {
    it('step 0 schedules review in 10 minutes', () => {
      const result = calculateNextReview(makeInput({ learningStep: 0 }), 'got_it', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + 10 * 60_000);
    });

    it('step 1 schedules review in 1 hour', () => {
      const result = calculateNextReview(makeInput({ learningStep: 1 }), 'got_it', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + HOUR_MS);
    });

    it('step 2 schedules review in 1 day', () => {
      const result = calculateNextReview(makeInput({ learningStep: 2 }), 'got_it', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + DAY_MS);
    });
  });

  describe('graduation', () => {
    it('step 2 -> 3 sets intervalDays to 1', () => {
      const result = calculateNextReview(makeInput({ learningStep: 2 }), 'got_it', 'flashcard', NOW);
      expect(result.learningStep).toBe(3);
      expect(result.intervalDays).toBe(1);
      expect(result.nextReview).toBe(NOW + DAY_MS);
    });

    it('preserves ease factor during learning steps', () => {
      const input = makeInput({ learningStep: 0, easeFactor: 2.5 });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.easeFactor).toBe(2.5);
    });
  });

  describe('graduated card intervals (got_it)', () => {
    it('increases interval by ease factor', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 5,
        easeFactor: 2.5,
        updatedAt: NOW - 5 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.intervalDays).toBe(Math.round(5 * 2.5));
      expect(result.nextReview).toBe(NOW + result.intervalDays * DAY_MS);
    });

    it('increases ease factor by 0.1 on got_it', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 5,
        easeFactor: 2.5,
        updatedAt: NOW - 5 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.6);
    });
  });

  describe('mode multipliers', () => {
    it('dictation gives 1.3x interval in learning step 0', () => {
      const result = calculateNextReview(makeInput({ learningStep: 0 }), 'got_it', 'dictation', NOW);
      expect(result.nextReview).toBe(NOW + Math.round(10 * 60_000 * 1.3));
    });

    it('choice gives 0.8x interval in learning step 0', () => {
      const result = calculateNextReview(makeInput({ learningStep: 0 }), 'got_it', 'choice', NOW);
      expect(result.nextReview).toBe(NOW + Math.round(10 * 60_000 * 0.8));
    });

    it('context gives 1.1x interval', () => {
      const result = calculateNextReview(makeInput({ learningStep: 0 }), 'got_it', 'context', NOW);
      expect(result.nextReview).toBe(NOW + Math.round(10 * 60_000 * 1.1));
    });

    it('dictation multiplier applies to graduated interval', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.0,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const flashResult = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      const dictResult = calculateNextReview(input, 'got_it', 'dictation', NOW);
      expect(dictResult.intervalDays).toBe(Math.round(10 * 2.0 * 1.3));
      expect(flashResult.intervalDays).toBe(Math.round(10 * 2.0 * 1.0));
    });
  });

  describe('ease factor adjustment', () => {
    it('got_it increases ease by 0.1', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 2.0, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.1);
    });

    it('uncertain decreases ease by 0.1', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 2.0, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(1.9);
    });

    it('still_learning on graduated card decreases ease by 0.15', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 2.0, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(1.85);
    });
  });

  describe('ease factor bounds', () => {
    it('never goes below 1.3', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 1.3, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.easeFactor).toBe(1.3);
    });

    it('never goes below 1.3 with uncertain', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 1.3, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.easeFactor).toBe(1.3);
    });

    it('never exceeds 3.0', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 3.0, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.easeFactor).toBe(3.0);
    });

    it('caps at 3.0 when approaching from 2.95', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 5, easeFactor: 2.95, updatedAt: NOW - 5 * DAY_MS });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.easeFactor).toBe(3.0);
    });
  });

  describe('max interval cap', () => {
    it('caps interval at 180 days', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 100,
        easeFactor: 2.5,
        updatedAt: NOW - 100 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.intervalDays).toBe(MAX_INTERVAL);
    });

    it('does not exceed 180 even with high ease and dictation mode', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 150,
        easeFactor: 3.0,
        updatedAt: NOW - 150 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'dictation', NOW);
      expect(result.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL);
    });

    it('caps uncertain graduated interval at 180', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 500,
        easeFactor: 2.5,
        updatedAt: NOW - 500 * DAY_MS,
      });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.intervalDays).toBeLessThanOrEqual(MAX_INTERVAL);
    });
  });

  describe('still_learning resets', () => {
    it('resets to step 0 and interval 0', () => {
      const input = makeInput({ learningStep: 2, intervalDays: 1, easeFactor: 2.5 });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.learningStep).toBe(0);
      expect(result.intervalDays).toBe(0);
    });

    it('sets nextReview to now', () => {
      const input = makeInput({ learningStep: 1 });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW);
    });

    it('keeps graduated card graduated and halves the interval', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 30, easeFactor: 2.5, updatedAt: NOW - 30 * DAY_MS });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.learningStep).toBe(3);
      expect(result.intervalDays).toBe(15);
      expect(result.nextReview).toBe(NOW + 15 * DAY_MS);
    });

    it('floors graduated lapse interval at 1 day', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 1, easeFactor: 2.5, updatedAt: NOW - DAY_MS });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.intervalDays).toBeGreaterThanOrEqual(1);
    });

    it('decreases ease factor by 0.15 for graduated lapse', () => {
      const input = makeInput({ learningStep: 3, intervalDays: 10, easeFactor: 2.5, updatedAt: NOW - 10 * DAY_MS });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.35);
    });

    it('decreases ease factor by 0.2 for in-learning still_learning', () => {
      const input = makeInput({ learningStep: 1, intervalDays: 0, easeFactor: 2.5 });
      const result = calculateNextReview(input, 'still_learning', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.3);
    });
  });

  describe('uncertain in learning', () => {
    it('repeats current step 0 duration (10 min)', () => {
      const input = makeInput({ learningStep: 0, intervalDays: 0 });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + 10 * 60_000);
      expect(result.learningStep).toBe(0);
      expect(result.intervalDays).toBe(0);
    });

    it('repeats current step 1 duration (1 hr)', () => {
      const input = makeInput({ learningStep: 1, intervalDays: 0 });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + HOUR_MS);
      expect(result.learningStep).toBe(1);
    });

    it('repeats current step 2 duration (1 day)', () => {
      const input = makeInput({ learningStep: 2, intervalDays: 1 });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.nextReview).toBe(NOW + DAY_MS);
      expect(result.learningStep).toBe(2);
    });

    it('decreases ease factor in learning', () => {
      const input = makeInput({ learningStep: 0, easeFactor: 2.5 });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.4);
    });

    it('applies mode multiplier to step duration', () => {
      const input = makeInput({ learningStep: 0 });
      const result = calculateNextReview(input, 'uncertain', 'dictation', NOW);
      expect(result.nextReview).toBe(NOW + Math.round(10 * 60_000 * 1.3));
    });
  });

  describe('uncertain graduated', () => {
    it('keeps interval unchanged (Anki-style Hard)', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.5,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.intervalDays).toBe(10);
    });

    it('decreases ease by 0.1', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.5,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const result = calculateNextReview(input, 'uncertain', 'flashcard', NOW);
      expect(result.easeFactor).toBeCloseTo(2.4);
    });

    it('does not apply mode multiplier (interval unchanged)', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.5,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const result = calculateNextReview(input, 'uncertain', 'dictation', NOW);
      expect(result.intervalDays).toBe(10);
    });
  });

  describe('elapsed-time growth credit', () => {
    it('uses actual elapsed time when greater than scheduled interval', () => {
      const elapsedDays = 8;
      const input = makeInput({
        learningStep: 3,
        intervalDays: 5,
        easeFactor: 2.0,
        updatedAt: NOW - elapsedDays * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.intervalDays).toBe(Math.round(elapsedDays * 2.0));
    });

    it('gives full lateness credit (no cap below MAX_INTERVAL)', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 5,
        easeFactor: 2.0,
        updatedAt: NOW - 60 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      // 60 elapsed days × ease 2.0 = 120 — uncapped (still under MAX 180)
      expect(result.intervalDays).toBe(120);
    });

    it('uses prevInterval when elapsed is less than prevInterval', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.0,
        updatedAt: NOW - 3 * DAY_MS,
      });
      const result = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      expect(result.intervalDays).toBe(Math.round(10 * 2.0));
    });
  });

  describe('unknown mode defaults', () => {
    it('defaults mode multiplier to 1.0 for unknown mode', () => {
      const input = makeInput({ learningStep: 0 });
      const flashResult = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      const unknownResult = calculateNextReview(input, 'got_it', 'unknown_mode', NOW);
      expect(unknownResult.nextReview).toBe(flashResult.nextReview);
    });

    it('MODE_MULTIPLIER for flashcard is 1.0', () => {
      expect(MODE_MULTIPLIER['flashcard']).toBe(1.0);
    });

    it('unknown mode produces same result as flashcard for graduated cards', () => {
      const input = makeInput({
        learningStep: 3,
        intervalDays: 10,
        easeFactor: 2.5,
        updatedAt: NOW - 10 * DAY_MS,
      });
      const flashResult = calculateNextReview(input, 'got_it', 'flashcard', NOW);
      const unknownResult = calculateNextReview(input, 'got_it', 'some_random_mode', NOW);
      expect(unknownResult.intervalDays).toBe(flashResult.intervalDays);
      expect(unknownResult.nextReview).toBe(flashResult.nextReview);
    });
  });
});
