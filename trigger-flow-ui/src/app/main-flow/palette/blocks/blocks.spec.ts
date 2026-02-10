import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Blocks } from './blocks';

describe('Blocks', () => {
  let component: Blocks;
  let fixture: ComponentFixture<Blocks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Blocks]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Blocks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
