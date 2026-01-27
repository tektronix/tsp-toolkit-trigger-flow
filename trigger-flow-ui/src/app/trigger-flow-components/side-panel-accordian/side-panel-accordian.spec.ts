import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SidePanelAccordian } from './side-panel-accordian';

describe('SidePanelAccordian', () => {
  let component: SidePanelAccordian;
  let fixture: ComponentFixture<SidePanelAccordian>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidePanelAccordian]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SidePanelAccordian);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
