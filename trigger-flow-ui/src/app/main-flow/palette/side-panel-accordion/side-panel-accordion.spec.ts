import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidePanelAccordion } from './side-panel-accordion';

describe('SidePanelAccordion', () => {
  let component: SidePanelAccordion;
  let fixture: ComponentFixture<SidePanelAccordion>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidePanelAccordion]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidePanelAccordion);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
