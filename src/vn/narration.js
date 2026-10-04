// Sanjaya narrates nodes that have no authored dialogue yet, so no moment of the epic is silently skipped.
// Role 4: when a real NODE_START dialogue exists for the node, this is never used.
export function narrationFor(node, parvaName = '') {
  const bits = [node.title ? `${node.title}.` : '', node.historical_context || ''].filter(Boolean).join(' ');
  return {
    sequence_id: `narration_${node.node_id}`, node_id: node.node_id, trigger_event: 'NODE_START',
    background_asset_key: node.map_id || '', bgm_asset_key: node.initial_scene_type === 'TACTICAL' ? 'bgm_heavy_combat' : '',
    nodes: [{ dialogue_id: 'n1', speaker_id: 'sanjaya', speaker_emotion: 'NEUTRAL', is_endpoint: true,
      dialogue_text: bits || `${parvaName}. The chronicle continues.` }],
  };
}
