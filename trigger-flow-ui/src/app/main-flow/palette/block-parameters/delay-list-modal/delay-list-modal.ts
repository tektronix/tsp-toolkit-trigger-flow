import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../../../custom-controls/textbox/textbox';
import { InputNumeric } from '../../../../custom-controls/input-numeric/input-numeric';

export interface DelayListModalValue {
  delayCount: number;
  // Null entries represent rows the user has cleared. They are sent through
  // to the server so it can emit per-row required errors (parity with the
  // scalar delay_time handling).
  delayDurations: (number | null)[];
}

@Component({
  selector: 'app-delay-list-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, Textbox, InputNumeric],
  templateUrl: './delay-list-modal.html',
  styleUrl: './delay-list-modal.scss',
})
export class DelayListModal implements OnChanges {
  @Input() open = false;
  @Input() delayCount = 1;
  @Input() delayDurations: (number | null)[] = [];

  @Output() cancelled = new EventEmitter<void>();
  @Output() applyList = new EventEmitter<DelayListModalValue>();

  localDelayCount = 1;
  localDelayDurations: (number | null)[] = [1];

  getLocalDelayCountAsText(): string {
    return `${this.localDelayCount}`;
  }

  // InputNumeric writes `undefined` to its internal state when given null,
  // so the cell renders empty for cleared rows.
  getDelayDuration(index: number): number | null {
    return this.localDelayDurations[index] ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      // Rehydrate local editable state every time the modal opens.
      this.localDelayCount = this.sanitizeDelayCount(this.delayCount);
      this.localDelayDurations = this.resizeRows(this.delayDurations, this.localDelayCount);
    }
  }

  onDelayCountChange(rawValue: string): void {
    const parsed = Number(rawValue);
    // Resize the table to match the count; sanitize floors at 1 so the
    // list always has at least one entry.
    this.localDelayCount = this.sanitizeDelayCount(parsed);
    this.localDelayDurations = this.resizeRows(this.localDelayDurations, this.localDelayCount);
  }

  onDelayDurationChange(index: number, value: number | null): void {
    // Store as-is. Empty cells flow through as null and are caught by the
    // server's per-row validation, matching the scalar delay_time path.
    this.localDelayDurations[index] = value;
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onApply(): void {
    this.applyList.emit({
      delayCount: this.localDelayCount,
      delayDurations: [...this.localDelayDurations],
    });
  }

  private sanitizeDelayCount(value: number): number {
    // Must be a positive integer to size the rows array. A list with zero
    // entries would render an empty `{ }` in the script, so floor at 1.
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }

    return Math.floor(value);
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
