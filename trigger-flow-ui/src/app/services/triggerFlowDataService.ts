import { Injectable, signal } from '@angular/core';
import { InitialPayload, Catalog } from '../models/triggerBlock';
import { SlotChannelList } from '../models/slotChannelModel';
import { TriggerFlowStatePayload, TriggerModel } from '../models/triggerFlowState';
import { CanvasBlocksService } from './canvas-blocks.service';

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

  private _canvas: CanvasBlocksService | null = null;

  // Optional: raw snapshots for debugging/non-reactive inspection
  private initialPayloadSnapshot: InitialPayload | null = null;
  private statePayloadSnapshot: TriggerFlowStatePayload | null = null;

  setInitialPayload(payload: InitialPayload): void {
    console.log('Initial Payload: ', payload);

    // Always refresh initial payload-derived state so switching/loading sessions
    // cannot leave stale catalog/slot data in memory.
    this.initialPayloadSnapshot = payload;
    this.catalog.set(payload.catalog);
    this.slotChannelList.set(payload.slot_channel_list);

    // If state was received earlier (or already exists), rehydrate canvas blocks
    // now that catalog data is definitely available.
    if (this.statePayloadSnapshot) {
      this.models.set(this.statePayloadSnapshot.models);
      this._canvas?.setBlockData(this.statePayloadSnapshot.models);
    }
  }

  set canvas(canvas: CanvasBlocksService) {
    this._canvas = canvas;

    // If runtime state arrived before CanvasBlocksService was wired,
    // replay the latest snapshot so the canvas can render loaded sessions.
    if (this.statePayloadSnapshot) {
      this._canvas.setBlockData(this.statePayloadSnapshot.models);
    }
  }

  updateStatePayload(payload: TriggerFlowStatePayload): void {
    console.log('update Payload: ', payload);

    this.statePayloadSnapshot = payload;

    // Keep slot_channel_list fresh from runtime updates
    this.slotChannelList.set(payload.slot_channel_list);

    this.models.set(payload.models);
    this._canvas?.setBlockData(payload.models);
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
