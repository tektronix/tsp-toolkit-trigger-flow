import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ActualParameter } from '../../../../models/triggerBlock';
import { EventDefinition, EventListItem } from '../../../../models/triggerBlock';
import { Textbox } from '../../../../custom-controls/textbox/textbox';
import { Dropdown } from '../../../../custom-controls/dropdown/dropdown';
import { TriggerFlowDataService } from '../../../../services/triggerFlowDataService';
import { SlotChannelList } from '../../../../models/slotChannelModel';
import { ParamControlType, resolveParamControlType } from '../../../../models/blockParameterHelper';

type EventParamView = {
  name: string;
  options?: { label: string; value: string }[] | null;
};

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

  @Input() param!: ActualParameter;
  @Input() triggerEvents!: Record<string, EventDefinition>;
  @Input() selectionMode: 'single' | 'multi' = 'multi';
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

  toggleEvent(type: string) {
    if (this.isSingleSelection) {
      this.selectSingleEvent(type);
      return;
    }

    const existing = this.selectedEvents.find((e) => e.type === type);

    if (existing) {
      this.param.value = this.selectedEvents.filter((e) => e.type !== type);
    } else {
      if (this.selectedEvents.length >= 4) return;

      const newItem: EventListItem = {
        type,
        params: {},
      };

      this.param.value = [...this.selectedEvents, newItem];
    }

    this.valueChange.emit();
  }

  selectSingleEvent(type: string) {
    const existing = this.selectedEvents.find((e) => e.type === type);

    const selected = existing ?? {
      type,
      params: {},
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
      // Editing a parameter implicitly selects that event type.
      if (this.isSingleSelection) {
        this.selectSingleEvent(type);
      } else {
        if (this.selectedEvents.length >= 4) {
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

    if (this.param.type === 'EventItem') {
      this.param.value = updated[0] ?? null;
    } else {
      this.param.value = updated;
    }
    this.valueChange.emit();
  }

  getOptions(param: { options: { value: string }[] | null }): string[] {
    if (param.options?.length) {
      return param.options.map((o) => o.value);
    }

    const name = (param as { name?: string }).name ?? '';

    if (name === 'slot_index') {
      return this.getSlotIndexOptions();
    }

    if (name === 'channel_index') {
      return this.getChannelIndexOptions();
    }

    // Final fallback options for index/number-like params with no catalog options.
    return Array.from({ length: 16 }, (_, index) => `${index + 1}`);
  }

  private getSlotIndexOptions(): string[] {
    const slots = this.slotChannelList?.slots ?? [];
    const values = slots.map((slot) => `${slot.slotId}`);
    return values.length > 0 ? values : ['1', '2', '3', '4'];
  }

  private getChannelIndexOptions(): string[] {
    const slots = this.slotChannelList?.slots ?? [];
    const unique = new Set<string>();

    for (const slot of slots) {
      for (const channel of slot.channels) {
        unique.add(`${channel.channelIndex}`);
      }
    }

    const values = Array.from(unique).sort((a, b) => Number(a) - Number(b));
    return values.length > 0 ? values : ['1', '2'];
  }
}