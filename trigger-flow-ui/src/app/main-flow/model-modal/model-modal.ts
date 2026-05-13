import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../custom-controls/textbox/textbox';
import { Dropdown } from '../../custom-controls/dropdown/dropdown';

export interface ModelModalValue {
  name: string;
  slot: number;
  nodeId: string;
  notes: string;
}

export interface ModelSlotOption {
  label: string; // e.g. localnode.slot[1], node2.slot[3]
  slot: number;
  nodeId: string;
}

@Component({
  selector: 'app-model-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, Textbox, Dropdown],
  templateUrl: './model-modal.html',
  styleUrl: './model-modal.scss',
})
export class ModelModal {
  @Input() open = false;
  @Input() name = 'MyTriggerModel';
  @Input() notes = '';
  @Input() slot = 1;
  @Input() nodeId = '';

  @Input() slotOptions: ModelSlotOption[] = [];

  @Output() closeWithValue = new EventEmitter<ModelModalValue>();
  @Output() deleteClicked = new EventEmitter<void>();
  @Output() slotChanged = new EventEmitter<ModelSlotOption>();

  get slotOptionsAsString(): string[] {
    return this.slotOptions.map((o) => o.label);
  }

  get slotValue(): string {
    const found = this.slotOptions.find((o) => o.slot === this.slot && o.nodeId === this.nodeId);
    return found?.label ?? this.slotOptions[0]?.label ?? '';
  }

  set slotValue(label: string) {
    const selected = this.slotOptions.find((o) => o.label === label);
    if (selected) {
      this.slot = selected.slot;
      this.nodeId = selected.nodeId;
      this.slotChanged.emit(selected);
    }

    // Fallback parser for values like "localnode.slot[3]"
    // const match = /slot\[(\d+)\]$/i.exec(label);
    // const parsed = match ? Number(match[1]) : Number(label);
    // this.slot = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    //this.slotChanged.emit(this.slot);
  }

  onClose(): void {
    this.closeWithValue.emit({
      name: this.name.trim() || 'MyTriggerModel',
      slot: this.slot,
      nodeId: this.nodeId,
      notes: this.notes.trim(),
    });
  }

  onDelete(): void {
    this.deleteClicked.emit();
  }
}
