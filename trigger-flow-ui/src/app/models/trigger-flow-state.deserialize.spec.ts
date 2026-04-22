import { describe, expect, it } from 'vitest';
import { TriggerFlowStatePayload } from './trigger-flow-state.model';

const envelope = {
  request_type: 'evaluate_request',
  additional_info: '',
  json_value: `{"slot_channel_list":{"slots":[{"slot_index":1,"channels":[{"channel_index":1,"in_use":true},{"channel_index":2,"in_use":false}],"module":"MPSU50_2ST","node_id":""},{"slot_index":2,"channels":[{"channel_index":1,"in_use":false},{"channel_index":2,"in_use":false}],"module":"MPSU50_2ST","node_id":""},{"slot_index":3,"channels":[{"channel_index":1,"in_use":false},{"channel_index":2,"in_use":false}],"module":"MSMU60_2","node_id":""}]},"models":{"MyTriggerModel":{"trigger_model_name":"MyTriggerModel","slot_index":1,"blocks":[{"block_id":"block1","type":"measure","block_parameters":{"trigger_model_name":"MyTriggerModel","slot_index":1,"channel_list":[1],"measure_count":10},"incoming":null,"outgoing":null,"block_position":{"x":300.0,"y":150.0},"block_error":null}]},"Model2":{"trigger_model_name":"Model2","slot_index":1,"blocks":[]}}}`,
};

describe('TriggerFlowStatePayload deserialize', () => {
  it('parses outer envelope and inner json_value into class instances', () => {
    const state = new TriggerFlowStatePayload(
      JSON.parse(envelope.json_value) as ConstructorParameters<typeof TriggerFlowStatePayload>[0]
    );

    expect(envelope.request_type).toBe('evaluate_request');
    expect(state.slot_channel_list.slots.length).toBe(3);
    expect(state.slot_channel_list.slots[0].channels[0].inUse).toBe(true);
    expect(state.models['MyTriggerModel'].trigger_model_name).toBe('MyTriggerModel');
    expect(state.models['MyTriggerModel'].blocks[0].block_position.x).toBe(300);
    expect(state.models['Model2'].blocks.length).toBe(0);
  });
});
