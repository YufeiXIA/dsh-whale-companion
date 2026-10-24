import { generalGameExpressions, generalGameGuide } from './general-game-expressions.js';
import { chatAnimations } from './chat-animation.js';
import { gameKnowledge } from './game-knowledge.js';
import { runContext, setRunPlan, setRunNotes } from './run-memory.js';
import { adviseCombat } from './combat-adviser.js';
import { observeBattle, recordDecision, similarBattles, addBattleHypothesis } from './battle-memory.js';

const names = new Set(['game_observe', 'game_act', 'game_lookup', 'game_plan', 'game_notes', 'game_advise', 'game_review', 'companion_say', 'companion_task']);
const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] };

// Raw ToolDefinition uses public JSON schemas; no duplicate DSH package copy.
export function installTools(ctx, host) {
  ctx.tools.restrict({ allow: [] });
  ctx.tools.presentAs('native');
  ctx.tools.guard(exec => {
    if (!names.has(exec.name)) return 'This companion session only has game and chat capabilities.';
    if (host.ambientTurn && (exec.name !== 'companion_say' || host.scheduler.active?.canceled ||
        !host.ambient.valid(host.replyRequest.environment))) return 'Ambient companionship only allows one fresh chat line, never game tools.';
  });
  function register(name, description, properties, required, execute) {
    ctx.tools.register({ name, description,
      parameters: { type: 'object', properties, required, additionalProperties: false }, output,
      isConcurrencySafe: () => false,
      async execute(args, execution) { return JSON.stringify(await execute(args, execution)); }
    });
  }
  register('game_observe', 'Read this companion’s bound game state once. Do not poll while waiting for another player.', {}, [], async (_args, exec) => {
    const observation = await host.adapter.observe({ signal: exec.signal });
    host.lastObservation = observation;
    return { ...observation, briefing: host.gameBriefing(observation) };
  });
  register('game_lookup', 'Read current in-game descriptions and scene guidance. IDs/names refer to the CURRENT visible entities or local deck; missing facts stay unknown. This is read-only.', {
    ids: { type: 'array', items: { type: 'string', maxLength: 100 }, maxItems: 12 },
    category: { type: 'string', enum: ['card', 'enemy', 'relic', 'potion', 'power', 'event', 'shop'] }
  }, [], async (args, exec) => {
    const observation = await host.adapter.observe({ signal: exec.signal });
    host.lastObservation = observation;
    return gameKnowledge(observation, args);
  });
  register('game_plan', 'Save a short current-turn plan: target/goal, defense, setup, potion decision, teammate coordination and backup. It is an internal proposal, not speech or an executed action. It expires on ANY state version change.', {
    observation_version: { type: 'string' }, goal: { type: 'string', maxLength: 240 },
    defense: { type: 'string', maxLength: 240 }, setup: { type: 'string', maxLength: 240 },
    potions: { type: 'string', maxLength: 240 }, team: { type: 'string', maxLength: 240 }, backup: { type: 'string', maxLength: 240 }
  }, ['observation_version', 'goal'], async (args, exec) => {
    const observation = await host.adapter.observe({ signal: exec.signal });
    host.lastObservation = observation;
    const plan = setRunPlan(host.runMemory, observation, args);
    await host.save();
    return plan;
  });
  register('game_notes', 'Update strategy notes for this exact run and local player: deck direction, weakness, next goal, potion policy and team roles. Notes are hypotheses, never current game facts. Reassess after rewards or team changes.', {
    observation_version: { type: 'string' }, direction: { type: 'string', maxLength: 240 },
    damage: { type: 'string', maxLength: 240 }, defense: { type: 'string', maxLength: 240 }, scaling: { type: 'string', maxLength: 240 },
    weakness: { type: 'string', maxLength: 240 }, next_goal: { type: 'string', maxLength: 240 },
    potion_policy: { type: 'string', maxLength: 240 }, team_roles: { type: 'string', maxLength: 240 }
  }, ['observation_version'], async (args, exec) => {
    const observation = await host.adapter.observe({ signal: exec.signal });
    host.lastObservation = observation;
    const notes = setRunNotes(host.runMemory, observation, args);
    await host.save();
    return notes;
  });
  register('game_advise', 'Read-only bounded candidate sequences for audited basic cards. Read limitations: unknown cards, powers, relics, random draws and team actions are NOT simulated. Never treat scores as win rates. New observation versions invalidate old advice.', {}, [], async (_args, exec) => {
    const observation = await host.adapter.observe({ signal: exec.signal });
    host.lastObservation = observation;
    return host.config.combatAdviser === false ? { disabled: true } : adviseCombat(observation);
  });
  register('game_review', 'Read saved recent battles even OFFLINE; battle_id returns its last 8 confirmed decisions. operation=similar refreshes the connected game and matches version/character/difficulty/team size. Or attach an UNVERIFIED short causal hypothesis. Reviews never become verified knowledge merely because the agent wrote them. No game actions.', {
    operation: { type: 'string', enum: ['recent', 'similar'] },
    battle_id: { type: 'string', maxLength: 500 }, hypothesis: { type: 'string', maxLength: 480 }
  }, [], async ({ operation = 'recent', battle_id, hypothesis }, exec) => {
    if (hypothesis !== undefined) {
      const review = addBattleHypothesis(host.battleMemory, battle_id, hypothesis);
      await host.save(); return review;
    }
    let observation = null;
    if (operation === 'similar' && host.scheduler.connected) {
      observation = await host.adapter.observe({ signal: exec.signal });
      host.lastObservation = observation;
      if (host.bindingConfirmed) observeBattle(host.battleMemory, observation);
    }
    let detail = null;
    if (battle_id) {
      const battle = [host.battleMemory.active, ...host.battleMemory.battles].find(item => item?.id === battle_id);
      if (!battle) throw new Error('BATTLE_NOT_FOUND');
      detail = { id: battle.id, before: battle.before, after: battle.after, decisions: battle.decisions.slice(-8),
        hypotheses: battle.hypotheses, note: battle.observationNote };
    }
    return { activeBattle: host.battleMemory.active?.id ?? null, detail,
      similar: observation ? similarBattles(host.battleMemory, observation) : [],
      recent: host.battleMemory.battles.slice(-3).map(battle => ({ id: battle.id, floor: battle.floor,
        outcome: battle.outcome, gameVersion: battle.gameVersion, character: battle.character,
        playerCount: battle.playerCount, ascension: battle.ascension,
        observedNetHpDecrease: battle.observedNetHpDecrease, potionUsesConfirmed: battle.potionUsesConfirmed,
        decisionCount: battle.decisionCount, hypotheses: battle.hypotheses,
        note: 'recent 仅供定位复盘，不代表与本局相同条件；相似检索见 similar。' })) };
  });
  register('game_act', 'Submit ONE action for the bound local player using the observation_version you just read. Never retry uncertain actions. Current bridge use_potion routes Self/AnyAlly/AnyPlayer potions to the bound player only; target selects enemies, not a teammate. Never claim an ally was healed without observed evidence.', {
    observation_version: { type: 'string' }, action: { type: 'string' },
    card_index: { type: 'integer' }, target: { type: 'string' }, index: { type: 'integer' }, slot: { type: 'integer' }
  }, ['observation_version', 'action'], async (args, exec) => {
    const { observation_version, ...action } = args;
    if (typeof observation_version !== 'string' || typeof action.action !== 'string') throw new Error('Expected observation_version and action strings');
    if (host.scheduler.actionsAllowed && host.lastObservation?.phase === 'combat' &&
        (host.lastObservation.state.player?.hand?.length ?? 0) > 0 &&
        ['play_card', 'end_turn', 'use_potion'].includes(action.action)) {
      const plan = runContext(host.runMemory, host.lastObservation)?.turnPlan;
      if (!plan || plan.observationVersion !== observation_version) throw new Error('PLAN_REQUIRED: read current state and save game_plan before acting');
    }
    try {
      const before = host.lastObservation;
      const result = await host.adapter.act(action, { signal: exec.signal, expectedVersionKey: observation_version });
      recordDecision(host.battleMemory, before, action, result);
      if (result.status === 'effect_observed') {
        host.memory.events = [...host.memory.events, { id: result.actionId, at: Date.now(),
          action: action.action, status: 'effect_observed', phase: result.observation?.state?.state_type ?? null }].slice(-8);
      }
      host.lastObservation = result.observation;
      host.scheduler.observe(result.observation, { source: 'action-result' });
      await host.save();
      return { ...result, briefing: host.gameBriefing(result.observation) };
    } catch (error) {
      if (error.pauseRequired) void host.scheduler.pause(error.code ?? 'action-uncertain');
      throw error;
    }
  });
  register('companion_say', 'Deliver one natural reply with its emotion. spoken=true for a short spoken line, maximum 100 characters, no minimum. This is normally the ENTIRE casual reply: end the turn afterwards, without a second explanation. Only add final detail when the question needs it. Use listening_nod for acknowledging or understanding, bright_idea for a new suggestion, relieved for relief after a resolved worry or confirmed close call. Game prop expressions: controller_play for gaming together, card_strategy for discussing cards, shield_ready for preparing defense, potion_offer for reminding about potions, map_route for route planning, loot_proud only after confirmed rewards. These are visual gestures, never proof of a game action or outcome. Routine game actions and unchanged waiting need no speech. Unsolicited comments at least 20 seconds apart; direct replies bypass cooldown. Respect text-only with spoken=false. This does not send native game chat. ' + generalGameGuide, {
    animation: { type: 'string', enum: ['none', ...chatAnimations.map(item => item.id)], description: 'One installed animation matching the current conversation. Independent of voice emotion. Use the current animation candidates as hints; none when irrelevant or a negated request.' },
    text: { type: 'string' }, spoken: { type: 'boolean' }, emotion: { type: 'string', enum: ['neutral', 'happy_hop', 'tsundere_pout', 'shy_surprise', 'taking_notes', 'listening_nod', 'bright_idea', 'relieved', 'controller_play', 'card_strategy', 'shield_ready', 'potion_offer', 'map_route', 'loot_proud', ...Object.keys(generalGameExpressions)] }
  }, ['text', 'spoken'], async ({ text, emotion = 'neutral', spoken = false, animation }) => {
    if (typeof text !== 'string' || text.length > 2000) throw new Error('Text must contain at most 2000 characters');
    if (host.ambientTurn && (!text.trim() || Array.from(text).length > 80)) throw new Error('Ambient chat should be one short line, at most 80 characters. Silence is allowed.');
    if (host.panelReply && host.singleCasualReply()) {
      return { channel: 'companion-panel', delivered: false, spoken: false, reason: 'reply-already-delivered' };
    }
    const message = host.say(text, emotion, null, spoken, animation);
    if (!message) return { channel: 'companion-panel', delivered: false, spoken: false, reason: 'reply-no-longer-current' };
    host.panelLineThisTurn = true;
    host.panelReply = message;
    if (host.finalReply) {
      if (host.singleCasualReply()) host.messages = host.messages.filter(item => item !== host.finalReply);
      else host.finalReply.detail = true;
    }
    return { channel: 'companion-panel', delivered: true, spoken: message.spoken };
  });
  register('companion_task', 'Set a goal for continuing gameplay, or wait for the next meaningful game change. Only the user can resume paused controls.', {
    operation: { type: 'string', enum: ['set', 'wait'] }, goal: { type: 'string' }
  }, ['operation'], async ({ operation, goal }) => {
    if (operation === 'set') {
      if (typeof goal !== 'string' || !goal.trim() || goal.length > 1000) throw new Error('A short nonempty goal is required');
      host.scheduler.setGoal(goal);
    } else if (operation === 'wait') host.scheduler.waitForChange();
    else throw new Error('Unknown task operation');
    await host.save();
    return { goal: host.scheduler.goal, actionsAllowed: host.scheduler.actionsAllowed, wait: operation === 'wait' };
  });
}
