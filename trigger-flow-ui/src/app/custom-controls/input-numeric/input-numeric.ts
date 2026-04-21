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
  @Input() disabled = false;
  @Input() automationID: string | undefined;
  @Input() floatAllowed = false;
  @Output() inputChange = new EventEmitter<number>();

  private _value: number | undefined;
  private onChange: ((value: number) => void) | undefined;

  ngOnInit(): void {
    console.log('InputNumericComponent initialized with label:', this.label);
  }

  get displayValue(): number | undefined {
    return this._value;
  }

  set displayValue(val: number) {
    if (this._value === val) {
      return;
    }

    this._value = val;
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

    const currentValue = this.displayValue;
    const newValue = inputElement.valueAsNumber;

    if (currentValue !== newValue) {
      // Store previous value for fallback
      const previousValue = this.displayValue;

      let value = newValue;

      // Only update if the value is valid (not NaN)
      if (!isNaN(value)) {
        if (!this.floatAllowed) {
          value = Math.floor(value);
          inputElement.value = `${value}`;
        }
        this.displayValue = value;
      } else {
        // Revert to the previous valid value
        inputElement.value = `${previousValue}`;
      }
    }
  }

  onBlur(event: Event): void {
    this.onInputChange(event);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onInputChange(event);
    }
  }
}
