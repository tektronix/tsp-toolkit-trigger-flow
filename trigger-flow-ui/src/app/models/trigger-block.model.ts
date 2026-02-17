/**
 * Trigger Block Models
 * These models represent the structure of trigger blocks loaded from JSON
 * and can be used for WebSocket communication later
 */

export interface TriggerBlockParameter {
  name: string;
  type: string;
  default?: any;
}

export interface TriggerBlock {
  parameters: TriggerBlockParameter[];
  syntax: string;
  description: string;
  shape: string;
}

export interface TriggerBlocksCollection {
  blocks: {
    [key: string]: TriggerBlock;
  };
}

/**
 * UI-specific models for rendering blocks in the palette
 */
export interface BlockShape {
  name: string;
  type: string;
  svgPath: string;
  label: string;
  block: TriggerBlock;
}

export interface BlockCategory {
  label: string;
  shapes: BlockShape[];
}

export interface PaletteGroup {
  label: string;
  type: 'single' | 'group';
  subgroups?: BlockCategory[];
}

/**
 * Shape type to SVG path mapping
 * Maps the 'shape' field from triggerBlocks.json to SVG file paths
 */
export const SHAPE_SVG_MAP: { [key: string]: string } = {
  'conditional': 'assets/shapes/Branches',
  'action': 'assets/shapes/Actions',
  'notify': 'assets/shapes/Notify',
  'timing': 'assets/shapes/Timing',
  'event': 'assets/shapes/Events'
};

/**
 * Category mapping for organizing blocks in the UI
 */
export const SHAPE_CATEGORY_MAP: { [key: string]: string } = {
  'conditional': 'Branches',
  'action': 'Actions',
  'notify': 'Notify',
  'timing': 'Timing',
  'event': 'Events'
};
