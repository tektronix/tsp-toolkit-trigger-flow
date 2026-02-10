import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MainFlow } from './main-flow';

describe('MainFlow', () => {
  let component: MainFlow;
  let fixture: ComponentFixture<MainFlow>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainFlow]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MainFlow);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
