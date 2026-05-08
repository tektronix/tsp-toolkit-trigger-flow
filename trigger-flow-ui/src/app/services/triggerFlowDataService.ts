import { Injectable, signal } from '@angular/core';
import { InitialPayload, Catalog, EventDefinition } from '../models/triggerBlock';
import { SlotChannelList } from '../models/slotChannelModel';
import { TriggerFlowStatePayload, TriggerModel } from '../models/triggerFlowState';

@Injectable({
  providedIn: 'root',
})
export class TriggerFlowDataService {
  // Canonical reactive state used by UI/components
  private catalog = signal<Catalog | null>(null);
  readonly catalog$ = this.catalog.asReadonly();

  private slotChannelList = signal<SlotChannelList | null>(null);
  readonly slotChannelList$ = this.slotChannelList.asReadonly();

  private models = signal<Record<string, TriggerModel>>({});
  readonly models$ = this.models.asReadonly();

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

    this.models.set(payload.models);
  }

  // Optional synchronous getters
  getCatalog(): Catalog | null {
    return this.catalog();
  }

  getTriggerEvents(): Record<string, EventDefinition> {
    return this.catalog()?.trigger_events || {};
  }

  getSlotChannelList(): SlotChannelList | null {
    return this.slotChannelList();
  }

  // Optional debug snapshots
  getInitialPayloadSnapshot(): InitialPayload | null {
    return this.initialPayloadSnapshot;
  }

  getStatePayloadSnapshot(): TriggerFlowStatePayload | null {
    return this.statePayloadSnapshot;
  }
}
