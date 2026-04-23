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
  @Input() automationID: string | undefined;
  @Input() options: string[] = [];
  @Input() name = 'radio-group';
  @Input() selectedValue: string | undefined;
  @Input() disabled = false;
  @Output() radioChange = new EventEmitter<string>();

  private onChange: ((value: string) => void) | undefined;
  private onTouched: (() => void) | undefined;

  writeValue(value: string): void {
    this.selectedValue = value;
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
    this.radioChange.emit(value);
  }

  onBlur(): void {
    if (this.onTouched) {
      this.onTouched();
    }
  }
}
