import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../custom-controls/textbox/textbox';
import { Dropdown } from '../../custom-controls/dropdown/dropdown';
import { MultilineTextbox } from '../../custom-controls/multiline-textbox/multiline-textbox';

export interface ModelModalValue {
  name: string;
  slot: number;
  nodeId: string;
  notes: string;
}

export interface ModelSlotOption {
  label: string; // e.g. localnode.slot[1], node2.slot[3]
  displayLabel: string; 
  slot: number;
  nodeId: string;
}

@Component({
  selector: 'app-model-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, Textbox, Dropdown, MultilineTextbox],
  templateUrl: './model-modal.html',
  styleUrl: './model-modal.scss',
})
export class ModelModal implements OnChanges {
  @Input() open = false;
  @Input() name = 'MyTriggerModel';
  @Input() notes = '';
  @Input() slot = 1;
  @Input() nodeId = '';

  @Input() slotOptions: ModelSlotOption[] = [];
  @Input() existingModelNames: string[] = [];

  @Output() closeWithValue = new EventEmitter<ModelModalValue>();
  @Output() deleteClicked = new EventEmitter<void>();
  @Output() slotChanged = new EventEmitter<ModelSlotOption>();

  @ViewChild('modalRoot') modalRoot?: ElementRef<HTMLElement>;

  nameError = '';
  private nameInputError = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      // Wait for the view update so focusable controls are available.
      setTimeout(() => this.focusFirstFocusableElement(), 0);
    }
  }

  get slotOptionsAsString(): string[] {
    return this.slotOptions.map((o) => o.displayLabel??o.label);
  }

  get slotValue(): string {
    const found = this.slotOptions.find((o) => o.slot === this.slot && o.nodeId === this.nodeId);
    return found?.displayLabel ?? found?.label ?? this.slotOptions[0]?.displayLabel ?? this.slotOptions[0]?.label ?? '';
  }

  set slotValue(label: string) {
    const selected = this.slotOptions.find((o) => (o.displayLabel ?? o.label) === label);
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

  validateName(): boolean {
    if (this.nameInputError) {
      this.nameError = this.nameInputError;
      return false;
    }

    const trimmed = this.name.trim();

    if (!trimmed) {
      this.nameError = 'Model name is required.';
      return false;
    }

    const isDuplicate = this.existingModelNames.some(
      (existing) => existing.toLowerCase() === trimmed.toLowerCase(),
    );

    if (isDuplicate) {
      this.nameError = `A model named "${trimmed}" already exists.`;
      return false;
    }

    this.nameError = '';
    return true;
  }

  /** No hardware available for a new binding. */
  get noSlotsAvailable(): boolean {
    return this.slotOptions.length === 0;
  }

  /** Composed disable state for the Create button. */
  get disableCreate(): boolean {
    return !!this.nameError || this.noSlotsAvailable;
  }

  /** Reason to surface in the Create button title. */
  get createDisabledReason(): string {
    if (this.nameError) {
      return this.nameError;
    }
    if (this.noSlotsAvailable) {
      return 'No valid slots available. Configure hardware or free a slot to create a model.';
    }
    return 'Create New Model';
  }

  onNameSpecialCharError(errorMessage: string): void {
    this.nameInputError = errorMessage;
    this.validateName();
  }

  onCreate(): void {
    if (!this.validateName()) {
      return;
    }

    if (this.nodeId) {
      this.closeWithValue.emit({
        name: this.name.trim(),
        slot: this.slot,
        nodeId: this.nodeId,
        notes: this.notes.trim(),
      });
    } else {
      this.deleteClicked.emit();
    }
  }

  onDelete(): void {
    this.deleteClicked.emit();
  }

  onModalKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onDelete();
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      this.onCreate();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = this.getFocusableElements();
    if (focusableElements.length === 0) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent): void {
    if (!this.open || event.defaultPrevented || event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    this.onDelete();
  }

  private focusFirstFocusableElement(): void {
    const firstElement = this.getFocusableElements()[0];
    firstElement?.focus();
  }

  private getFocusableElements(): HTMLElement[] {
    const modalElement = this.modalRoot?.nativeElement;
    if (!modalElement) {
      return [];
    }

    const selector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"]):not([disabled])',
    ].join(',');

    return Array.from(modalElement.querySelectorAll<HTMLElement>(selector));
  }
}
