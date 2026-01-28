import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaletteItem } from './palette-item';

describe('PaletteItem', () => {
  let component: PaletteItem;
  let fixture: ComponentFixture<PaletteItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaletteItem]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PaletteItem);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
