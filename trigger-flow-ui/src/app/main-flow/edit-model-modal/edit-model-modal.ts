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
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Textbox } from '../../custom-controls/textbox/textbox';
import { Dropdown } from '../../custom-controls/dropdown/dropdown';
import { ModelSlotOption } from '../model-modal/model-modal';

export interface EditModelValue {
  slot: number;
  nodeId: string;
}

/**
 * Edit Model modal. Prefilled from the selected model. Name is
 * read-only in this iteration. The slot picker offers valid hardware
 * options; when the model's current binding is stale, that single
 * binding is prepended to the picker as an unselectable entry so the
 * user sees exactly what needs to move.
 *
 * OK commits via a single `save` emission carrying the chosen `(slot,
 * nodeId)`. X / Escape close without any server call. All local buffer
 * state is discarded on close.
 */
@Component({
  selector: 'app-edit-model-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, Textbox, Dropdown],
  templateUrl: './edit-model-modal.html',
  styleUrl: './edit-model-modal.scss',
})
export class EditModelModal implements OnChanges {
  @Input() open = false;
  @Input() modelName = '';
  /** Current slot binding (may be invalid — see `invalidCurrentLabel`). */
  @Input() currentSlot = 1;
  @Input() currentNodeId = '';
  /** Valid hardware options the user may bind to. */
  @Input() slotOptions: ModelSlotOption[] = [];
  /**
   * Non-null when the model's current binding is not in `slotOptions`
   * (typically a stale `SystemConfig` binding). Prepended to the picker
   * as an unselectable entry so the user sees the stale binding
   * alongside any valid alternatives. Only this model's own invalid
   * binding is surfaced — other models are unaffected.
   */
  @Input() invalidCurrentLabel: string | null = null;

  @Output() save = new EventEmitter<EditModelValue>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('modalRoot') modalRoot?: ElementRef<HTMLElement>;

  /** Suffix appended to the invalid entry inside the dropdown. */
  private static readonly INVALID_SUFFIX = ' — unavailable';

  /** Label of the currently-picked option in the dropdown. */
  pendingSlotLabel = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue) {
      this.pendingSlotLabel = this.seedInitialLabel();
      setTimeout(() => this.focusFirstFocusableElement(), 0);
      return;
    }

    // Modal already open: mid-session hardware updates can invalidate
    // the current pick (slot removed, module went Empty, previously
    // stale binding healed). Re-seed when the pending value is no
    // longer displayable so the picker stays truthful.
    if (
      this.open &&
      (changes['slotOptions'] ||
        changes['invalidCurrentLabel'] ||
        changes['currentSlot'] ||
        changes['currentNodeId']) &&
      !this.isPendingDisplayable()
    ) {
      this.pendingSlotLabel = this.seedInitialLabel();
    }
  }

  /** True when the current pick still resolves to a rendered option. */
  private isPendingDisplayable(): boolean {
    if (this.pendingSlotLabel === this.invalidDropdownLabel) {
      return this.invalidDropdownLabel !== null;
    }
    return this.slotOptions.some((o) => o.label === this.pendingSlotLabel);
  }

  /** Suffixed label for the invalid entry shown inside the picker. */
  get invalidDropdownLabel(): string | null {
    return this.invalidCurrentLabel
      ? `${this.invalidCurrentLabel}${EditModelModal.INVALID_SUFFIX}`
      : null;
  }

  /** Dropdown option list. The invalid entry (when present) is prepended so
   * the user always sees the stale binding alongside any valid choices. */
  get slotOptionsAsString(): string[] {
    const valid = this.slotOptions.map((o) => o.label);
    return this.invalidDropdownLabel ? [this.invalidDropdownLabel, ...valid] : valid;
  }

  /** No valid hardware to rebind against. The picker still renders the
   * model's own binding as the invalid entry so it is never empty. */
  get noSlotsAvailable(): boolean {
    return this.slotOptions.length === 0;
  }

  /** Picker renders with only the invalid current entry — no valid options exist. */
  get onlyInvalidVisible(): boolean {
    return this.noSlotsAvailable && !!this.invalidDropdownLabel;
  }

  get pendingSlotOption(): ModelSlotOption | undefined {
    return this.slotOptions.find((o) => o.label === this.pendingSlotLabel);
  }

  /** Save is disabled when there is nothing to commit or nothing to pick. */
  get disableSave(): boolean {
    if (this.noSlotsAvailable) return true;
    const picked = this.pendingSlotOption;
    if (!picked) return true;
    // No-op rebind: picked value equals current binding.
    return picked.slot === this.currentSlot && picked.nodeId === this.currentNodeId;
  }

  get saveDisabledReason(): string {
    if (this.onlyInvalidVisible) {
      return 'No other valid slots available; reconfigure hardware to rebind.';
    }
    if (this.disableSave) {
      return 'Pick a different slot to rebind.';
    }
    return 'Save';
  }

  onSave(): void {
    const picked = this.pendingSlotOption;
    if (!picked || this.disableSave) return;
    this.save.emit({ slot: picked.slot, nodeId: picked.nodeId });
  }

  onCancel(): void {
    this.closed.emit();
  }

  onModalKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
      return;
    }

    if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      this.onSave();
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
    this.onCancel();
  }

  private seedInitialLabel(): string {
    // If the current binding is stale, surface the invalid entry as the
    // initial selection so the user sees exactly what needs to move.
    // The option is disabled inside the dropdown, so any other pick will
    // replace it.
    if (this.invalidDropdownLabel) {
      return this.invalidDropdownLabel;
    }
    // Prefer the current binding when it is still valid; otherwise the
    // first available option; otherwise empty.
    const current = this.slotOptions.find(
      (o) => o.slot === this.currentSlot && o.nodeId === this.currentNodeId,
    );
    return current?.label ?? this.slotOptions[0]?.label ?? '';
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
