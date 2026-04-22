import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InputNumeric } from './input-numeric';

describe('InputNumeric', () => {
  let component: InputNumeric;
  let fixture: ComponentFixture<InputNumeric>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputNumeric]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InputNumeric);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
