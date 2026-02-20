import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TriggerBlocks } from '../models/trigger-blocks.model';

@Injectable({
  providedIn: 'root'
})
export class TriggerBlocksService {
  
  constructor(private http: HttpClient) { }

  getTriggerBlocks(): Observable<TriggerBlocks> {
    return this.http.get<TriggerBlocks>('assets/triggerBlocks.json');
  }
}
