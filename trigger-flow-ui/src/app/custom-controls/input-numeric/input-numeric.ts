import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-input-numeric',
  imports: [FormsModule, CommonModule],
  templateUrl: './input-numeric.html',
  styleUrl: './input-numeric.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputNumeric),
      multi: true,
    },
  ],
})
export class InputNumeric implements ControlValueAccessor, OnInit {
  @Input() label: string | undefined;
  @Input() unit: string | undefined;
  @Input() disabled = false;
  @Input() automationID: string | undefined;
  @Input() floatAllowed = false;
  @Output() inputChange = new EventEmitter<number>();

  private _value: number | undefined;
  private onChange: ((value: number) => void) | undefined;

  ngOnInit(): void {
    console.log('InputNumericComponent initialized with label:', this.label);
  }

  get displayValue(): string {
    // Display includes unit suffix for UI readability, while backing value remains numeric.
    if (this._value === undefined || this._value === null || Number.isNaN(this._value)) {
      return '';
    }

    return this.unit ? `${this._value}${this.unit}` : `${this._value}`;
  }

  set displayValue(val: string | number) {
    // Parse user-facing text (e.g. "0.5s") into numeric data before state updates.
    const parsedValue = this.parseValue(val);
    if (parsedValue === null || this._value === parsedValue) {
      return;
    }

    this._value = parsedValue;
    if (this.onChange) {
      this.onChange(this._value);
    }
    this.inputChange.emit(this._value);
  }

  writeValue(value: number): void {
    // Accept all valid numbers including 0
    if (value !== undefined && value !== null && !isNaN(value)) {
      this._value = value;
    }
  }

  registerOnChange(fn: ((value: number) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(): void {
    // console.log('InputNumericComponent touched');
  }

  setDisabledState?(): void {
    // Handle the disabled state if needed
  }

  onInputChange(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const previousValue = this.displayValue;
    const parsedValue = this.parseValue(inputElement.value);

    if (parsedValue === null) {
      inputElement.value = previousValue;
      return;
    }

    this.displayValue = parsedValue;
    // Keep the visible text normalized after edits.
    inputElement.value = this.displayValue;
  }

  onBlur(event: Event): void {
    this.onInputChange(event);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onInputChange(event);
    }
  }

  private parseValue(value: string | number): number | null {
    const rawValue = typeof value === 'number' ? `${value}` : value;
    const cleanedValue = this.stripUnitSuffix(rawValue);
    const parsedValue = Number(cleanedValue);

    if (Number.isNaN(parsedValue)) {
      return null;
    }

    // Preserve decimals when requested (used by delay_time), otherwise coerce to integer.
    return this.floatAllowed ? parsedValue : Math.floor(parsedValue);
  }

  private stripUnitSuffix(value: string): string {
    if (!this.unit) {
      return value.trim();
    }

    const trimmedValue = value.trim();
    if (trimmedValue.endsWith(this.unit)) {
      return trimmedValue.slice(0, -this.unit.length).trim();
    }

    return trimmedValue;
  }
}
