import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../../../custom-controls/textbox/textbox';

export interface DelayListModalValue {
  delayCount: number;
  delayDurations: number[];
  requestedDelayCount?: number;
}

@Component({
  selector: 'app-delay-list-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, Textbox],
  templateUrl: './delay-list-modal.html',
  styleUrl: './delay-list-modal.scss',
})
export class DelayListModal implements OnChanges {
  @Input() open = false;
  @Input() delayCount = 1;
  @Input() delayDurations: number[] = [];
  @Input() maxDelayCount = 10000;

  @Output() cancelled = new EventEmitter<void>();
  @Output() applyList = new EventEmitter<DelayListModalValue>();

  private rawDelayCount = 1;
  localDelayCount = 1;
  localDelayDurations: number[] = [1];
  delayCountError = '';

  getLocalDelayCountAsText(): string {
    return `${this.localDelayCount}`;
  }

  getDelayDurationAsText(index: number): string {
    // Textbox handles unit suffix rendering; modal passes raw numeric text only.
    const value = this.localDelayDurations[index] ?? 1;
    return `${value}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      // Rehydrate local editable state every time the modal opens.
      this.delayCountError = '';
      this.localDelayCount = this.sanitizeDelayCount(this.delayCount);
      this.rawDelayCount = this.delayCount;
      this.localDelayDurations = this.resizeRows(this.delayDurations, this.localDelayCount);
    }
  }

  onDelayCountChange(rawValue: string): void {
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
  }

  updateDelayDuration(index: number, rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    // Store raw value; range clamping happens server-side.
    this.localDelayDurations[index] = parsed;
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

  private resizeRows(rows: number[], targetLength: number): number[] {
    const result: number[] = [];

    for (let index = 0; index < targetLength; index++) {
      // New rows default to 1 second unless a value already exists for that index.
      result.push(rows[index] ?? 1);
    }

    return result;
  }
}
