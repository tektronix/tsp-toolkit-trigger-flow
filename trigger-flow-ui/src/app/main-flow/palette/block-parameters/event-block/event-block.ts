import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ActualParameter } from '../../../../models/triggerBlock';
import { EventDefinition, EventListItem } from '../../../../models/triggerBlock';
import { Textbox } from '../../../../custom-controls/textbox/textbox';
import { Dropdown } from '../../../../custom-controls/dropdown/dropdown';
import { TriggerFlowDataService } from '../../../../services/triggerFlowDataService';
import { SlotChannelList } from '../../../../models/slotChannelModel';
import {
  normalizeParameterValues,
  ParamConstraintLike,
  ParamControlType,
  resolveParameterOptions,
  resolveParamControlType,
} from '../../../../models/blockParameterHelper';
import { Checkbox } from '../../../../custom-controls/checkbox/checkbox';
import { RadioButton } from '../../../../custom-controls/radio-button/radio-button';

interface EventParamView {
  name: string;
  type?: string;
  options?: { label: string; value: string }[] | null;
  constraints?: Record<string, ParamConstraintLike> | null;
}

// Stable UI ordering for event types.
//
// Why this is required:
//
// Object.keys(triggerEvents) does not guarantee a meaningful
// user-facing order and may vary depending on catalog load timing.
//
// The first event type is auto-selected when the block initializes.
//
// If a slot-dependent event (event_notify_n/event_at_limit)
// becomes the first item before model-slot context is fully ready,
// its dependent params may normalize using fallback defaults.
//
// Using a fixed ordering guarantees deterministic behavior
// and avoids unstable initialization paths.
const EVENT_TYPE_ORDER = [
  'event_digio',
  'event_notify_n',
  'event_generator',
  'event_timer',
  'event_tsplink',
  'event_at_limit',
];

// Fallback event set used when trigger_events has not arrived from catalog yet.
// This ensures the Event custom UI still shows the expected checkboxes/parameter names.
const FALLBACK_EVENT_DEFINITIONS: Record<string, { parameters: EventParamView[] }> = {  
  event_digio: {
    parameters: [{ name: 'digio_trigger_line' }],
  },
  event_notify_n: {
    parameters: [{ name: 'slot_index' }, { name: 'notify_event_number' }],
  },
  event_at_limit: {
    parameters: [{ name: 'slot_index' }, { name: 'channel_index' }],
  },
  event_generator: {
    parameters: [{ name: 'generator_number' }],
  },
  event_timer: {
    parameters: [{ name: 'trigger_timer_number' }],
  },
  event_tsplink: {
    parameters: [{ name: 'trigger_line' }],
  },
};

@Component({
  selector: 'app-event-block',
  imports: [Textbox, Dropdown, Checkbox, RadioButton],
  templateUrl: './event-block.html',
  styleUrl: './event-block.scss',
})
export class EventBlockComponent implements OnChanges {
  private triggerFlowDataService = inject(TriggerFlowDataService);

  // User must keep at least 1 event selected
  // User can select at most 4 events
  private readonly MIN_EVENTS = 1;
  private readonly MAX_EVENTS = 4;

  @Input() param!: ActualParameter;
  @Input() triggerEvents!: Record<string, EventDefinition>;
  @Input() selectionMode: 'single' | 'multi' = 'multi';
  @Input() modelNodeId = 'localnode';
  @Input() modelSlotIndex = 1;
  @Output() valueChange = new EventEmitter<void>();

  eventTypes: string[] = [];
  private slotChannelList: SlotChannelList | null = null;

