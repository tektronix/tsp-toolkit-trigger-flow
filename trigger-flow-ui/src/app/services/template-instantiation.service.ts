import { Injectable, inject } from '@angular/core';
import { CanvasBlocksService } from './canvas-blocks.service';
import { TriggerFlowDataService } from './triggerFlowDataService';
import { FlowNode, FlowSection } from '../main-flow/canvas/canvas';
import { EventListItem, ParameterValue } from '../models/triggerBlock';
import { normalizeParameterValues } from '../models/blockParameterHelper';

export interface TemplateInstantiationHelpers {
  createUniqueNodeId: () => string;
  getNodeCounter: () => number;
  changeSVGPath: (svgPath: string) => string;
}

@Injectable({ providedIn: 'root' })
export class TemplateInstantiationService {
  private canvasBlocksService = inject(CanvasBlocksService);
  private triggerFlowDataService = inject(TriggerFlowDataService);

  private get sections() {
    return this.canvasBlocksService.sections;
  }

  instantiateTemplate(
    templateKey: string,
    dropRect: { x: number; y: number },
    startingSection: FlowSection,
    helpers: TemplateInstantiationHelpers,
  ): void {
    const catalog = this.triggerFlowDataService.catalog$();
    const template = catalog?.templates?.[templateKey];
    if (!template || !template.blocks?.length) {
      console.warn(`Template "${templateKey}" not found in catalog`);
      return;
    }
    const VERTICAL_GAP = 120;
    const SECTION_WIDTH = 400;

    const LINK_PARAM_NAMES = [
      'branch_to_block_name',
      'reference_block_name',
      'reset_branch_count_block_name',
    ];

    const groups = template.blocks.filter((g) => g?.blocks?.length);
    if (groups.length === 0) {
      console.warn(`Template "${templateKey}" has no block groups`);
      return;
    }

    const targetSections: FlowSection[] = [startingSection];
    for (let i = 1; i < groups.length; i++) {
      targetSections.push(this.createSectionForTemplateGroup(startingSection));
    }

    const startingSectionX = (startingSection.positionIndex ?? 0) * SECTION_WIDTH;
    const relativeDropX = dropRect.x - startingSectionX;

    const firstCreatedBlockIds: string[] = [];

    groups.forEach((group, groupIndex) => {
      const section = targetSections[groupIndex];
      const sectionOriginX = (section.positionIndex ?? groupIndex) * SECTION_WIDTH;
      const groupBaseX = sectionOriginX + relativeDropX;

      const idMap = new Map<string, { runtimeBlockId: string; triggerBlockName: string }>();
      const createdBlockIds: string[] = [];
      const newNodes: FlowNode[] = [];

      group.blocks.forEach((tmplBlock, index) => {
        const blockCatalogLabel = tmplBlock.type;
        const palettePath = this.canvasBlocksService.getSVGPathForLabel(blockCatalogLabel);
        const svgPath = helpers.changeSVGPath(palettePath || '');

        const runtimeBlockId = helpers.createUniqueNodeId();
        const nodeCounter = helpers.getNodeCounter();
        const position = {
          x: groupBaseX,
          y: dropRect.y + index * VERTICAL_GAP,
        };

        newNodes.push({
          blockId: runtimeBlockId,
          sectionId: section.id,
          position,
          svgPath,
          catalogLabel: blockCatalogLabel,
          blockType: 'Template',
          input: `input-${nodeCounter}`,
          outputs: [`output-${nodeCounter}`],
          color: '#FFFFFF',
        });

        this.canvasBlocksService.addBlock(
          runtimeBlockId,
          blockCatalogLabel,
          position,
          section.modelName,
          section.slotIndex,
          section.nodeId,
        );

        const created = this.canvasBlocksService.getBlockById(runtimeBlockId);
        const templateTriggerName = tmplBlock.block_parameters?.['trigger_block_name'];
        let triggerName: string;
        if (typeof templateTriggerName === 'string' && templateTriggerName.length > 0) {
          triggerName = this.canvasBlocksService.getUniqueBlockName(templateTriggerName);
          this.canvasBlocksService.updateBlockParameterValue(
            runtimeBlockId,
            'trigger_block_name',
            triggerName,
          );
        } else {
          triggerName = String(
            created?.actual_parameters.find((p) => p.name === 'trigger_block_name')?.value ??
              created?.actual_parameters.find((p) => p.name === 'trigger_block_name')?.default ??
              runtimeBlockId,
          );
        }
        idMap.set(tmplBlock.block_id, {
          runtimeBlockId,
          triggerBlockName: triggerName,
        });
        createdBlockIds.push(runtimeBlockId);
      });

      group.blocks.forEach((tmplBlock) => {
        const mapped = idMap.get(tmplBlock.block_id);
        if (!mapped) return;
        const params = tmplBlock.block_parameters ?? {};

        for (const [paramName, rawValue] of Object.entries(params)) {
          if (rawValue === null || rawValue === undefined) continue;

          if (paramName === 'trigger_block_name') continue;

          let value = rawValue as ParameterValue;

          if (LINK_PARAM_NAMES.includes(paramName) && typeof value === 'string') {
            const target = idMap.get(value);
            if (target) {
              value = target.triggerBlockName;
            }
          }

          this.canvasBlocksService.updateBlockParameterValue(
            mapped.runtimeBlockId,
            paramName,
            value,
          );
        }

        this.initializeEventParameterDefaults(mapped.runtimeBlockId, section);
      });

      this.sections.update((current) =>
        current.map((item) =>
          item.id === section.id ? { ...item, nodes: [...item.nodes, ...newNodes] } : item,
        ),
      );

      if (groupIndex === 0) {
        firstCreatedBlockIds.push(...createdBlockIds);
      }
    });

    this.canvasBlocksService.restoreConnections();

    if (firstCreatedBlockIds.length > 0) {
      this.canvasBlocksService.selectBlock(firstCreatedBlockIds[0]);
    }
  }

