import { Observable } from 'rxjs';
import { TriggerBlock, TriggerBlocksCollection } from '../models/trigger-block.model';

/**
 * Abstract data provider interface for trigger blocks
 * This allows easy switching between HTTP service and WebSocket in the future
 */
export abstract class TriggerBlockDataProvider {
  /**
   * Get all trigger blocks
   */
  abstract getTriggerBlocks(): Observable<TriggerBlocksCollection | null>;

  /**
   * Get a specific block by name
   */
  abstract getBlock(blockName: string): Observable<TriggerBlock | null>;

  /**
   * Get all block names
   */
  abstract getBlockNames(): Observable<string[]>;

  /**
   * Get blocks by shape type
   */
  abstract getBlocksByShape(shape: string): Observable<TriggerBlock[]>;

  /**
   * Get blocks grouped by shape
   */
  abstract getBlocksGroupedByShape(): Observable<Map<string, Array<{ name: string; block: TriggerBlock }>>>;

  /**
   * Search blocks by name or description
   */
  abstract searchBlocks(query: string): Observable<Array<{ name: string; block: TriggerBlock }>>;
}
