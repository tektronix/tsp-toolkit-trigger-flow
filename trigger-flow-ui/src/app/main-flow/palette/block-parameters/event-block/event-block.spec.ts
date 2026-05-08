import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventBlockComponent } from './event-block';

describe('EventBlockComponent', () => {
  let component: EventBlockComponent;
  let fixture: ComponentFixture<EventBlockComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventBlockComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventBlockComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