  private createSectionForTemplateGroup(reference: FlowSection): FlowSection {
    const existing = this.sections();
    const sectionId = `group-${existing.length + 1}`;
    const modelName = this.generateUniqueModelName(
      `${reference.modelName}_` + `${existing.length + 1}`,
    );
    const nextPositionIndex =
      existing.reduce((max, s) => Math.max(max, s.positionIndex ?? -1), -1) + 1;

    const newSection: FlowSection = {
      id: sectionId,
      modelName,
      slotIndex: reference.slotIndex,
      nodeId: reference.nodeId,
      nodes: [],
      positionIndex: nextPositionIndex,
    };

    this.canvasBlocksService.sections.update((current) => [...current, newSection]);
    return newSection;
  }

  private generateUniqueModelName(base: string): string {
    const existing = new Set(this.sections().map((s) => s.modelName));
    if (!existing.has(base)) return base;
    let i = 2;
    while (existing.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  private initializeEventParameterDefaults(blockId: string, section: FlowSection): void {
    const block = this.canvasBlocksService.getBlockById(blockId);
    if (!block) return;

    const triggerEvents = this.triggerFlowDataService.getTriggerEvents?.() ?? {};
    const slotChannelList = this.triggerFlowDataService.getSlotChannelList?.() ?? null;

    for (const param of block.actual_parameters) {
      const paramType = param.type;
      const isEventList = paramType === 'EventList';
      const isEventItem = paramType === 'EventItem';
      const isConcreteEvent =
        typeof paramType === 'string' && paramType.startsWith('event_');

      if (!isEventList && !isEventItem && !isConcreteEvent) continue;

      const hasValue =
        isEventList
          ? Array.isArray(param.value) && param.value.length > 0
          : param.value != null &&
            typeof param.value === 'object' &&
            'type' in (param.value as object);
      if (hasValue) continue;

      const eventType = isConcreteEvent
        ? paramType
        : Object.keys(triggerEvents)[0] ?? 'event_notify_n';

      const defEntry = triggerEvents[eventType];
      const paramsForType = defEntry?.parameters ?? [];

      const rawParams: Record<string, string | number> = {};
      if (paramsForType.some((p) => p.name === 'slot_index')) {
        rawParams['slot_index'] = section.slotIndex;
      }

      const normalized = normalizeParameterValues(
        paramsForType,
        rawParams,
        slotChannelList,
        section.nodeId,
        section.slotIndex,
      );

      const eventItem: EventListItem = { type: eventType, params: normalized };
      this.canvasBlocksService.updateBlockParameterValue(
        blockId,
        param.name,
        isEventList ? [eventItem] : eventItem,
      );
    }
  }
}
