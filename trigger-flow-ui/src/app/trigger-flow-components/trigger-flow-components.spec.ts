import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TriggerFlowComponents } from './trigger-flow-components';

describe('TriggerFlowComponents', () => {
  let component: TriggerFlowComponents;
  let fixture: ComponentFixture<TriggerFlowComponents>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TriggerFlowComponents]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TriggerFlowComponents);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
