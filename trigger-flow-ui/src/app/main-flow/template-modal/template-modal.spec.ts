import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TemplateModal } from './template-modal';

describe('TemplateModal', () => {
  let component: TemplateModal;
  let fixture: ComponentFixture<TemplateModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplateModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TemplateModal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
