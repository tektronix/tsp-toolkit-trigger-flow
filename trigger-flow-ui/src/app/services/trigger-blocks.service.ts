import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TriggerBlockParameter {
  name: string;
  type: string;
  default?: string | number;
  range?: {
    min: string;
    max: string;
  };
  options?: Array<{
    label: string;
    value: string | number;
  }>;
  constraints?: any;
}

export interface TriggerBlock {
  parameters: TriggerBlockParameter[];
  syntax: string;
  description: string;
  shape: string;
}

export interface TriggerEvent {
  parameters: TriggerBlockParameter[];
  syntax: string;
  shape: string;
}

export interface TriggerBlocksData {
  blocks: { [key: string]: TriggerBlock };
  trigger_events: { [key: string]: TriggerEvent };
}

@Injectable({
  providedIn: 'root'
})
export class TriggerBlocksService {
  
  constructor(private http: HttpClient) { }

  getTriggerBlocks(): Observable<TriggerBlocksData> {
    return this.http.get<TriggerBlocksData>('assets/triggerBlocks.json');
  }
}
