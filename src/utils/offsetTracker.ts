interface AppliedEdit {
  originalLine: number;
  linesRemoved: number;
  linesInserted: number;
}

export class OffsetTracker {
  private edits: AppliedEdit[] = [];

  applyEdit(edit: AppliedEdit): void {
    this.edits.push(edit);
    this.edits.sort((a, b) => a.originalLine - b.originalLine);
  }

  adjustLine(originalLine: number): number {
    let offset = 0;
    for (const edit of this.edits) {
      if (edit.originalLine < originalLine) {
        offset += edit.linesInserted - edit.linesRemoved;
      }
    }
    return originalLine + offset;
  }

  reset(): void {
    this.edits = [];
  }
}

export type { AppliedEdit };
