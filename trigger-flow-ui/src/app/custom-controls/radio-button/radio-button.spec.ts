import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { RadioButton } from './radio-button';

describe('RadioButton', () => {
  let component: RadioButton;
  let fixture: ComponentFixture<RadioButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RadioButton],
    }).compileComponents();

    fixture = TestBed.createComponent(RadioButton);
    component = fixture.componentInstance;

    component.label = 'Option A';
    component.name = 'test-group';
    component.value = 'A';

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render label', () => {
    const text = fixture.nativeElement.querySelector('.radio-text');

    expect(text.textContent.trim()).toBe('Option A');
  });

  it('should reflect checked state', () => {
    component.checked = true;

    fixture.detectChanges();

    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');

    expect(input.checked).toBe(true);
  });

  it('should reflect disabled state', () => {
    component.disabled = true;

    fixture.detectChanges();

    const input: HTMLInputElement =
      fixture.nativeElement.querySelector('input');

    expect(input.disabled).toBe(true);
  });

  it('should emit checkedChange on selection', () => {
    const emitSpy = vi.spyOn(component.checkedChange, 'emit');

    const input = fixture.debugElement.query(By.css('input'));

    input.triggerEventHandler('change', {});

    expect(emitSpy).toHaveBeenCalledWith('A');
  });

  it('should call registered onChange', () => {
    const onChangeSpy = vi.fn();

    component.registerOnChange(onChangeSpy);

    component.onRadioChange();

    expect(onChangeSpy).toHaveBeenCalledWith('A');
  });

  it('should update checked state from writeValue', () => {
    component.writeValue('A');

    expect(component.checked).toBe(true);

    component.writeValue('B');

    expect(component.checked).toBe(false);
  });
});