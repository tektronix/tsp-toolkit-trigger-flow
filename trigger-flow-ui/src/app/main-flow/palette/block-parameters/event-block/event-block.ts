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

interface EventParamView {
  name: string;
  type?: string;
  options?: { label: string; value: string }[] | null;
  constraints?: Record<string, ParamConstraintLike> | null;
}

// Fallback event set used when trigger_events has not arrived from catalog yet.
// This ensures the Event custom UI still shows the expected checkboxes/parameter names.
const FALLBACK_EVENT_DEFINITIONS: Record<string, { parameters: EventParamView[] }> = {
  event_notify_in: {
    parameters: [{ name: 'slot_index' }, { name: 'notify_event_number' }],
  },
  event_digio: {
    parameters: [{ name: 'digio_trigger_line' }],
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
  imports: [Textbox, Dropdown],
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

    const actualEventTypes = this.triggerEvents ? Object.keys(this.triggerEvents) : [];

    if (actualEventTypes.length > 0) {
      this.eventTypes = actualEventTypes;
    } else {
      this.eventTypes = Object.keys(FALLBACK_EVENT_DEFINITIONS);
    }

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

    // Enforce min 1 in multi mode.
    // If nothing is selected, auto-select first available event type to keep valid state.
    if (!this.isSingleSelection && this.selectedEvents.length < this.MIN_EVENTS && this.eventTypes.length > 0) {
      this.param.value = [{ type: this.eventTypes[0], params: {} }];
      this.valueChange.emit();
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

      const newItem: EventListItem = {
        type,
        params: normalizeParameterValues(
          this.getParamsForType(type),
          {
            slot_index: this.modelSlotIndex,
          },
          this.slotChannelList,
          this.modelNodeId,
          this.modelSlotIndex,
        ),
      };

      this.param.value = [...this.selectedEvents, newItem];
    }

    this.valueChange.emit();
  }

  selectSingleEvent(type: string) {
    const existing = this.selectedEvents.find((e) => e.type === type);

    const selected = existing ?? {
      type,
      params: normalizeParameterValues(
        this.getParamsForType(type),
        {
          slot_index: this.modelSlotIndex,
        },
        this.slotChannelList,
        this.modelNodeId,
        this.modelSlotIndex,
      ),
    };

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
    const value = eventItem?.params?.[paramName];
    // Dropdown controls work with strings, so normalize stored numbers/strings to one shape.
    return value === undefined || value === null ? '' : `${value}`;
  }

  getControlType(param: { name: string; type?: string; options?: { value: string }[] | null }): ParamControlType {
    return resolveParamControlType({
      name: param.name,
      type: param.type,
      hasOptions: (param.options?.length ?? 0) > 0,
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

        this.param.value = [...this.selectedEvents, { type, params: {} }];
      }
    }

    const updated = this.selectedEvents.map((e) => {
      if (e.type === type) {
        return {
          ...e,
          params: {
            ...e.params,
            [paramName]: value,
          },
        };
      }
      return e;
    });

    // Re-run dependent option/value normalization immediately so the UI and payload
    // do not retain stale values after constrained fields change.
    const normalized = updated.map((eventItem) =>
      eventItem.type === type
        ? {
            ...eventItem,
            params: normalizeParameterValues(
              this.getParamsForType(eventItem.type),
              eventItem.params,
              this.slotChannelList,
              this.modelNodeId,
              this.modelSlotIndex,
            ),
          }
        : eventItem,
    );

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
}