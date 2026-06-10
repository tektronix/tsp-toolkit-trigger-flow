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

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-radio-group',
  imports: [FormsModule, CommonModule],
  templateUrl: './radio-group.html',
  styleUrl: './radio-group.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RadioGroup),
      multi: true,
    },
  ],
})
export class RadioGroup implements ControlValueAccessor {
  @Input() label: string | undefined;

  @Input() automationID: string | undefined;

  @Input() name = 'radio-group';

  @Input() options: (string | RadioOption)[] = [];

  @Input() selectedValue: string | null | undefined = '';

  @Input() disabled = false;

  @Output() selectionChange = new EventEmitter<string>();

  private onChange: ((value: string) => void) | undefined;

  private onTouched: (() => void) | undefined;

  writeValue(value: string | null | undefined): void {
    this.selectedValue = value ?? '';
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

  onRadioChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.selectedValue = value;

    if (this.onChange) {
      this.onChange(value);
    }

    if (this.onTouched) {
      this.onTouched();
    }

    this.selectionChange.emit(value);
  }

  getNormalizedOption(option: string | RadioOption): RadioOption {
    if (typeof option === 'string') {
      return {
        value: option,
        label: option,
      };
    }

    return option;
  }
}