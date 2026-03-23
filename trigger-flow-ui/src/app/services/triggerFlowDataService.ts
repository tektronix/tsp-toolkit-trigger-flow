import { Injectable, signal, computed } from '@angular/core';
import { InitialPayload, TriggerFlowStatePayload, Catalog, SlotChannelList } from '../models/trigger-blocks.model';

@Injectable({
  providedIn: 'root'
})
export class TriggerFlowDataService {
  // Initial payload (set once, doesn't change)
  private initialPayload = signal<InitialPayload | null>(null);
  readonly initialPayload$ = this.initialPayload.asReadonly();

  // State payload (updates frequently)
  private statePayload = signal<TriggerFlowStatePayload | null>(null);
  readonly statePayload$ = this.statePayload.asReadonly();

  readonly catalog = computed(() => this.initialPayload()?.catalog);
  readonly slotChannelList = computed(() => this.initialPayload()?.slot_channel_list);
  //readonly state = computed(() => this.statePayload()?.state);

  // Set initial payload (called once)
  setInitialPayload(payload: InitialPayload): void {
    if (this.initialPayload() === null) {
      this.initialPayload.set(payload);
    } else {
      console.warn('Initial payload already set, ignoring new value');
    }
  }

  // Update state payload (called multiple times)
  updateStatePayload(payload: TriggerFlowStatePayload): void {
    this.statePayload.set(payload);
    console.log('State payload updated:', payload);
  }

  // Getters for direct access
  getInitialPayload(): InitialPayload | null {
    return this.initialPayload();
  }

  getStatePayload(): TriggerFlowStatePayload | null {
    return this.statePayload();
  }

  getCatalog(): Catalog | undefined {
    return this.initialPayload()?.catalog;
  }

  getSlotChannelList(): SlotChannelList | undefined {
    return this.initialPayload()?.slot_channel_list;
  }

//   getState(): any {
//     return this.statePayload()?.state;
//   }
}