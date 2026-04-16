import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../custom-controls/textbox/textbox';
import { Dropdown } from '../../custom-controls/dropdown/dropdown';

export interface ModelModalValue {
  name: string;
  slot: number;
  node: number;
  notes: string;
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
  @Input() node = 1;

  // Dropdown expects string[]
  @Input() slotOptions: number[] = [1, 2, 3, 4];
  @Input() nodeOptions: number[] = [1, 2, 3, 4];

  // Emitted when user closes modal (acts as apply/confirm).
  @Output() closeWithValue = new EventEmitter<ModelModalValue>();
  // Emitted when user clicks Trash.
  @Output() deleteClicked = new EventEmitter<void>();
  // Emitted when user clicks Copy.
  @Output() copyClicked = new EventEmitter<void>();

  // Convert numeric options to string options required by app-dropdown.
  get slotOptionsAsString(): string[] {
    return this.slotOptions.map((x) => String(x));
  }

  get nodeOptionsAsString(): string[] {
    return this.nodeOptions.map((x) => String(x));
  }

  // Dropdown CVA uses string
  get slotValue(): string {
    return String(this.slot);
  }
  set slotValue(value: string) {
    this.slot = Number(value) || 1;
  }

  get nodeValue(): string {
    return String(this.node);
  }
  set nodeValue(value: string) {
    this.node = Number(value) || 1;
  }

  onClose(): void {
    this.closeWithValue.emit({
      name: this.name.trim() || 'MyTriggerModel',
      slot: this.slot,
      node: this.node,
      notes: this.notes.trim(),
    });
  }

  onDelete(): void {
    this.deleteClicked.emit();
  }

  onCopy(): void {
    this.copyClicked.emit();
  }
}