  ngOnChanges() {
    this.slotChannelList = this.triggerFlowDataService.getSlotChannelList();

    const availableEventTypes =
      this.triggerEvents && Object.keys(this.triggerEvents).length > 0
        ? Object.keys(this.triggerEvents)
        : Object.keys(FALLBACK_EVENT_DEFINITIONS);

    // Apply stable UI ordering while still allowing unknown future
    // event types to appear at the end automatically.
    this.eventTypes = [
      ...EVENT_TYPE_ORDER.filter((type) => availableEventTypes.includes(type)),
      ...availableEventTypes.filter((type) => !EVENT_TYPE_ORDER.includes(type)),
    ];

    // Ensure param.value is initialized for both schema variants.
    if (this.param.type === 'EventList' && !Array.isArray(this.param.value)) {
      this.param.value = [];
    }

    if (this.param.type === 'EventItem' && Array.isArray(this.param.value)) {
      const first = this.param.value[0] ?? null;
      this.param.value = first;
    }

    // Event block allows only one event selection.
    if (this.selectionMode === 'single' && this.selectedEvents.length > 1) {
      this.param.value = [this.selectedEvents[0]];
      this.valueChange.emit();
    }

    // Enforce max 4 in multi mode. (not only in click handlers),
    // so incoming/preloaded values cannot violate the limit.
    if (!this.isSingleSelection && this.selectedEvents.length > this.MAX_EVENTS) {
      this.param.value = this.selectedEvents.slice(0, this.MAX_EVENTS);
      this.valueChange.emit();
    }

    // Every event block must always contain at least one selected event.
    //
    // Important:
    // UI dropdowns may visually show default values even when the
    // underlying params object is still empty.
    //
    // That leads to generated scripts missing required values.
    //
    // To keep UI state and model state synchronized, we immediately
    // create a fully initialized event whenever selection becomes empty.
    if (this.selectedEvents.length < this.MIN_EVENTS && this.eventTypes.length > 0) {
      const initialized = this.createInitializedEvent(this.eventTypes[0]);

      if (this.param.type === 'EventItem') {
        this.param.value = initialized;
      } else {
        this.param.value = [initialized];
      }

      this.valueChange.emit();
    }

    //  IMPORTANT:
    // Re-normalize all existing events whenever inputs change.
    //
    // Why:
    // 
    // Existing stored event payloads may become stale when:
    // - trigger catalog changes
    // - slot/channel inventory changes
    // - trigger model slot changes
    // - old flows are loaded from backend
   
    // normalizeParameterValues() guarantees:
    // - invalid stale values get corrected
    // - dependent dropdowns stay synchronized
    // - required defaults are restored
    // - generated scripts always receive valid params
    const normalizedEvents = this.selectedEvents.map((eventItem) => ({
      ...eventItem,
      params: normalizeParameterValues(
        this.getParamsForType(eventItem.type),
        eventItem.params ?? {},
        this.slotChannelList,
        this.modelNodeId,
        this.modelSlotIndex,
      ),
    }));

    if (this.param.type === 'EventItem') {
      this.param.value = normalizedEvents[0] ?? null;
    } else {
      this.param.value = normalizedEvents;
    }
  }
  
  get isSingleSelection(): boolean {
    return this.selectionMode === 'single';
  }

  get selectedEvents(): EventListItem[] {
    const value = this.param.value;

    if (Array.isArray(value)) {
      return value as EventListItem[];
    }

    // Wrap single EventItem as a one-element array to simplify template logic.
    if (value && typeof value === 'object' && 'type' in value) {
      return [value as EventListItem];
    }

    return [];
  }

  isSelected(type: string): boolean {
    return this.selectedEvents.some((e) => e.type === type);
  }

  // Disabled state logic for event type checkboxes:
  // - disable unchecked when 4 already selected
  // - disable last checked item to keep minimum 1
  isEventTypeDisabled(type: string): boolean {
    const selected = this.isSelected(type);

    // Disable unchecked boxes when 4 are already selected (prevents selecting a 5th).
    if (!selected && this.selectedEvents.length >= this.MAX_EVENTS) {
      return true;
    }

    // Disable the only remaining checked box to preserve minimum selection = 1.
    if (selected && this.selectedEvents.length <= this.MIN_EVENTS) {
      return true;
    }

    return false;
  }

  toggleEvent(type: string) {
    if (this.isSingleSelection) {
      this.selectSingleEvent(type);
      return;
    }

    const existing = this.selectedEvents.find((e) => e.type === type);

    if (existing) {
      // Guard in handler as well (UI disable alone is not sufficient).
      if (this.selectedEvents.length <= this.MIN_EVENTS) return;
      this.param.value = this.selectedEvents.filter((e) => e.type !== type);
    } else {
      if (this.selectedEvents.length >= this.MAX_EVENTS) return;

      const newItem = this.createInitializedEvent(type);

      this.param.value = [...this.selectedEvents, newItem];
    }

    this.valueChange.emit();
  }

  onEventCheckedChange(type: string, checked: boolean): void {
    const selected = this.isSelected(type);

    if (checked && !selected) {
      this.toggleEvent(type);
    }

    if (!checked && selected) {
      this.toggleEvent(type);
    }
  }

