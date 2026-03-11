import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BlockParameters } from './block-parameters';

describe('BlockParameters', () => {
  let component: BlockParameters;
  let fixture: ComponentFixture<BlockParameters>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BlockParameters]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BlockParameters);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
