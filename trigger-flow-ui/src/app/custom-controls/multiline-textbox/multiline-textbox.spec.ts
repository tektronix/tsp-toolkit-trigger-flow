import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MultilineTextbox } from './multiline-textbox';

describe('MultilineTextbox', () => {
  let component: MultilineTextbox;
  let fixture: ComponentFixture<MultilineTextbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultilineTextbox]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MultilineTextbox);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
