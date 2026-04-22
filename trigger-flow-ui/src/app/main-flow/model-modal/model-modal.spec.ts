import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ModelModal } from './model-modal';

describe('ModelModal', () => {
  let component: ModelModal;
  let fixture: ComponentFixture<ModelModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelModal],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelModal);
    component = fixture.componentInstance;
    component.open = true;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit closeWithValue on close', () => {
    let emitted:
      | { name: string; slot: number; node: number; notes: string }
      | undefined;

    component.closeWithValue.subscribe((value) => {
      emitted = value;
    });

    component.name = 'MyTriggerModel';
    component.slot = 1;
    component.node = 1;
    component.notes = 'notes';

    component.onClose();

    expect(emitted).toEqual({
      name: 'MyTriggerModel',
      slot: 1,
      node: 1,
      notes: 'notes',
    });
  });

  it('should emit deleteClicked on delete', () => {
    let emitted = false;

    component.deleteClicked.subscribe(() => {
      emitted = true;
    });

    component.onDelete();

    expect(emitted).toBe(true);
  });

  it('should render modal only when open=true', () => {
    component.open = false;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).toBeNull();

    component.open = true;
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.css('.tf-modal'))).not.toBeNull();
  });
});