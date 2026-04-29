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
  @Input() disabled = false;
  @Input() automationID: string | undefined;
  @Output() inputChange = new EventEmitter<string>();

  private _value = '';
  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    console.log('TextboxComponent initialized with label:', this.label);
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    if (this._value === val) {
      return;
    }

    this._value = val;
    if (this.onChange) {
      this.onChange(this._value);
    }
    this.inputChange.emit(this._value);
  }

  writeValue(value: string | undefined): void {
    if (value !== undefined && value !== null) {
      this._value = value;
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
    this.value = inputElement.value;
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
