import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TriggerBlocksService } from './trigger-blocks.service';

interface TriggerBlocksData {
  blocks: {
    [key: string]: {
      parameters: Array<{ name: string; type: string }>;
      syntax: string;
      description: string;
      shape: string;
    };
  };
}

describe('TriggerBlocksService', () => {
  let service: TriggerBlocksService;
  let httpMock: HttpTestingController;

  const mockData: TriggerBlocksData = {
    blocks: {
      'always': {
        parameters: [
          { name: 'slot_index', type: 'SlotIndex' }
        ],
        syntax: 'test syntax',
        description: 'Test description',
        shape: 'conditional'
      },
      'counter': {
        parameters: [
          { name: 'slot_index', type: 'SlotIndex' }
        ],
        syntax: 'test syntax',
        description: 'Test description',
        shape: 'conditional'
      }
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TriggerBlocksService]
    });
    service = TestBed.inject(TriggerBlocksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load trigger blocks on initialization', () => {
    const req = httpMock.expectOne('assets/triggerBlocks.json');
    expect(req.request.method).toBe('GET');
    req.flush(mockData);
  });

  it('should get all block names', () => {
    const req = httpMock.expectOne('assets/triggerBlocks.json');
    req.flush(mockData);

    service.getBlockNames().subscribe(names => {
      expect(names).toEqual(['always', 'counter']);
    });
  });

  it('should get blocks by shape', () => {
    const req = httpMock.expectOne('assets/triggerBlocks.json');
    req.flush(mockData);

    service.getBlocksByShape('conditional').subscribe(blocks => {
      expect(blocks.length).toBe(2);
    });
  });

  it('should search blocks by name', () => {
    const req = httpMock.expectOne('assets/triggerBlocks.json');
    req.flush(mockData);

    service.searchBlocks('always').subscribe(results => {
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('always');
    });
  });
});
