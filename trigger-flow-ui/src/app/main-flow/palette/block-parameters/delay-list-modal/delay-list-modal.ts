import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../../../custom-controls/textbox/textbox';

export interface DelayListModalValue {
  delayCount: number;
  delayDurations: number[];
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
  @Input() minValue = 0.000001;
  @Input() maxValue = 1000000;

  @Output() cancelled = new EventEmitter<void>();
  @Output() applyList = new EventEmitter<DelayListModalValue>();

  localDelayCount = 1;
  localDelayDurations: number[] = [1];

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
      this.localDelayCount = this.normalizeDelayCount(this.delayCount);
      this.localDelayDurations = this.normalizeRows(this.delayDurations, this.localDelayCount);
    }
  }

  onDelayCountChange(rawValue: string): void {
    const parsed = Number(rawValue);
    // Delay count changes also resize duration rows while preserving existing entries.
    this.localDelayCount = this.normalizeDelayCount(parsed);
    this.localDelayDurations = this.normalizeRows(this.localDelayDurations, this.localDelayCount);
  }

  updateDelayDuration(index: number, rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.localDelayDurations[index] = this.clamp(parsed);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onApply(): void {
    const normalizedDelayCount = this.normalizeDelayCount(this.localDelayCount);
    const normalizedRows = this.normalizeRows(this.localDelayDurations, normalizedDelayCount);

    this.applyList.emit({
      delayCount: normalizedDelayCount,
      delayDurations: normalizedRows,
    });
  }

  private normalizeDelayCount(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }

    return Math.floor(value);
  }

  private normalizeRows(rows: number[], targetLength: number): number[] {
    const result: number[] = [];

    for (let index = 0; index < targetLength; index++) {
      // New rows default to 1 second unless a value already exists for that index.
      const fallback = rows[index] ?? 1;
      result.push(this.clamp(fallback));
    }

    return result;
  }

  private clamp(value: number): number {
    return Math.min(this.maxValue, Math.max(this.minValue, value));
  }
}
