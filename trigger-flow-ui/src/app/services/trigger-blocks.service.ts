import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TriggerBlocks } from '../models/trigger-blocks.model';

@Injectable({
  providedIn: 'root'
})
export class TriggerBlocksService {
  private http = inject(HttpClient);


  getTriggerBlocks(): Observable<TriggerBlocks> {
    return this.http.get<TriggerBlocks>('assets/triggerBlocks.json');
  }
}
