import { inject, Injectable, Injector, signal } from '@angular/core';
import { InitialPayload, Catalog, EventDefinition } from '../models/triggerBlock';
import { SlotChannelList } from '../models/slotChannelModel';
import { TriggerFlowStatePayload, TriggerModel } from '../models/triggerFlowState';
import { CanvasBlocksService } from './canvas-blocks.service';
import { DEBUG } from '../debug';

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
  // Lazy lookup to avoid a DI cycle (CanvasBlocksService -> TriggerFlowDataService).
  private injector = inject(Injector);
  private get canvasBlocksService(): CanvasBlocksService {
    return this.injector.get(CanvasBlocksService);
  }

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

  // Update runtime state received from Rust.
  //
  // Recall and Init payloads include a catalog. The catalog must be applied
  // before models so model consumers can resolve block definitions correctly.
  //
  // Systems and Evaluate payloads update the slot/channel list and models only.
  // Their catalog is intentionally omitted because the catalog was already
  // established during Recall or Init.
  updateStatePayload(payload: TriggerFlowStatePayload): void {
    this.statePayloadSnapshot = payload;
    if (DEBUG) console.log('###State payload updated:', payload);

    // ORDER MATTERS: catalog must be set BEFORE models, otherwise any
    // consumer that reacts to models$ (e.g. canvas block restoration) reads
    // a stale/null catalog and cannot resolve block definitions.
    // This case is hit in case of recall session, catalog is getting passed explicitly.
    if (payload.state_type === 'Recall' || payload.state_type === 'Init') {
      // Block ids use a per-instance counter (`node-N`), so a recalled
      // payload almost always reuses ids that match the currently selected
      // id but refer to different blocks. Clear the selection so the
      // parameters panel does not silently rebind to an unrelated recalled
      // block.
      this.canvasBlocksService.clearSelectedBlock();
      
      if (payload.catalog) 
        this.catalog.set(payload.catalog);

      // if (!this.initialPayloadSnapshot) {
      //   this.initialPayloadSnapshot = new InitialPayload({
      //     slot_channel_list: payload.slot_channel_list,
      //     catalog: payload.catalog,
      //   });
      // }

      // Keep slot_channel_list fresh from runtime updates
      this.slotChannelList.set(payload.slot_channel_list);

      // Set models LAST so any subscriber reacting to models change sees a
      // fully populated catalog and slot_channel_list.
      this.canvasBlocksService.loadSessionData(payload.models);
      this.models.set(payload.models);
    } else if (payload.state_type === 'Evaluate' || payload.state_type === 'Systems') {
      // Keep slot_channel_list fresh from runtime updates
      this.slotChannelList.set(payload.slot_channel_list);

      // Reconcile clamped values and per-block errors back onto the existing
      // canvas blocks. The canvas service is the source of truth that the
      // parameters panel reads, so without this the UI keeps showing the
      // pre-clamp value the user just typed.
      this.canvasBlocksService.applyServerValidationResult(payload.models);

      // Set models LAST so any subscriber reacting to models change sees a
      // fully populated catalog and slot_channel_list.
      this.models.set(payload.models);
    }
  }

  resetState(): void {
    this.canvasBlocksService.resetCanvas();
    this.canvasBlocksService.clearSelectedBlock();
    this.catalog.set(null);
    this.slotChannelList.set(null);
    this.models.set({});
    this.initialPayloadSnapshot = null;
    this.statePayloadSnapshot = null;
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
