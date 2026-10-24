import { conversationMode } from './conversation.js';

export function decisionBudget(request, observation, config = {}) {
  const normal = { reasoningEffort: config.reasoningEffort ?? 'low', maxTokens: config.maxTokens ?? 3000 };
  if (!request || conversationMode(request) === 'chat' || !observation) return { ...normal, reason: 'conversation-or-no-game' };
  const state = observation.state;
  const strategic = ['elite', 'boss', 'card_reward', 'shop', 'rest_site', 'event'].includes(state.state_type) ||
    (state.state_type === 'map' && (state.map?.next_options?.length ?? 0) > 1);
  const endangered = observation.phase === 'combat' && Number.isFinite(state.player?.hp) &&
    Number.isFinite(state.player?.max_hp) && state.player.hp / state.player.max_hp < 0.35;
  return strategic || endangered
    ? { reasoningEffort: 'high', maxTokens: Math.max(normal.maxTokens, 6000), reason: strategic ? 'strategic-choice' : 'low-health-combat' }
    : { ...normal, reason: 'routine-gameplay' };
}
