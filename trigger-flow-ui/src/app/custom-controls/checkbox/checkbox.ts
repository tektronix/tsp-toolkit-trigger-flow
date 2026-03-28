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
  selector: 'app-checkbox',
  imports: [FormsModule, CommonModule],
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Checkbox),
      multi: true,
    },
  ],
})
export class Checkbox implements ControlValueAccessor {
  @Input() label: string | undefined;
  @Input() automationID: string | undefined;
  @Input() checked = false;
  @Input() disabled = false;
  @Output() checkedChange = new EventEmitter<boolean>();

  private onChange: ((value: boolean) => void) | undefined;
  private onTouched: (() => void) | undefined;

  writeValue(value: boolean): void {
    this.checked = value;
  }

  registerOnChange(fn: ((value: boolean) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: (() => void) | undefined): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onCheckboxChange(event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.checked = value;
    if (this.onChange) {
      this.onChange(value);
    }
    this.checkedChange.emit(value);
  }

  onBlur(): void {
    if (this.onTouched) {
      this.onTouched();
    }
  }
}
