// One-call integration, called from BootScene after the bridge exists. Returns the VN provider (it also owns sound).
import { YugantaVN } from './YugantaVN.js';
import { showTitle, showEnding } from './screens.js';

export function installYugantaVN({ game, registry, vnBridge, timeline }) {
  const vn = new YugantaVN({ getCharacters: () => registry.get('characterMap') || new Map(), getGameState: () => registry.get('gameState') });
  vnBridge.setProvider(vn);
  // Battle / story node music. (A sequence's own bgm_asset_key temporarily overrides it, then it is restored.)
  game.events.on('yuganta:node-started', nodeId => {
    const n = timeline.findNode?.(nodeId);
    vn.sound.play(n?.initial_scene_type === 'TACTICAL' ? 'bgm_heavy_combat' : 'bgm_royal_court');
  });
  game.events.on('yuganta:chronicle-end', () => showEnding(vn, registry.get('gameState')));
  vn.showTitle = opts => showTitle(vn, opts);
  return vn;
}
