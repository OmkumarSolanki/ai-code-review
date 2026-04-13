import { OffsetTracker } from '../../src/utils/offsetTracker';

describe('OffsetTracker', () => {
  let tracker: OffsetTracker;

  beforeEach(() => {
    tracker = new OffsetTracker();
  });

  it('returns original line when no edits applied', () => {
    expect(tracker.adjustLine(10)).toBe(10);
  });

  it('shifts subsequent lines after insertion', () => {
    tracker.applyEdit({ originalLine: 5, linesRemoved: 1, linesInserted: 3 });
    // Line 10 should shift by +2 (3 inserted - 1 removed)
    expect(tracker.adjustLine(10)).toBe(12);
  });

  it('shifts subsequent lines after deletion', () => {
    tracker.applyEdit({ originalLine: 5, linesRemoved: 3, linesInserted: 1 });
    // Line 10 should shift by -2
    expect(tracker.adjustLine(10)).toBe(8);
  });

  it('does not shift lines before the edit', () => {
    tracker.applyEdit({ originalLine: 10, linesRemoved: 1, linesInserted: 3 });
    expect(tracker.adjustLine(5)).toBe(5);
  });

  it('accumulates multiple edits', () => {
    tracker.applyEdit({ originalLine: 5, linesRemoved: 1, linesInserted: 3 }); // +2
    tracker.applyEdit({ originalLine: 15, linesRemoved: 2, linesInserted: 1 }); // -1
    // Line 20: both edits are before it → +2 + (-1) = +1
    expect(tracker.adjustLine(20)).toBe(21);
    // Line 10: only first edit is before it → +2
    expect(tracker.adjustLine(10)).toBe(12);
  });

  it('handles edit at the same line (not before)', () => {
    tracker.applyEdit({ originalLine: 10, linesRemoved: 1, linesInserted: 2 });
    // Edit at line 10, adjusting line 10 — edit is NOT before line 10
    expect(tracker.adjustLine(10)).toBe(10);
  });

  it('resets clears all edits', () => {
    tracker.applyEdit({ originalLine: 5, linesRemoved: 1, linesInserted: 3 });
    tracker.reset();
    expect(tracker.adjustLine(10)).toBe(10);
  });
});
