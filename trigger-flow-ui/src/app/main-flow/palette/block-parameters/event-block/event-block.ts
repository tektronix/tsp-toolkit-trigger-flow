import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ActualParameter } from '../../../../models/triggerBlock';
import { EventDefinition, EventListItem } from '../../../../models/triggerBlock';
import { Textbox } from '../../../../custom-controls/textbox/textbox';
import { Dropdown } from '../../../../custom-controls/dropdown/dropdown';
import { TriggerFlowDataService } from '../../../../services/triggerFlowDataService';
import { Module, SlotChannelList } from '../../../../models/slotChannelModel';
import {
  getModuleConstrainedOptions,
  normalizeParameterValues,
  ParamConstraintLike,
  ParamControlType,
  resolveParameterOptions,
  resolveParamControlType,
} from '../../../../models/blockParameterHelper';
import { RadioButton } from '../../../../custom-controls/radio-button/radio-button';

interface EventParamView {
  name: string;
  label?: string;
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
    parameters: [{ name: 'digio_trigger_line', label: 'Trigger Line' }],
  },
  event_notify_n: {
    parameters: [{ name: 'slot_index', label: 'Slot' }, { name: 'notify_event_number', label: 'Event Number' }],
  },
  event_at_limit: {
    parameters: [{ name: 'slot_index', label: 'Slot' }, { name: 'channel_index', label: 'Channel' }],
  },
  event_generator: {
    parameters: [{ name: 'generator_number', label: 'Generator Number' }],
  },
  event_timer: {
    parameters: [{ name: 'trigger_timer_number', label: 'Timer Number' }],
  },
  event_tsplink: {
    parameters: [{ name: 'trigger_line', label: 'Trigger Line' }],
  },
};

@Component({
  selector: 'app-event-block',
  imports: [Textbox, Dropdown, RadioButton],
  templateUrl: './event-block.html',
  styleUrl: './event-block.scss',
})
export class EventBlockComponent implements OnChanges {
  private triggerFlowDataService = inject(TriggerFlowDataService);

  // User must keep at least 1 event selected
  // User can select at most 4 events
  readonly MIN_EVENTS = 1;
  readonly MAX_EVENTS = 4;

  @Input() param!: ActualParameter;
  @Input() triggerEvents!: Record<string, EventDefinition>;
  @Input() selectionMode: 'single' | 'multi' = 'multi';
  @Input() modelNodeId = 'localnode';
  @Input() modelSlotIndex = 1;
  /** Bumped on every `models$` / `slotChannelList$` emission. A module swap in
   * the same slot leaves every other input identical, so this is the only
   * signal that re-runs `ngOnChanges` and rebuilds the option lists. */
  @Input() configVersion = 0;
  @Output() valueChange = new EventEmitter<void>();

  eventTypes: string[] = [];

  // Read live so a Systems payload is picked up without a re-selection.
  private get slotChannelList(): SlotChannelList | null {
    return this.triggerFlowDataService.getSlotChannelList();
  }

  get isAddDisabled(): boolean {
    return this.selectedEvents.length >= this.MAX_EVENTS;
  }

