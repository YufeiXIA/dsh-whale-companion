const MAX_BATTLES = 48, MAX_DECISIONS = 32;
const id = observation => JSON.stringify([observation.guard.instance_id, observation.guard.run_id,
  observation.guard.local_player_id, (observation.state.run ?? observation.state.game)?.act,
  (observation.state.run ?? observation.state.game)?.floor]);
const clip = (value, max = 100) => String(value ?? '').slice(0, max);

export function loadBattleMemory(saved) {
  if (saved === undefined) return { version: 1, active: null, battles: [] };
  if (saved?.version !== 1 || !Array.isArray(saved.battles) || saved.battles.length > MAX_BATTLES ||
      saved.battles.some(battle => typeof battle.id !== 'string' || !Array.isArray(battle.decisions) ||
        battle.decisions.length > MAX_DECISIONS) || (saved.active && typeof saved.active.id !== 'string')) {
    throw new Error('Invalid battle memory');
  }
  return structuredClone(saved);
}

function snapshot(observation) {
  const s = observation.state, p = s.player ?? {};
  return { observationVersion: observation.versionKey, phase: observation.phase, stateType: s.state_type,
    round: s.battle?.round ?? null, hp: p.hp ?? null, maxHp: p.max_hp ?? null, block: p.block ?? null,
    energy: p.energy ?? null,
    hand: (p.hand ?? []).slice(0, 20).map(card => ({ index: card.index, id: clip(card.id) })),
    potions: (p.potions ?? []).slice(0, 10).map(potion => ({ slot: potion.slot, id: clip(potion.id) })),
    enemies: (s.battle?.enemies ?? []).slice(0, 12).map(enemy => ({ id: clip(enemy.entity_id),
      hp: enemy.hp, block: enemy.block })) };
}

function close(book, reason, at) {
  const battle = book.active;
  if (!battle) return;
  battle.endedAt = at; battle.outcome = reason;
  delete battle.lastObservationVersion;
  book.battles = [...book.battles, battle].slice(-MAX_BATTLES);
  book.active = null;
}

// Poll observations also capture enemy/teammate turns. Positive HP differences
// are NET observed decreases, never a claim to count all damage before healing.
export function observeBattle(book, observation, at = Date.now()) {
  const s = observation.state;
  const run = s.run ?? s.game ?? {};
  if (book.active && book.active.roomKey !== id(observation)) close(book, 'identity-or-room-changed', at);
  // Godot briefly keeps a combat room after combat ends, before its reward UI
  // appears. Keep recording through this transition (including end-of-battle
  // healing), and close only at a real next screen or an observed party defeat.
  const partyDefeat = s.combat_in_progress === false && s.players?.length > 0 &&
    s.players.every(player => player.is_alive === false);
  const inCombat = !partyDefeat && (s.combat_in_progress === true || ['monster', 'elite', 'boss'].includes(s.state_type));
  if (!inCombat) {
    if (book.active) {
      const current = snapshot(observation);
      addHpChange(book.active, current);
      book.active.after = current;
      let outcome = 'left-combat-unresolved';
      if (partyDefeat) outcome = 'party-defeat-observed';
      else if (['rewards', 'card_reward'].includes(s.state_type)) outcome = 'rewards-observed';
      close(book, outcome, at);
    }
    return;
  }
  if (!observation.guard.run_id || !s.player) return;
  const current = snapshot(observation);
  if (!book.active) {
    book.active = { id: `${id(observation)}:${at}`, roomKey: id(observation),
      runId: observation.guard.run_id, playerId: observation.guard.local_player_id,
      startedAt: at, gameVersion: s.game_version ?? null, character: clip(s.player.character),
      ascension: run.ascension ?? null, playerCount: s.player_count ?? null,
      act: run.act ?? null, floor: run.floor ?? null,
      deckIds: [...new Set((s.player.deck ?? []).map(card => clip(card.id)))].slice(0, 80),
      enemyIds: current.enemies.map(enemy => enemy.id), before: current, after: current,
      observedNetHpDecrease: 0, observedNetHpIncrease: 0,
      decisions: [], decisionCount: 0, potionUsesConfirmed: 0, hypotheses: [],
      observationNote: '只统计观测到的变化；中途接入、断连、同时治疗或队友操作可能使其不等于整场真实伤害。' };
  }
  const battle = book.active;
  if (battle.lastObservationVersion === observation.versionKey) return;
  addHpChange(battle, current);
  battle.after = current;
  battle.lastObservationVersion = observation.versionKey;
}

