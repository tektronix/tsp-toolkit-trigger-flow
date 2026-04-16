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
  selector: 'app-toggle',
  imports: [CommonModule, FormsModule],
  templateUrl: './toggle.html',
  styleUrl: './toggle.scss',
})
export class Toggle implements ControlValueAccessor{
  @Input() label: string | undefined;
  @Input() automationID: string | undefined;
  @Input() options: string[] = [];
  @Input() selectedOption: string | undefined;
  @Input() disabled = false;
  @Output() toggleOptionChange = new EventEmitter<string>();

  private onChange: (value: string) => void = (value: string) => {
    console.log('Value changed:', value);
  };
  private onTouched: () => void = () => {
    console.log('Input touched');
  };

  writeValue(value: string): void {
    this.selectedOption = value;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggleOption(option: string): void {
    if (this.disabled) {
      return;
    }
    if (this.selectedOption !== option) {
      this.selectedOption = option;
      this.onChange(this.selectedOption);
      this.toggleOptionChange.emit(this.selectedOption);
    }
    this.onTouched();
  }
}
