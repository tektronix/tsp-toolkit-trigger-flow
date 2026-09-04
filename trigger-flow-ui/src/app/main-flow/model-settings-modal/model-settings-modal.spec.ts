import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelSettingsModal } from './model-settings-modal';

describe('ModelSettingsModal', () => {
  let component: ModelSettingsModal;
  let fixture: ComponentFixture<ModelSettingsModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelSettingsModal]
    }).compileComponents();

    fixture = TestBed.createComponent(ModelSettingsModal);

    component = fixture.componentInstance;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows channel usage and disables Add when no slot is available', () => {
    component.usedChannels = 2;
    component.totalChannels = 4;
    component.canAddModel = false;

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('CHANNELS: 2/4 USED');
    expect(element.querySelector<HTMLButtonElement>('.add-model-btn')?.disabled).toBe(true);
  });
});