function addHpChange(battle, current) {
  if (!Number.isFinite(battle.after.hp) || !Number.isFinite(current.hp)) return;
  const difference = battle.after.hp - current.hp;
  battle.observedNetHpDecrease += Math.max(0, difference);
  battle.observedNetHpIncrease += Math.max(0, -difference);
}

export function recordDecision(book, before, action, result, at = Date.now()) {
  observeBattle(book, before, at);
  const battle = book.active;
  if (!battle || result.status !== 'effect_observed') return;
  if (battle.decisions.some(decision => decision.actionId === result.actionId)) return;
  const cleanAction = Object.fromEntries(['action', 'card_index', 'target', 'index', 'slot']
    .filter(key => action[key] !== undefined).map(key => [key, action[key]]));
  battle.decisions = [...battle.decisions, { actionId: result.actionId, at, action: cleanAction,
    before: snapshot(before), after: snapshot(result.observation), evidence: 'guard-effect-observed',
    attribution: '回执确认本地动作已执行；前后变化也可能包含队友或敌人行动，不能全部归因于本动作。' }].slice(-MAX_DECISIONS);
  battle.decisionCount++;
  if (action.action === 'use_potion') battle.potionUsesConfirmed++;
  observeBattle(book, result.observation, at);
}

export function addBattleHypothesis(book, battleId, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 480) throw new Error('A review hypothesis must contain 1–480 characters');
  const battle = [book.active, ...book.battles].find(item => item?.id === battleId);
  if (!battle) throw new Error('BATTLE_NOT_FOUND');
  const hypothesis = { text: text.trim(), at: Date.now(), source: 'agent-hypothesis', verified: false,
    weight: 'unverified', note: '单次复盘不是因果证据；未经过相同条件的多局对照，不提升为已验证经验。' };
  battle.hypotheses = [...battle.hypotheses, hypothesis].slice(-4);
  return hypothesis;
}

export function similarBattles(book, observation) {
  const s = observation.state, p = s.player ?? {};
  const run = s.run ?? s.game ?? {};
  if (!s.game_version || !p.character || !Number.isInteger(s.player_count) || !Number.isInteger(run.ascension)) return [];
  const deck = new Set((p.deck ?? []).map(card => card.id));
  const enemies = new Set((s.battle?.enemies ?? []).map(enemy => enemy.entity_id));
  return book.battles.filter(battle => battle.gameVersion === s.game_version && battle.character === p.character &&
      battle.playerCount === s.player_count && battle.ascension === run.ascension)
    .map(battle => {
      const union = new Set([...deck, ...battle.deckIds]);
      const overlap = battle.deckIds.filter(card => deck.has(card)).length / Math.max(1, union.size);
      return { battle, similarity: overlap + (battle.enemyIds.some(enemy => enemies.has(enemy)) ? 1 : 0) };
    }).filter(item => item.similarity > 0).sort((a, b) => b.similarity - a.similarity || b.battle.endedAt - a.battle.endedAt)
    .slice(0, 3).map(({ battle, similarity }) => ({ id: battle.id, runId: battle.runId, gameVersion: battle.gameVersion,
      similarity, floor: battle.floor, outcome: battle.outcome,
      observedNetHpDecrease: battle.observedNetHpDecrease, potionUsesConfirmed: battle.potionUsesConfirmed,
      decisionCount: battle.decisionCount, hypotheses: battle.hypotheses,
      note: battle.observationNote }));
}
