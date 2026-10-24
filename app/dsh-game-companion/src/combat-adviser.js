// A deliberately small public-state search. No simulator dependency, game writes,
// future draw order, random seed, or hidden enemy moves enter this module.
const BUILD = 'v0.107.1';
const PASSIVE_RELICS = new Set(['BURNING_BLOOD', 'BLACK_BLOOD']);
const activePowers = creature => (creature?.status ?? []).length > 0;

function intentDamage(enemy) {
  if (!Array.isArray(enemy.intents) || !enemy.intents.length) return null;
  let damage = 0;
  for (const intent of enemy.intents ?? []) {
    if (intent.type !== 'Attack') {
      if (!['Defend', 'Buff', 'Debuff', 'Escape', 'Stun', 'Sleep'].includes(intent.type)) return null;
      continue;
    }
    const match = /^(\d+)(?:\s*[x×]\s*(\d+))?$/u.exec(String(intent.label ?? '').trim());
    if (!match) return null;
    damage += Number(match[1]) * Number(match[2] ?? 1);
  }
  return damage;
}

export function adviseCombat(observation, { maxNodes = 512, timeMs = 20 } = {}) {
  const started = performance.now();
  maxNodes = Math.min(1024, Math.max(1, maxNodes));
  timeMs = Math.min(40, Math.max(1, timeMs));
  const s = observation.state, p = s.player ?? {};
  const multiplayer = s.player_count !== 1;
  const result = { observationVersion: observation.versionKey, engine: 'bounded-public-primitives-v1',
    gameVersion: s.game_version ?? null, candidates: [], unsupportedCards: [], limitations: [],
    note: '只读候选，不是执行许可；至多采用第一步，之后重新观察规划，旧索引会移动。每次状态变化后作废。不推断未知抽牌或队友出牌。' };
  const finish = () => ({ ...result, elapsedMs: Math.round((performance.now() - started) * 100) / 100 });
  if (observation.phase !== 'combat' || !observation.actionable) {
    result.limitations.push('当前不是本地角色可行动的战斗。'); return finish();
  }
  if (s.game_version !== BUILD) {
    result.limitations.push('基础规则仅核对过 v0.107.1；当前版本不明或不匹配，停止数值搜索。'); return finish();
  }
  const enemies = (s.battle?.enemies ?? []).filter(enemy => enemy.hp > 0);
  if (!Number.isFinite(p.hp) || !Number.isSafeInteger(p.energy) || !Number.isFinite(p.block) ||
      !enemies.length || enemies.length > 12 || (p.hand?.length ?? 0) > 20 ||
      enemies.some(enemy => typeof enemy.entity_id !== 'string' || !Number.isFinite(enemy.hp) || !Number.isFinite(enemy.block))) {
    result.limitations.push('缺少战斗数值或超出本地有界搜索范围。'); return finish();
  }
  const unsafe = activePowers(p) || enemies.some(activePowers) ||
    (s.players ?? []).some(player => activePowers(player) ||
      (player.relics ?? []).some(relic => !PASSIVE_RELICS.has(relic.id))) ||
    (p.relics ?? []).some(relic => !PASSIVE_RELICS.has(relic.id));
  if (unsafe) {
    result.limitations.push('存在尚未模拟的能力或遗物，可能改变出牌/伤害/格挡；停止数值搜索，交给模型查当前说明。');
    return finish();
  }
  const cards = (p.hand ?? []).flatMap(card => {
    const cost = /^\d+$/u.test(String(card.cost)) ? Number(card.cost) : NaN;
    const rule = card.adviser_rule;
    const value = card.dynamic_vars?.[rule === 'single_attack' ? 'Damage' : 'Block'];
    const supported = ['single_attack', 'self_block'].includes(rule) &&
      ((rule === 'single_attack' && card.id === 'STRIKE_IRONCLAD' && card.target_type === 'AnyEnemy') ||
       (rule === 'self_block' && card.id === 'DEFEND_IRONCLAD' && card.target_type === 'Self')) &&
      Number.isSafeInteger(cost) && cost >= 0 && Number.isSafeInteger(value) && value >= 0 &&
      Number(card.star_cost ?? 0) === 0;
    if (!supported) result.unsupportedCards.push({ index: card.index, id: card.id });
    return supported && card.can_play && observation.availableActions?.includes('play_card')
      ? [{ index: card.index, cost, rule, value }] : [];
  });
  if (result.unsupportedCards.length) result.limitations.push('未覆盖牌不参与搜索，不能把候选称为完整手牌的最优解。');
  if (!cards.length) {
    result.limitations.push('没有当前可搜索的基础牌；不提供结束回合建议，仍需模型检查其他牌与药水。');
    return finish();
  }
  const damages = enemies.map(intentDamage);
  const teamUnknown = multiplayer && ((s.players?.length ?? 0) !== s.player_count ||
    s.players.some(player => !Array.isArray(player.status) || !Array.isArray(player.relics)));
  result.confidence = teamUnknown ? 'conditional-on-unreported-team-modifiers' : 'audited-primitive-effects-only';
  if (teamUnknown) result.limitations.push('队友能力/遗物信息不全，以下仅为没有额外修改时的条件估计。');
  const knownPressure = !multiplayer && damages.every(value => value !== null);
  if (!knownPressure) result.limitations.push('多人意图不等于都打本地角色，或意图数值不全；不估计本地实际损血。');
  const initial = { hp: enemies.map(enemy => enemy.hp), block: enemies.map(enemy => enemy.block ?? 0),
    playerBlock: p.block, energy: p.energy, used: [], actions: [], damage: 0 };
  function evaluate(node) {
    const pressure = knownPressure ? damages.reduce((sum, damage, i) => sum + (node.hp[i] > 0 ? damage : 0), 0) : null;
    const loss = pressure === null ? null : Math.max(0, pressure - node.playerBlock);
    const kills = node.hp.filter(hp => hp <= 0).length;
    const lethal = loss !== null && loss >= p.hp;
    // Scores are a heuristic preference, not a win probability or game value.
    return { score: (lethal ? -100000 : 0) + kills * 100 + node.damage - (loss ?? 0) * 8 +
      (pressure === null ? Math.min(10, node.playerBlock) * 0.2 : 0),
    predicted: { enemyHp: node.hp, enemyBlock: node.block, playerBlock: node.playerBlock,
      energyLeft: node.energy, enemyIntentPressure: pressure, netHpLossIfNoOtherEffects: loss, kills } };
  }
  let beam = [initial], nodes = 0, stopped = false;
  const terminal = new Map();
  const add = node => {
    const first = JSON.stringify(node.actions[0] ?? { action: 'end_turn' });
    const candidate = { actions: node.actions, ...evaluate(node) };
    if (!terminal.has(first) || terminal.get(first).score < candidate.score) terminal.set(first, candidate);
  };
  add(initial);
  for (let depth = 0; depth < Math.min(cards.length, 6) && !stopped; depth++) {
    const next = [];
    for (const node of beam) {
      for (const card of cards) {
        if (node.used.includes(card.index) || card.cost > node.energy) continue;
        const targets = card.rule === 'single_attack' ? enemies.map((_, i) => i).filter(i => node.hp[i] > 0) : [null];
        for (const target of targets) {
          if (nodes >= maxNodes || performance.now() - started >= timeMs) { stopped = true; break; }
          const child = structuredClone(node);
          const action = { action: 'play_card', card_index: card.index };
          child.energy -= card.cost; child.used.push(card.index);
          if (target === null) child.playerBlock += card.value;
          else {
            action.target = enemies[target].entity_id;
            const absorbed = Math.min(child.block[target], card.value);
            child.block[target] -= absorbed;
            const dealt = Math.min(child.hp[target], card.value - absorbed);
            child.hp[target] -= dealt; child.damage += dealt;
          }
          child.actions.push(action); nodes++; add(child); next.push(child);
        }
        if (stopped) break;
      }
      if (stopped) break;
    }
    next.sort((a, b) => evaluate(b).score - evaluate(a).score);
    beam = next.slice(0, 24);
    if (!beam.length) break;
  }
  result.candidates = [...terminal.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  result.searchedNodes = nodes;
  result.truncated = stopped;
  result.coverage = 'audited-Ironclad-strike-and-defend-without-active-modifiers';
  result.limitations.push('未来意图、随机效果、药水和队友行动没有模拟；药水需另外按说明评估，不能据此断言不必喝药。');
  return finish();
}