  ngOnChanges() {
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
    //
    // Only enforced for single-selection mode ("on event"). In multi mode
    // ("wait on event") the user now drives selection explicitly via
    // per-row dropdowns, so an empty selection is a valid initial state.
    if (
      this.isSingleSelection &&
      this.selectedEvents.length < this.MIN_EVENTS &&
      this.eventTypes.length > 0
    ) {
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
  
  // Placeholder string shown in the per-row event-type dropdown when a row
  // has not yet been assigned an event. Picking this value clears the row.
  readonly EVENT_TYPE_PLACEHOLDER = 'Select';

  // Placeholder string shown in the right-side parameter dropdown when a
  // row has not yet been assigned an event. The dropdown is disabled and
  // displays only this single character so the user sees a layout-stable
  // control before they pick an event type.
  readonly PARAM_PLACEHOLDER = '-';
  readonly placeholderParamOptions = [this.PARAM_PLACEHOLDER];

  get isSingleSelection(): boolean {
    return this.selectionMode === 'single';
  }

  // Options for the multi-mode per-row event type dropdown.
  // The first option is the "Select" placeholder which represents an
  // unassigned slot.
  get eventTypeDropdownOptions(): string[] {
    return [this.EVENT_TYPE_PLACEHOLDER, ...this.eventTypes.map((type) => this.getEventTypeLabel(type))];
  }

  getEventTypeLabel(type: string): string {
    return this.triggerEvents?.[type]?.label ?? type;
  }

  getParamLabel(param: EventParamView): string {
    return param.label ?? param.name;
  }

  private getEventTypeFromLabel(label: string): string {
    const matchedType = this.eventTypes.find((type) => this.getEventTypeLabel(type) === label);
    return matchedType ?? label;
  }

  // Row list rendered in multi-selection mode.
  //
  // Note: "row" here refers to a UI row in the event list.
  //
  // - Each currently selected event is rendered as a row (and can be
  //   independently changed or removed via its event-type dropdown).
  // - A trailing empty row is appended whenever the user can still add
  //   another event (fewer than MAX_EVENTS selected). This gives the
  //   "add one more" affordance without a separate button.
  // - The same event type may now appear in multiple rows, so rows are
  //   identified by index rather than by type.
  get eventRows(): Array<{ event: EventListItem | null }> {
    const rows: Array<{ event: EventListItem | null }> = this.selectedEvents.map((event) => ({
      event,
    }));

    if (rows.length < this.MAX_EVENTS) {
      rows.push({ event: null });
    }

    return rows;
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

  // Multi-mode per-event-row handler: user changed the event type for the
  // event row at `index`.
  //
  // Behavior:
  // - Picking the "Select" placeholder removes the event at this row
  //   (or is a no-op for the trailing empty row).
  // - Picking a real event type either replaces the event at an existing
  //   row or appends a newly initialized event (respecting MAX_EVENTS).
  // - The same event type is allowed in multiple rows, so we do not
  //   deduplicate.
  onEventRowTypeChange(index: number, selectedLabel: string): void {
    if (this.isSingleSelection) return;

    if (selectedLabel === this.EVENT_TYPE_PLACEHOLDER) {
      if (index < this.selectedEvents.length) {
        this.param.value = this.selectedEvents.filter((_, i) => i !== index);
        this.valueChange.emit();
      }
      return;
    }

    const type = this.getEventTypeFromLabel(selectedLabel);

    const newEvent = this.createInitializedEvent(type);
    const events = [...this.selectedEvents];

    if (index < events.length) {
      events[index] = newEvent;
    } else {
      if (events.length >= this.MAX_EVENTS) return;
      events.push(newEvent);
    }

    this.param.value = events;
    this.valueChange.emit();
  }

  // Multi-mode per-event-row getter for a parameter dropdown value.
  // Indexed access ensures duplicates of the same event type stay independent.
  getParamValueForEventRow(index: number, paramName: string): string {
    const eventItem = this.selectedEvents[index];
    const stored = eventItem?.params?.[paramName];

    return stored === undefined || stored === null ? '' : `${stored}`;
  }

  // Multi-mode per-event-row getter for parameter dropdown options.
  // Resolves dependent options against the params of the event at `index`
  // (row-local state) rather than searching by type.
  getOptionsForEventRow(index: number, param: EventParamView): string[] {
    const eventItem = this.selectedEvents[index];
    return this.optionsFor(param, eventItem?.params ?? {}).options;
  }

  // Sibling of getOptionsForEventRow — surfaces the stored value when it
  // isn't in the currently valid options so the picker can flag it.
  getInvalidOptionForEventRow(index: number, param: EventParamView): string | null {
    const eventItem = this.selectedEvents[index];
    return this.optionsFor(param, eventItem?.params ?? {}).invalidOption;
  }

  // Multi-mode per-event-row parameter update.
  // Normalizes the row's params so dependent dropdowns and script
  // generation stay in sync after the change.
  updateParamForEventRow(index: number, paramName: string, value: string | number): void {
    if (index >= this.selectedEvents.length) return;

    const events = this.selectedEvents.map((event, i) => {
      if (i !== index) return event;

      const updatedParams = {
        ...event.params,
        [paramName]: value,
      };

      return {
        ...event,
        params: normalizeParameterValues(
          this.getParamsForType(event.type),
          updatedParams,
          this.slotChannelList,
          this.modelNodeId,
          this.modelSlotIndex,
        ),
      };
    });

    this.param.value = events;
    this.valueChange.emit();
  }

  getOptions(type: string, param: EventParamView): string[] {
    return this.optionsFor(param, this.getParamValues(type)).options;
  }

  // Sibling of getOptions — surfaces the stored value when it isn't in
  // the currently valid options so the picker can flag it. Same rule as
  // specific-event: prepend the stored value with an invalid marker
  // instead of hiding the control or masking the stale binding.
  getInvalidOption(type: string, param: EventParamView): string | null {
    return this.optionsFor(param, this.getParamValues(type)).invalidOption;
  }

  /**
   * Options plus invalid marker for one event parameter. The
   * prepend-invalid rule is scoped to two shapes only — `slot_index` and
   * `constraints`-carrying params (SMU/PSU). All other params fall
   * through to `resolveParameterOptions` with their pre-existing
   * behavior; normalize's snap-to-first ensures their stored values
   * are always in the returned options.
   *
   * `validOptionsFor` deliberately bypasses the shared
   * `resolveParameterOptions` 1..16 fallback for constrained params so
   * a stale slot doesn't silently swap a TSP identifier for a generic
   * numeric.
   */
  private optionsFor(
    param: EventParamView,
    values: Record<string, string | number>,
  ): { options: string[]; invalidOption: string | null } {
    const validOptions = this.validOptionsFor(param, values);

    if (param.name === 'slot_index' || param.constraints) {
      const stored = this.readStored(values, param.name);
      if (stored !== '' && !validOptions.includes(stored)) {
        return { options: [stored, ...validOptions], invalidOption: stored };
      }
    }
    return { options: validOptions, invalidOption: null };
  }

  private validOptionsFor(
    param: EventParamView,
    values: Record<string, string | number>,
  ): string[] {
    if (param.name === 'slot_index') {
      return this.validSlotOptions();
    }
    if (param.constraints) {
      const slotModule = this.slotModuleFor(values['slot_index']);
      return getModuleConstrainedOptions(param, slotModule);
    }
    return resolveParameterOptions(param, {
      values,
      slotChannelList: this.slotChannelList,
      modelNodeId: this.modelNodeId,
      modelSlotIndex: this.modelSlotIndex,
    });
  }

  private validSlotOptions(): string[] {
    return this.slotsForCurrentNode()
      .filter((s) => s.module !== 'Empty')
      .map((s) => `${s.slotId}`);
  }

  private slotModuleFor(slotVal: string | number | undefined): Module | null {
    if (slotVal === undefined || slotVal === null || slotVal === '') return null;
    const slotId = Number(slotVal);
    if (!Number.isFinite(slotId)) return null;
    return this.slotsForCurrentNode().find((s) => s.slotId === slotId)?.module ?? null;
  }

  private slotsForCurrentNode() {
    return this.modelNodeId === 'localnode'
      ? this.slotChannelList?.slots ?? []
      : this.slotChannelList?.nodes?.find((n) => n.nodeId === this.modelNodeId)?.slots ?? [];
  }

  private readStored(
    values: Record<string, string | number>,
    name: string,
  ): string {
    const v = values[name];
    return v === undefined || v === null ? '' : `${v}`;
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
