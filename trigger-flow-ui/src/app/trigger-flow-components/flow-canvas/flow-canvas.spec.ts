import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlowCanvas } from './flow-canvas';

describe('FlowCanvas', () => {
  let component: FlowCanvas;
  let fixture: ComponentFixture<FlowCanvas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FlowCanvas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FlowCanvas);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
