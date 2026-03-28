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
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dropdown',
  imports: [FormsModule, CommonModule, MatIconModule],
  templateUrl: './dropdown.html',
  styleUrl: './dropdown.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Dropdown),
      multi: true,
    },
  ],
})
export class Dropdown implements ControlValueAccessor, OnInit {
  @Input() label: string | undefined;
  @Input() automationID: string | undefined;
  @Input() selected: string | undefined;
  @Input() options: string[] = [];
  @Input() disabled = false;
  @Output() selectedChange = new EventEmitter<string>();

  private onChange: ((value: string) => void) | undefined;

  ngOnInit(): void {
    // Ensure selected is initialized
    if (!this.selected && this.options.length > 0) {
      this.selected = this.options[0];
    }
  }

  writeValue(value: string): void {
    this.selected = value;
  }

  registerOnChange(fn: ((value: string) => void) | undefined): void {
    this.onChange = fn;
  }

  registerOnTouched(): void {
    // Handle touched state
  }

  setDisabledState?(): void {
    // Handle the disabled state if needed
  }

  onSelectionChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selected = value;
    if (this.onChange) {
      this.onChange(value);
    }
    this.selectedChange.emit(value);
  }
}
