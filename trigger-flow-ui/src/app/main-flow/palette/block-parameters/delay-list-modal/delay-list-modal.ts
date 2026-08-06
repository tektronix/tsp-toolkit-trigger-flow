import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumeric } from '../../../../custom-controls/input-numeric/input-numeric';

export interface DelayListModalValue {
  delayCount: number;
  // Null entries represent rows the user has cleared. They are sent through
  // to the server so it can emit per-row required errors (parity with the
  // scalar delay_time handling).
  delayDurations: (number | null)[];
  requestedDelayCount?: number;
}

@Component({
  selector: 'app-delay-list-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, InputNumeric],
  templateUrl: './delay-list-modal.html',
  styleUrl: './delay-list-modal.scss',
})
export class DelayListModal implements OnChanges {
  @Input() open = false;
  @Input() delayCount = 1;
  @Input() delayDurations: (number | null)[] = [];
  @Input() maxDelayCount = 10000;

  @Output() cancelled = new EventEmitter<void>();
  @Output() applyList = new EventEmitter<DelayListModalValue>();
  @Output() verifyList = new EventEmitter<DelayListModalValue>();

  private rawDelayCount = 1;
  localDelayCount = 1;
  localDelayDurations: (number | null)[] = [1];
  delayCountError = '';

  getLocalDelayCountAsText(): string {
    return `${this.localDelayCount}`;
  }

  // InputNumeric writes `undefined` to its internal state when given null,
  // so the cell renders empty for cleared rows.
  getDelayDuration(index: number): number | null {
    return this.localDelayDurations[index] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open) return;

    const shouldRehydrate =
      (changes['open'] && this.open) ||
      !!changes['delayCount'] ||
      !!changes['delayDurations'];

    if (shouldRehydrate) {
      this.delayCountError = '';
      this.localDelayCount = this.sanitizeDelayCount(this.delayCount);
      this.rawDelayCount = this.delayCount;
      this.localDelayDurations = this.resizeRows(this.delayDurations, this.localDelayCount);
    }
  }

  onDelayCountChange(rawValue: number | null): void {
    const parsed = Number(rawValue);

    this.rawDelayCount = parsed;

    if (parsed > this.maxDelayCount) {
      this.delayCountError =
        `Maximum ${this.maxDelayCount} delays are allowed.`;
    } else {
      this.delayCountError = '';
    }

    // Resize the table to match the count; sanitize floors at 1 so the
    // list always has at least one entry.
    this.localDelayCount = this.sanitizeDelayCount(parsed);
    this.localDelayDurations = this.resizeRows(this.localDelayDurations, this.localDelayCount);
    this.onApply();
  }

  onDelayDurationChange(index: number, value: number | null): void {
    // Store as-is. Empty cells flow through as null and are caught by the
    // server's per-row validation, matching the scalar delay_time path.
    this.localDelayDurations[index] = value;
    this.verifyList.emit({
      delayCount: this.localDelayCount,
      delayDurations: [...this.localDelayDurations],
    });
    this.onApply();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onApply(): void {
    this.applyList.emit({
      delayCount: this.localDelayCount,
      delayDurations: [...this.localDelayDurations],
      requestedDelayCount: this.rawDelayCount,
    });
  }

  private sanitizeDelayCount(value: number): number {
    // Must be a positive integer to size the rows array. A list with zero
    // entries would render an empty `{ }` in the script, so floor at 1.
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }

    return Math.min(
      Math.floor(value),
      this.maxDelayCount
    );
  }

  private resizeRows(
    rows: (number | null)[],
    targetLength: number,
  ): (number | null)[] {
    const result: (number | null)[] = [];

    for (let index = 0; index < targetLength; index++) {
      if (index < rows.length) {
        // Preserve existing entries verbatim, including nulls the user
        // intentionally left blank.
        result.push(rows[index]);
      } else {
        // Genuinely new rows default to 1 second.
        result.push(1);
      }
    }

    return result;
  }
}
