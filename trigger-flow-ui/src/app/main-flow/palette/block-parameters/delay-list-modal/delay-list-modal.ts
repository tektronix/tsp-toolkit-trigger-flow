import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../../../custom-controls/textbox/textbox';

export interface DelayListModalValue {
  points: number;
  sweepValues: number[];
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
  @Input() points = 1;
  @Input() sweepValues: number[] = [];
  @Input() minValue = 0.000001;
  @Input() maxValue = 1000000;

  @Output() cancelled = new EventEmitter<void>();
  @Output() applyList = new EventEmitter<DelayListModalValue>();

  localPoints = 1;
  localSweepValues: number[] = [1];

  getLocalPointsAsText(): string {
    return `${this.localPoints}`;
  }

  getSweepValueAsText(index: number): string {
    // Textbox handles unit suffix rendering; modal passes raw numeric text only.
    const value = this.localSweepValues[index] ?? 1;
    return `${value}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      // Rehydrate local editable state every time the modal opens.
      this.localPoints = this.normalizePoints(this.points);
      this.localSweepValues = this.normalizeRows(this.sweepValues, this.localPoints);
    }
  }

  onPointsChange(rawValue: string): void {
    const parsed = Number(rawValue);
    // Points changes also resize sweep rows while preserving existing entries.
    this.localPoints = this.normalizePoints(parsed);
    this.localSweepValues = this.normalizeRows(this.localSweepValues, this.localPoints);
  }

  updateSweepValue(index: number, rawValue: string): void {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.localSweepValues[index] = this.clamp(parsed);
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onApply(): void {
    const normalizedPoints = this.normalizePoints(this.localPoints);
    const normalizedRows = this.normalizeRows(this.localSweepValues, normalizedPoints);

    this.applyList.emit({
      points: normalizedPoints,
      sweepValues: normalizedRows,
    });
  }

  private normalizePoints(value: number): number {
    if (!Number.isFinite(value) || value < 1) {
      return 1;
    }

    return Math.floor(value);
  }

  private normalizeRows(values: number[], points: number): number[] {
    const result: number[] = [];

    for (let index = 0; index < points; index++) {
      // New rows default to 1 second unless a value already exists for that index.
      const fallback = values[index] ?? 1;
      result.push(this.clamp(fallback));
    }

    return result;
  }

  private clamp(value: number): number {
    return Math.min(this.maxValue, Math.max(this.minValue, value));
  }
}
