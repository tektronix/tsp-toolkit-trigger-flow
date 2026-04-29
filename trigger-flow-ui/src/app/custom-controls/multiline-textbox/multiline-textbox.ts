import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-multiline-textbox',
  imports: [FormsModule, CommonModule],
  templateUrl: './multiline-textbox.html',
  styleUrl: './multiline-textbox.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultilineTextbox),
      multi: true,
    },
  ],
})
export class MultilineTextbox implements ControlValueAccessor, OnInit {
  @Input() label: string | undefined;
  @Input() disabled = false;
  @Input() automationID: string | undefined;
  @Input() rows = 5;
  // optional: if null/undefined, behaves like normal multiline textbox
  @Input() maxLength: number | null = null;
  @Output() inputChange = new EventEmitter<string>();

  private _value = '';
  draftValue = '';
  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    console.log('MultilineTextboxComponent initialized with label:', this.label);
  }

  get hasMaxLength(): boolean {
    return this.maxLength != null && this.maxLength > 0;
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    const next = this.applyMaxLength(val);

    if (this._value === next) {
      this.draftValue = next;
      return;
    }

    this._value = next;
    this.draftValue = next;

    if (this.onChange) {
      this.onChange(this._value);
    }
    this.inputChange.emit(this._value);
  }

  get currentLength(): number {
    return this.draftValue.length;
  }

  get countText(): string {
    return this.hasMaxLength ? `${this.currentLength}/${this.maxLength}` : '';
  }

  writeValue(value: string | undefined): void {
    if (value === undefined || value === null) {
      return;
    }

    const next = this.applyMaxLength(value);
    this._value = next;
    this.draftValue = next;
  }

  registerOnChange(fn: ((value: string) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(): void {
    // Optionally handle touch event
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInputChange(event: Event): void {
    const inputElement = event.target as HTMLTextAreaElement;
    const next = this.applyMaxLength(inputElement.value);

    if (next !== inputElement.value) {
      inputElement.value = next;
    }

    this.draftValue = next;
  }

  onBlur(): void {
    this.commitDraftValue();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (event.ctrlKey) {
        this.insertNewLine(event);
        return;
      }

      this.commitDraftValue();
    }
  }

  private insertNewLine(event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement | HTMLTextAreaElement;
    const cursorPosition = inputElement.selectionStart || 0;
    const currentValue = inputElement.value;

    const newValue =
      currentValue.substring(0, cursorPosition) + '\n' + currentValue.substring(cursorPosition);

    inputElement.value = newValue;
    this.draftValue = this.applyMaxLength(newValue);
    inputElement.value = this.draftValue;

    const newCursorPosition = cursorPosition + 1;
    setTimeout(() => {
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  }

  private commitDraftValue(): void {
    if (this.draftValue === this._value) {
      return;
    }

    this.value = this.draftValue;
  }

  private applyMaxLength(val: string): string {
    return this.hasMaxLength ? val.slice(0, this.maxLength as number) : val;
  }
}