  selectSingleEvent(type: string) {
    const existing = this.selectedEvents.find((e) => e.type === type);

    const selected = existing ?? this.createInitializedEvent(type);

    if (this.param.type === 'EventItem') {
      this.param.value = selected;
    } else {
      this.param.value = [selected];
    }
    this.valueChange.emit();
  }

  getParamsForType(type: string) {
    // Prefer catalog data; fallback keeps the UI usable before catalog arrival.
    return this.triggerEvents[type]?.parameters || FALLBACK_EVENT_DEFINITIONS[type]?.parameters || [];
  }

  getParamValue(type: string, paramName: string): string {
    const eventItem = this.selectedEvents.find((event) => event.type === type);
    const stored = eventItem?.params?.[paramName];
    
    // Dropdown controls work with strings, so normalize stored numbers/strings to one shape.
    return stored === undefined || stored === null
      ? ''
      : `${stored}`;
  }
  
  getControlType(param: EventParamView): ParamControlType {
    const hasStaticOptions = (param.options?.length ?? 0) > 0;

    const hasConstraintOptions =
      !!param.constraints &&
      Object.values(param.constraints).some(
        (constraint) => (constraint.options?.length ?? 0) > 0,
      );

    return resolveParamControlType({
      name: param.name,
      type: param.type,
      hasOptions: hasStaticOptions || hasConstraintOptions,
    });
  }

  updateParam(type: string, paramName: string, value: string | number) {
    const alreadySelected = this.selectedEvents.some((e) => e.type === type);
    if (!alreadySelected) {
      // Editing a field implies intent to use that event; auto-select it.
      // Respect max=4 while auto-selecting.
      if (this.isSingleSelection) {
        this.selectSingleEvent(type);
      } else {
        if (this.selectedEvents.length >= this.MAX_EVENTS) {
          return;
        }

        this.param.value = [...this.selectedEvents, this.createInitializedEvent(type)];
      }
    }

    const normalized = this.selectedEvents.map((e) => {
      if (e.type !== type) {
        return e;
      }

      const updatedParams = {
        ...e.params,
        [paramName]: value,
      };

      return {
        ...e,
        params: normalizeParameterValues(
          this.getParamsForType(type),
          updatedParams,
          this.slotChannelList,
          this.modelNodeId,
          this.modelSlotIndex,
        ),
      };
    });

    if (this.param.type === 'EventItem') {
      this.param.value = normalized[0] ?? null;
    } else {
      this.param.value = normalized;
    }
    this.valueChange.emit();
  }

  getOptions(type: string, param: EventParamView): string[] {
    return resolveParameterOptions(param, {
      values: this.getParamValues(type),
      slotChannelList: this.slotChannelList,
      modelNodeId: this.modelNodeId,
      modelSlotIndex: this.modelSlotIndex,
    });
  }

  private getParamValues(type: string): Record<string, string | number> {
    const eventItem = this.selectedEvents.find((event) => event.type === type);
    return eventItem?.params ?? {};
  }

  // Creates a fully initialized event payload.
  //
  // Why this is required:
  //
  // Event dropdown controls can visually display catalog defaults even
  // when the underlying params object is still empty.
  //
  // Example:
  //
  // UI shows:
  //   slot_index = 1
  //   channel_index = 1
  //
  // But actual stored payload may still be:
  //   params = {}
  //
  // Generated scripts only use stored params, not UI fallback values.
  //
  // To avoid UI/model desynchronization, every newly selected event
  // must immediately receive normalized parameter values.
  //
  // This method:
  // 1. Seeds slot-dependent parameters
  // 2. Resolves dependent dropdown options
  // 3. Applies catalog defaults and constraint normalization
  // 4. Guarantees script-safe event payloads
  //
  // This method must be the single authoritative path for creating
  // new EventListItem instances.
  private createInitializedEvent(type: string): EventListItem {
    const rawParams: Record<string, string | number> = {};

    // Pre-seed slot_index with model slot when supported.
    // This avoids undefined-dependent option resolution.
    const paramsForType = this.getParamsForType(type);

    const hasSlotIndex = paramsForType.some((p) => p.name === 'slot_index');

    if (hasSlotIndex) {
      rawParams['slot_index'] = this.modelSlotIndex;
    }

    // Normalize immediately so dependent fields
    // (channel_index, notify_event_number, etc.)
    // receive valid defaults.
    const normalized = normalizeParameterValues(
      paramsForType,
      rawParams,
      this.slotChannelList,
      this.modelNodeId,
      this.modelSlotIndex,
    );
    
    return {
      type,
      params: normalized,
    };
  }
}
