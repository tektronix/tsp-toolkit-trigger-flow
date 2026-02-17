import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, map, shareReplay, tap } from 'rxjs';
import { TriggerBlock, TriggerBlocksCollection } from '../models/trigger-block.model';
import { TriggerBlockDataProvider } from './trigger-block-data-provider';

@Injectable({
  providedIn: 'root'
})
export class TriggerBlocksService extends TriggerBlockDataProvider {
  private http = inject(HttpClient);
  private triggerBlocks$ = new BehaviorSubject<TriggerBlocksCollection | null>(null);
  private readonly TRIGGER_BLOCKS_PATH = 'assets/triggerBlocks.json';

  constructor() {
    super();
    this.loadTriggerBlocks();
  }

  /**
   * Load trigger blocks from JSON file
   */
  private loadTriggerBlocks(): void {
    this.http.get<TriggerBlocksCollection>(this.TRIGGER_BLOCKS_PATH)
      .pipe(
        tap(data => console.log('Trigger blocks loaded:', Object.keys(data.blocks).length)),
        shareReplay(1)
      )
      .subscribe({
        next: (data) => this.triggerBlocks$.next(data),
        error: (error) => console.error('Error loading trigger blocks:', error)
      });
  }

  /**
   * Get all trigger blocks as an observable
   */
  getTriggerBlocks(): Observable<TriggerBlocksCollection | null> {
    return this.triggerBlocks$.asObservable();
  }

  /**
   * Get a specific block by name
   */
  getBlock(blockName: string): Observable<TriggerBlock | null> {
    return this.triggerBlocks$.pipe(
      map(data => data?.blocks[blockName] || null)
    );
  }

  /**
   * Get all block names
   */
  getBlockNames(): Observable<string[]> {
    return this.triggerBlocks$.pipe(
      map(data => data ? Object.keys(data.blocks) : [])
    );
  }

  /**
   * Get blocks by shape type
   */
  getBlocksByShape(shape: string): Observable<TriggerBlock[]> {
    return this.triggerBlocks$.pipe(
      map(data => {
        if (!data) return [];
        return Object.entries(data.blocks)
          .filter(([_, block]) => block.shape === shape)
          .map(([_, block]) => block);
      })
    );
  }

  /**
   * Get blocks grouped by shape
   */
  getBlocksGroupedByShape(): Observable<Map<string, Array<{ name: string; block: TriggerBlock }>>> {
    return this.triggerBlocks$.pipe(
      map(data => {
        const grouped = new Map<string, Array<{ name: string; block: TriggerBlock }>>();
        if (!data) return grouped;

        Object.entries(data.blocks).forEach(([name, block]) => {
          if (!grouped.has(block.shape)) {
            grouped.set(block.shape, []);
          }
          grouped.get(block.shape)!.push({ name, block });
        });

        return grouped;
      })
    );
  }

  /**
   * Search blocks by name or description
   */
  searchBlocks(query: string): Observable<Array<{ name: string; block: TriggerBlock }>> {
    const lowerQuery = query.toLowerCase();
    return this.triggerBlocks$.pipe(
      map(data => {
        if (!data) return [];
        return Object.entries(data.blocks)
          .filter(([name, block]) => 
            name.toLowerCase().includes(lowerQuery) ||
            block.description.toLowerCase().includes(lowerQuery)
          )
          .map(([name, block]) => ({ name, block }));
      })
    );
  }
}
