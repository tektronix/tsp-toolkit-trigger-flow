import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomNode } from './custom-node';

describe('CustomNode', () => {
  let component: CustomNode;
  let fixture: ComponentFixture<CustomNode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomNode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomNode);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
