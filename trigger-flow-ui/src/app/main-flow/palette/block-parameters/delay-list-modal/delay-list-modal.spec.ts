import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DelayListModal, DelayListModalValue } from './delay-list-modal';

describe('DelayListModal', () => {
  let component: DelayListModal;
  let fixture: ComponentFixture<DelayListModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DelayListModal],
    }).compileComponents();

    fixture = TestBed.createComponent(DelayListModal);
    component = fixture.componentInstance;
    component.open = true;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit cancel on cancel', () => {
    let emitted = false;

    component.cancelled.subscribe(() => {
      emitted = true;
    });

    component.onCancel();

    expect(emitted).toBe(true);
  });

  it('should emit applyList on apply with normalized values', () => {
    let emitted: DelayListModalValue | undefined;

    component.applyList.subscribe((value) => {
      emitted = value;
    });

    component.localDelayCount = 3;
    component.localDelayDurations = [1.5, 2.5, 3.5];

    component.onApply();

    expect(emitted).toEqual({
      delayCount: 3,
      delayDurations: [1.5, 2.5, 3.5],
    });
  });

  it('should floor delayCount to integer when changed', () => {
    component.localDelayCount = 1;
    component.localDelayDurations = [1];

    component.onDelayCountChange('3.7');

    expect(component.localDelayCount).toBe(3);
    expect(component.localDelayDurations.length).toBe(3);
  });

  it('should floor delayCount on rehydrate when modal reopens', () => {
    fixture.componentRef.setInput('open', false);
    fixture.componentRef.setInput('delayCount', 2.9);
    fixture.componentRef.setInput('delayDurations', [1, 2]);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(component.localDelayCount).toBe(2);
  });

  it('should render modal only when open=true', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).toBeNull();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).not.toBeNull();
  });

  it('should display correct number of delay rows', () => {
    component.open = true;
    component.localDelayCount = 3;
    component.localDelayDurations = [1, 2, 3];
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
    expect(rows.length).toBe(3);
  });

  it('should update delay value on input change', () => {
    component.localDelayDurations = [1, 2, 3];

    component.onDelayDurationChange(1, 5.5);

    expect(component.localDelayDurations[1]).toBe(5.5);
  });

  it('should store null when a delay cell is cleared', () => {
    component.localDelayDurations = [1, 2, 3];

    component.onDelayDurationChange(1, null);

    expect(component.localDelayDurations[1]).toBeNull();
  });

  it('should adjust delay rows when delayCount changes', () => {
    component.localDelayCount = 2;
    component.localDelayDurations = [1, 2, 3, 4];

    component.onDelayCountChange('3');

    expect(component.localDelayDurations.length).toBe(3);
  });
});
