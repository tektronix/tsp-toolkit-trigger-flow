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
});