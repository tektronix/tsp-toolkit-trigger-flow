import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpecificEvent } from './specific-event';

describe('SpecificEvent', () => {
  let component: SpecificEvent;
  let fixture: ComponentFixture<SpecificEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpecificEvent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpecificEvent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
