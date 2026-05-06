import { Injectable, signal } from '@angular/core';
import { InitialPayload, Catalog } from '../models/triggerBlock';
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
    console.log('###State payload updated:', payload);

    // ORDER MATTERS: catalog must be set BEFORE models, otherwise any
    // consumer that reacts to models$ (e.g. canvas block restoration) reads
    // a stale/null catalog and cannot resolve block definitions.
    if (payload.catalog) {
      console.log('###updateStatePayload: setting catalog signal');
      this.catalog.set(payload.catalog);

      if (!this.initialPayloadSnapshot) {
        this.initialPayloadSnapshot = new InitialPayload({
          slot_channel_list: payload.slot_channel_list,
          catalog: payload.catalog,
        });
      }
    } else {
      console.log(
        '###updateStatePayload: payload.catalog is falsy; preserving existing catalog signal =',
        !!this.catalog(),
      );
    }

    // Keep slot_channel_list fresh from runtime updates
    this.slotChannelList.set(payload.slot_channel_list);

    // Set models LAST so any subscriber reacting to models change sees a
    // fully populated catalog and slot_channel_list.
    this.models.set(payload.models);
  }

  // Optional synchronous getters
  getCatalog(): Catalog | null {
    return this.catalog();
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
