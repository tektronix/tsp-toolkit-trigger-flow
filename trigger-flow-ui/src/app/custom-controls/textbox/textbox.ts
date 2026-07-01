import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-textbox',
  imports: [FormsModule, CommonModule],
  templateUrl: './textbox.html',
  styleUrl: './textbox.scss',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Textbox),
      multi: true,
    },
  ],
})
export class Textbox implements ControlValueAccessor, OnInit {
  @Input() label: string | undefined;
  @Input() unit: string | undefined;
  @Input() disabled = false;
  @Input() invalid = false;
  @Input() errorMessage = '';
  @Input() automationID: string | undefined;
  @Output() inputChange = new EventEmitter<string>();

  private _value = '';
  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    console.log('TextboxComponent initialized with label:', this.label);
  }

  get value(): string {
    // Keep the model value unit-free, but show the unit suffix in the UI text.
    if (!this.unit || this._value === '') {
      return this._value;
    }

    return `${this._value}${this.unit}`;
  }

  set value(val: string) {
    // Convert user input like "1s" back to the raw value "1" before emitting.
    const nextValue = this.stripUnitSuffix(val);
    if (this._value === nextValue) {
      return;
    }

    this._value = nextValue;
    if (this.onChange) {
      this.onChange(this._value);
    }
    this.inputChange.emit(this._value);
  }

  writeValue(value: string | undefined): void {
    if (value !== undefined && value !== null) {
      this._value = value;
    } else {
      this._value = '';
    }
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
    const inputElement = event.target as HTMLInputElement;
    this.findSpecialChars(inputElement.value);
    this.value = inputElement.value;
    // Repaint the input with normalized formatting (for example re-appending unit).
    inputElement.value = this.value;
  }

  onBlur(event: Event): void {
    this.onInputChange(event);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onInputChange(event);
    }
  }

  private stripUnitSuffix(value: string): string {
    if (!this.unit) {
      return value;
    }

    const trimmedValue = value.trim();
    if (trimmedValue.endsWith(this.unit)) {
      return trimmedValue.slice(0, -this.unit.length).trim();
    }

    return trimmedValue;
  }

  private findSpecialChars(value: string): void {
    const specialChars = '"/';
    const regex = new RegExp(`[${specialChars}]`, 'g');
    if (regex.test(value)) {
      const match= new Set(value.match(regex));
      this.invalid = true;
      this.errorMessage = `Input contains special characters ${Array.from(match)}, which are not allowed.`;
    } else {
      this.invalid = false;
      this.errorMessage = '';
    }
  }
}
