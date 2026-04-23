import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  OnInit,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormsModule,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';

@Component({
  selector: 'app-multiline-textbox',
  imports: [FormsModule, CommonModule],
  templateUrl: './multiline-textbox.html',
  styleUrl: './multiline-textbox.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultilineTextbox),
      multi: true,
    },
  ],
})
export class MultilineTextbox implements ControlValueAccessor, OnInit{
  @Input() label: string | undefined;
  @Input() disabled = false;
  @Input() automationID: string | undefined;
  @Input() rows = 5;
  @Input() displayValue: string | undefined;
  @Output() inputChange = new EventEmitter<string>();

  private _value = '';
  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    console.log('MultilineTextboxComponent initialized with label:', this.label);
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
      this.displayValue = value;
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
    const inputElement = event.target as HTMLTextAreaElement;
    this.value = inputElement.value;
  }

  onBlur(event: Event): void {
    this.onInputChange(event);
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      if (event.ctrlKey) {
        event.preventDefault();
        this.insertNewLine(event);
      } else {
        this.onInputChange(event);
      }
    }
  }

  private insertNewLine(event: KeyboardEvent): void {
    const inputElement = event.target as HTMLInputElement | HTMLTextAreaElement;
    const cursorPosition = inputElement.selectionStart || 0;
    const currentValue = inputElement.value;
  
    const newValue = currentValue.substring(0, cursorPosition) + '\n' + currentValue.substring(cursorPosition);
    
    inputElement.value = newValue;
    this.value = newValue;
  
    const newCursorPosition = cursorPosition + 1;
    setTimeout(() => {
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
  }
}
