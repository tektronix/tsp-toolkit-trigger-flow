import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { InputNumeric } from './input-numeric';

describe('InputNumeric', () => {
  let component: InputNumeric;
  let fixture: ComponentFixture<InputNumeric>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputNumeric]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputNumeric);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  for (const unit of [undefined, 's']) {
    describe(unit ? 'with units' : 'without units', () => {
      let input: HTMLInputElement;
      let changedValues: (number | null)[];
      let emittedValues: (number | null)[];

      beforeEach(() => {
        component.unit = unit;
        component.writeValue(42);
        changedValues = [];
        emittedValues = [];
        component.registerOnChange(value => changedValues.push(value));
        component.inputChange.subscribe(value => emittedValues.push(value));
        fixture.detectChanges();
        input = fixture.nativeElement.querySelector('input');
      });

      function enterInvalidInput(): void {
        input.value = '++';
        if (!unit) {
          vi.spyOn(input.validity, 'badInput', 'get').mockReturnValue(true);
        }
      }

      it('uses the expected native input type', () => {
        expect(input.type).toBe(unit ? 'text' : 'number');
      });

      for (const commitEvent of ['blur', 'Enter']) {
        it(`restores the previous value for invalid input on ${commitEvent}`, () => {
          enterInvalidInput();
          input.dispatchEvent(commitEvent === 'blur'
            ? new Event('blur')
            : new KeyboardEvent('keydown', { key: 'Enter' }));

          expect(input.value).toBe(unit ? '42s' : '42');
          expect(component.displayValue).toBe(input.value);
          expect(changedValues).toEqual([]);
          expect(emittedValues).toEqual([]);
        });
      }

      it('emits null only when cleared so defaults can be applied', () => {
        input.value = '';
        input.dispatchEvent(new Event('blur'));

        expect(input.value).toBe('');
        expect(component.displayValue).toBe('');
        expect(changedValues).toEqual([null]);
        expect(emittedValues).toEqual([null]);
      });

      it('restores the most recent valid value after a numeric edit', () => {
        input.value = '17';
        input.dispatchEvent(new Event('blur'));
        enterInvalidInput();
        input.dispatchEvent(new Event('blur'));

        expect(input.value).toBe(unit ? '17s' : '17');
        expect(changedValues).toEqual([17]);
        expect(emittedValues).toEqual([17]);
      });
    });
  }
});
