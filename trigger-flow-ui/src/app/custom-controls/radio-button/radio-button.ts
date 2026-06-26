import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
} from '@angular/core';

import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

@Component({
  selector: 'app-radio-button',
  imports: [FormsModule, CommonModule],
  templateUrl: './radio-button.html',
  styleUrl: './radio-button.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioButton),
      multi: true,
    },
  ],
})
export class RadioButton implements ControlValueAccessor {
  @Input() label: string | undefined;

  // value represented by this radio
  @Input() value: string | undefined;

  // shared group name
  @Input() name = 'radio-group';

  @Input() checked = false;

  @Input() disabled = false;

  @Input() automationID: string | undefined;

  @Output() checkedChange = new EventEmitter<string>();

  private onChange: ((value: string) => void) | undefined;

  private onTouched: (() => void) | undefined;

  writeValue(value: string): void {
    this.checked = value === this.value;
  }

  registerOnChange(fn: ((value: string) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: (() => void) | undefined): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onRadioChange(): void {
    if (this.disabled || !this.value) {
      return;
    }

    this.checked = true;

    if (this.onChange) {
      this.onChange(this.value);
    }

    this.checkedChange.emit(this.value);
  }

  onBlur(): void {
    if (this.onTouched) {
      this.onTouched();
    }
  }
}