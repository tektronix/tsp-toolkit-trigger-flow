import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BannerDisplay } from './banner-display';

describe('BannerDisplay', () => {
  let component: BannerDisplay;
  let fixture: ComponentFixture<BannerDisplay>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BannerDisplay]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BannerDisplay);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
