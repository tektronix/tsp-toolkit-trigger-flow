import { Component, EventEmitter, Input, OnChanges, Output, inject } from '@angular/core';
import { ActualParameter, EventDefinition, EventListItem } from '../../../../models/triggerBlock';
import { Dropdown } from '../../../../custom-controls/dropdown/dropdown';
import { ModelResourceAllocationService } from '../../../../services/model-resource-allocation.service';
import {
  getBlockParameterDisplayName,
  getEventTypeLabel,
  getModuleConstrainedOptions,
} from '../../../../models/blockParameterHelper';
import { FormsModule } from '@angular/forms';

interface ParamView {
  name: string;
  label: string;
  options: string[];
  selected: string;
}

/**
 * Renders one fixed trigger event (e.g. `event_notify_n`) as a small set of
 * dropdowns. Stored on `param.value` as `EventListItem` so the backend
 * serializer reuses the EventItem / EventList path.
 *
 * `slot_index` is intentionally not rendered (and not stored) — the parent
 * block already owns the slot. The component looks up the parent block's
 * module via `blockId` to pick the SMU vs PSU constraint branch.
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
    const module = this.blockId ? this.resourceService.getModuleForBlock(this.blockId) : null;

    this.paramsToRender = (this.eventDefinition?.parameters ?? [])
      .filter((p) => p.name !== 'slot_index')
      .map((p) => {
        // Seed catalog default into stored value on first render so subsequent
        // edits (which are what trigger backend syncs) start from a valid state.
        let selected = this.readStored(p.name);
        if (selected === '' && p.default != null) {
          selected = `${p.default}`;
          this.writeStored(p.name, selected);
        }
        return {
          name: p.name,
          label: getBlockParameterDisplayName(p.name),
          options: getModuleConstrainedOptions(p, module),
          selected,
        };
      });
  }

  onChange(name: string, value: string) {
    // `p.selected` is already updated by the two-way binding on <app-dropdown>;
    // here we only persist the new value into the parameter's stored EventListItem.
    this.writeStored(name, value);
    this.valueChange.emit();
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
