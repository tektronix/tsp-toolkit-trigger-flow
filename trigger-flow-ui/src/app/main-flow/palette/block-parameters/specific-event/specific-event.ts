import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ActualParameter, EventDefinition, EventListItem } from '../../../../models/triggerBlock';
import { Dropdown } from '../../../../custom-controls/dropdown/dropdown';
import { ModelResourceAllocationService } from '../../../../services/model-resource-allocation.service';
import {
  getBlockParameterDisplayName,
  getEventTypeLabel,
  getModuleConstrainedOptions,
  ParamOptionSource,
} from '../../../../models/blockParameterHelper';
import { FormsModule } from '@angular/forms';

interface ParamView {
  name: string;
  label: string;
  options: string[];
  selected: string;
  /** Non-null when the stored value isn't in the currently valid options.
   * The dropdown renders it disabled with an error-tint style so the
   * user sees the stale binding truthfully. */
  invalidOption: string | null;
}

/**
 * Renders one fixed trigger event (e.g. `event_notify_n`) as a small set of
 * dropdowns. Stored on `param.value` as `EventListItem` so the backend
 * serializer reuses the EventItem / EventList path.
 *
 * The event's `slot_index` is its own dropdown (independent of the parent
 * block's slot) listing every installed slot on the node. Other parameters
 * (e.g. `notify_event_number`) pick their constraint branch (SMU/PSU) from
 * the module of whichever slot the user selects in this event's slot dropdown
 * — not from the parent block's module.
 */
@Component({
  selector: 'app-specific-event',
  imports: [Dropdown, FormsModule],
  templateUrl: './specific-event.html',
  styleUrl: './specific-event.scss',
})
export class SpecificEvent implements OnChanges {
  private resourceService = inject(ModelResourceAllocationService);

  @Input() param!: ActualParameter;
  @Input() eventDefinition: EventDefinition | null = null;
  @Input() blockId: string | null = null;
  @Output() valueChange = new EventEmitter<void>();

  // Built once per input change so the template never re-resolves on each tick.
  paramsToRender: ParamView[] = [];

  get typeLabel(): string {
    return getEventTypeLabel(this.param?.type);
  }

  ngOnChanges() {
    // Block just added or panel just opened: seed valid defaults so the
    // backend gets a complete event payload from the start.
    if (this.rebuild()) {
      this.valueChange.emit();
    }
  }

  onChange(name: string, value: string) {
    // User edited a control. Persist, rebuild (so changing slot_index
    // re-resolves sibling options and snaps stale values), then emit once.
    this.writeStored(name, value);
    this.rebuild();
    this.valueChange.emit();
  }

  // Returns true if a value had to be written (initial seed or stale snap).
  private rebuild(): boolean {
    const slotOptions = this.blockId
      ? this.resourceService.getNodeSlotsForBlock(this.blockId).map((s) => `${s.slotId}`)
      : [];
    const defs = this.eventDefinition?.parameters ?? [];
    let changed = false;

    // slot_index is iterated first (per catalog order), so by the time a
    // sibling resolves its module-constrained options, slot_index is already
    // seeded into the stored value.
    this.paramsToRender = defs.map((p) => {
      const { options, invalidOption } = this.optionsFor(p, slotOptions);
      let selected = this.readStored(p.name);

      // Empty stored + no valid options: nothing to render usefully. The
      // template's @if (p.options.length) gate hides the row.
      if (selected === '' && options.length > 0) {
        selected = p.default != null && options.includes(`${p.default}`) ? `${p.default}` : options[0];
        this.writeStored(p.name, selected);
        changed = true;
      }

      return {
        name: p.name,
        label: getBlockParameterDisplayName(p.name),
        options,
        selected,
        invalidOption,
      };
    });

    return changed;
  }

  /**
   * Compute the option list and (optional) invalid-entry marker for one
   * event parameter. The prepend-invalid rule is scoped to two shapes
   * only — `slot_index` and `constraints`-carrying params (SMU/PSU). All
   * other params keep their pre-existing behavior so unrelated controls
   * aren't affected.
   */
  private optionsFor(
    param: ParamOptionSource & { name: string },
    slotOptions: string[],
  ): { options: string[]; invalidOption: string | null } {
    if (param.name === 'slot_index') {
      const stored = this.readStored('slot_index');
      if (stored !== '' && !slotOptions.includes(stored)) {
        return { options: [stored, ...slotOptions], invalidOption: stored };
      }
      return { options: [...slotOptions], invalidOption: null };
    }

    const validOptions = this.constrainedOptionsFor(param);

    if (param.constraints) {
      const stored = this.readStored(param.name);
      if (stored !== '' && !validOptions.includes(stored)) {
        return { options: [stored, ...validOptions], invalidOption: stored };
      }
    }

    // Every other param: preserve pre-existing behavior.
    return { options: validOptions, invalidOption: null };
  }

  private constrainedOptionsFor(param: ParamOptionSource & { name: string }): string[] {
    const slot = this.readStored('slot_index');
    const slotModule =
      slot && this.blockId ? this.resourceService.getModuleForNodeSlot(this.blockId, slot) : null;
    return getModuleConstrainedOptions(param, slotModule);
  }

  private readStored(name: string): string {
    const v = (this.param.value as EventListItem | null)?.params?.[name];
    return v == null ? '' : `${v}`;
  }

  private writeStored(name: string, value: string | number) {
    const stored = (this.param.value as EventListItem | null)?.params ?? {};
    this.param.value = { type: this.param.type, params: { ...stored, [name]: value } };
  }
}
