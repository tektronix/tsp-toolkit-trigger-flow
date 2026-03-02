import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Textbox } from './textbox';

describe('Textbox', () => {
  let component: Textbox;
  let fixture: ComponentFixture<Textbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Textbox]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Textbox);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
