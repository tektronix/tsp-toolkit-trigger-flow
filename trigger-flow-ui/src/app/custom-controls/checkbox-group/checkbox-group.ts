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

export interface CheckboxOption {
  value: string;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-checkbox-group',
  imports: [FormsModule, CommonModule],
  templateUrl: './checkbox-group.html',
  styleUrl: './checkbox-group.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CheckboxGroup),
      multi: true,
    },
  ],
})
export class CheckboxGroup implements ControlValueAccessor {
  @Input() label: string | undefined;
  @Input() automationID: string | undefined;
  @Input() options: CheckboxOption[] = [];
  @Input() selectedValues: string[] = [];
  @Input() disabled = false;
  @Output() selectionChange = new EventEmitter<string[]>();

  private onChange: ((value: string[]) => void) | undefined;
  private onTouched: (() => void) | undefined;

  writeValue(value: string[]): void {
    this.selectedValues = Array.isArray(value) ? [...value] : [];
  }

  registerOnChange(fn: ((value: string[]) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: (() => void) | undefined): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  isChecked(value: string): boolean {
    return this.selectedValues.includes(value);
  }

  onCheckboxChange(event: Event, value: string): void {
    const checked = (event.target as HTMLInputElement).checked;

    if (checked) {
      this.selectedValues = [...this.selectedValues, value];
    } else {
      this.selectedValues = this.selectedValues.filter((v) => v !== value);
    }

    if (this.onChange) {
      this.onChange(this.selectedValues);
    }
    this.selectionChange.emit(this.selectedValues);
  }

  onBlur(): void {
    if (this.onTouched) {
      this.onTouched();
    }
  }
}
