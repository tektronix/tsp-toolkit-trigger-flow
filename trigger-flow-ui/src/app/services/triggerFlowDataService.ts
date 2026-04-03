import { Injectable, signal } from '@angular/core';
import {
  InitialPayload,
  TriggerFlowStatePayload,
  Catalog,
  SlotChannelList,
} from '../models/trigger-blocks.model';

@Injectable({
  providedIn: 'root',
})
export class TriggerFlowDataService {
  // Canonical reactive state used by UI/components
  private catalog = signal<Catalog | null>(null);
  readonly catalog$ = this.catalog.asReadonly();

  private slotChannelList = signal<SlotChannelList | null>(null);
  readonly slotChannelList$ = this.slotChannelList.asReadonly();

  // Keep this as your evolving runtime state slice
  // (replace `any` with your real trigger state type when ready)
  // private triggerState = signal<any | null>(null);
  // readonly triggerState$ = this.triggerState.asReadonly();

  // Optional: raw snapshots for debugging/non-reactive inspection
  private initialPayloadSnapshot: InitialPayload | null = null;
  private statePayloadSnapshot: TriggerFlowStatePayload | null = null;

  setInitialPayload(payload: InitialPayload): void {
    // Set once
    if (!this.initialPayloadSnapshot) {
      this.initialPayloadSnapshot = payload;
      this.catalog.set(payload.catalog);
      this.slotChannelList.set(payload.slot_channel_list);
    } else {
      console.warn('Initial payload already set, ignoring new value');
    }
  }

  updateStatePayload(payload: TriggerFlowStatePayload): void {
    this.statePayloadSnapshot = payload;

    // Keep slot_channel_list fresh from runtime updates
    this.slotChannelList.set(payload.slot_channel_list);

    // Set runtime trigger state when your payload includes it
    // this.triggerState.set(payload.state);
  }

  // Optional synchronous getters
  getCatalog(): Catalog | null {
    return this.catalog();
  }

  getSlotChannelList(): SlotChannelList | null {
    return this.slotChannelList();
  }

  // getTriggerState(): any | null {
  //   return this.triggerState();
  // }

  // Optional debug snapshots
  getInitialPayloadSnapshot(): InitialPayload | null {
    return this.initialPayloadSnapshot;
  }

  getStatePayloadSnapshot(): TriggerFlowStatePayload | null {
    return this.statePayloadSnapshot;
  }
}