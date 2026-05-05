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

    component.localPoints = 3;
    component.localSweepValues = [1.5, 2.5, 3.5];

    component.onApply();

    expect(emitted).toEqual({
      points: 3,
      sweepValues: [1.5, 2.5, 3.5],
    });
  });

  it('should clamp sweep values to min/max range on apply', () => {
    let emitted: DelayListModalValue | undefined;

    component.applyList.subscribe((value) => {
      emitted = value;
    });

    component.minValue = 0.000001;
    component.maxValue = 1000000;
    component.localPoints = 3;
    component.localSweepValues = [0.0000001, 500, 2000000];

    component.onApply();

    expect(emitted?.sweepValues).toEqual([
      0.000001, // clamped to min
      500, // within range
      1000000, // clamped to max
    ]);
  });

  it('should normalize points to floor integer', () => {
    let emitted: DelayListModalValue | undefined;

    component.applyList.subscribe((value) => {
      emitted = value;
    });

    component.localPoints = 3.7;
    component.localSweepValues = [1, 2, 3, 4];

    component.onApply();

    expect(emitted?.points).toBe(3);
  });

  it('should render modal only when open=true', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).toBeNull();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).not.toBeNull();
  });

  it('should display correct number of sweep rows', () => {
    component.open = true;
    component.localPoints = 3;
    component.localSweepValues = [1, 2, 3];
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('tbody tr'));
    expect(rows.length).toBe(3);
  });

  it('should update sweep value on input change', () => {
    component.localSweepValues = [1, 2, 3];

    component.updateSweepValue(1, '5.5');

    expect(component.localSweepValues[1]).toBe(5.5);
  });

  it('should adjust sweep rows when points change', () => {
    component.localPoints = 2;
    component.localSweepValues = [1, 2, 3, 4];

    component.onPointsChange('3');

    expect(component.localSweepValues.length).toBe(3);
  });
});
