import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Palette } from './palette';

describe('Palette', () => {
  let component: Palette;
  let fixture: ComponentFixture<Palette>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Palette]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Palette);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
