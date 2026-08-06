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
    /**
     * Triggers an auto-snapping reflow on a section so that newly inserted
     * template blocks are positioned correctly relative to existing blocks.
     * Called once per affected section after insertion.
     */
    scheduleSectionReflow?: (sectionId: string) => void;
}

export interface TemplateInsertionTarget {
    /**
     * Index into the starting section's nodes array where the first group's
     * blocks should be inserted. If omitted, blocks are appended.
     */
    insertionIndex?: number;
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
        insertionTarget?: TemplateInsertionTarget,
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

        // Newly created sections don't have a model yet, so reading
        // slot/node via `section.modelName` returns 0 / '' fallbacks.
        // Resolve the binding from the starting section's model once and
        // reuse it for every group, so addBlocksFromTemplate seeds each
        // new model with the same slot/node as the drop target.
        const startingSectionSlot = this.canvasBlocksService.getModelSlotIndex(
            startingSection.modelName,
        );
        const startingSectionNode = this.canvasBlocksService.getModelNodeId(
            startingSection.modelName,
        );

        const startingSectionX = (startingSection.positionIndex ?? 0) * SECTION_WIDTH;
        const relativeDropX = dropRect.x - startingSectionX;

        const firstCreatedBlockIds: string[] = [];
        const affectedSectionIds = new Set<string>();

        groups.forEach((group, groupIndex) => {
            const section = targetSections[groupIndex];
            // First group binds to the drop-target section's existing
            // model; every subsequent group binds a freshly created model
            // that copies the drop-target's slot/node so multi-model
            // templates produce valid `${node_id}.slot[${slot_index}]`
            // bindings out of the gate. The user can rebind via the Edit
            // Model modal afterward.
            const sectionSlot = groupIndex === 0
                ? this.canvasBlocksService.getModelSlotIndex(section.modelName)
                : startingSectionSlot;
            const sectionNode = groupIndex === 0
                ? this.canvasBlocksService.getModelNodeId(section.modelName)
                : startingSectionNode;
            const sectionOriginX = (section.positionIndex ?? groupIndex) * SECTION_WIDTH;
            const groupBaseX = sectionOriginX + relativeDropX;

            const runtimeBlockIds: string[] = [];
            const positions: Array<{ x: number; y: number }> = [];
            const blockDataArray: Array<{
                templateBlockId: string;
                type: string;
                block_parameters?: Record<string, unknown>;
            }> = [];
            const templateNameMap = new Map<string, string>(); 

            group.blocks.forEach((tmplBlock) => {
                const templateTriggerName = tmplBlock.block_parameters?.['trigger_block_name'];
                let finalTriggerName: string;

                if (typeof templateTriggerName === 'string' && templateTriggerName.length > 0) {
                    finalTriggerName = this.canvasBlocksService.getUniqueBlockName(templateTriggerName);
                } else {
                    finalTriggerName = this.canvasBlocksService.getUniqueBlockName(tmplBlock.block_id);
                }

                templateNameMap.set(tmplBlock.block_id, finalTriggerName);
            });

            group.blocks.forEach((tmplBlock, index) => {
                const runtimeBlockId = helpers.createUniqueNodeId();
                const position = {
                    x: groupBaseX,
                    y: dropRect.y + index * VERTICAL_GAP,
                };

                runtimeBlockIds.push(runtimeBlockId);
                positions.push(position);

                const resolvedParams = { ...tmplBlock.block_parameters };
                for (const [paramName, rawValue] of Object.entries(resolvedParams)) {
                    if (LINK_PARAM_NAMES.includes(paramName) && typeof rawValue === 'string') {
                        const resolvedName = templateNameMap.get(rawValue);
                        if (resolvedName) {
                            resolvedParams[paramName] = resolvedName;
                        }
                    }
                }

                blockDataArray.push({
                    templateBlockId: tmplBlock.block_id,
                    type: tmplBlock.type,
                    block_parameters: resolvedParams,
                });
            });

            this.canvasBlocksService.addBlocksFromTemplate(
                blockDataArray,
                runtimeBlockIds,
                positions,
                section.modelName,
                sectionSlot,
                sectionNode,
                templateNameMap, 
            );

            const newNodes: FlowNode[] = [];
            group.blocks.forEach((tmplBlock, index) => {
                const blockCatalogLabel = tmplBlock.type;
                const palettePath = this.canvasBlocksService.getSVGPathForLabel(blockCatalogLabel);
                const svgPath = helpers.changeSVGPath(palettePath || '');
                const nodeCounter = helpers.getNodeCounter();

                newNodes.push({
                    blockId: runtimeBlockIds[index],
                    sectionId: section.id,
                    position: positions[index],
                    svgPath,
                    catalogLabel: blockCatalogLabel,
                    blockType: 'Template',
                    input: `input-${nodeCounter}`,
                    outputs: [`output-${nodeCounter}`],
                    color: '#FFFFFF',
                });
            });

            this.sections.update((current) =>
                current.map((item) => {
                    if (item.id !== section.id) return item;
                    const nodes = [...item.nodes];
                    const insertAt =
                        groupIndex === 0 && insertionTarget?.insertionIndex !== undefined
                            ? Math.max(0, Math.min(insertionTarget.insertionIndex, nodes.length))
                            : nodes.length;
                    nodes.splice(insertAt, 0, ...newNodes);
                    return { ...item, nodes };
                }),
            );

            runtimeBlockIds.forEach((blockId) => {
                this.initializeEventParameterDefaults(blockId, section);
            });

            affectedSectionIds.add(section.id);
            firstCreatedBlockIds.push(...runtimeBlockIds);
        });

        this.canvasBlocksService.restoreConnections();

        // Reflow each affected section so template blocks obey auto-snapping
        // (centered X, stacked Y with measured node sizes) just like single-block drops.
        if (helpers.scheduleSectionReflow) {
            for (const sectionId of affectedSectionIds) {
                helpers.scheduleSectionReflow(sectionId);
            }
        }

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
            const sectionSlot = this.canvasBlocksService.getModelSlotIndex(section.modelName);
            const sectionNode = this.canvasBlocksService.getModelNodeId(section.modelName);
            if (paramsForType.some((p) => p.name === 'slot_index')) {
                rawParams['slot_index'] = sectionSlot;
            }

            const normalized = normalizeParameterValues(
                paramsForType,
                rawParams,
                slotChannelList,
                sectionNode,
                sectionSlot,
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
