import { Component, Input, Output, EventEmitter, forwardRef, OnInit } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-textbox',
  templateUrl: './textbox.html',
  styleUrls: ['./textbox.css'],
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
  @Output() inputChange = new EventEmitter<string>();

  private _value: string = '';
  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    // Initialization logic if needed
  }

  get value(): string {
    return this._value;
  }

  set value(val: string) {
    this._value = val;
    if (this.onChange) {
      this.onChange(this._value);
    }
    this.inputChange.emit(this._value);
  }

  writeValue(value: string | undefined): void {
    if (value !== undefined) {
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

