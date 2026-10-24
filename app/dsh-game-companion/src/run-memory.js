const PLAN_FIELDS = ['goal', 'defense', 'setup', 'potions', 'team', 'backup'];

export function loadRunMemory(saved) {
  if (saved === undefined) return { version: 1, runs: [] };
  if (saved?.version !== 1 || !Array.isArray(saved.runs) || saved.runs.length > 8 ||
      saved.runs.some(run => typeof run.runId !== 'string' || typeof run.playerId !== 'string')) {
    throw new Error('Invalid run memory');
  }
  return structuredClone(saved);
}

function deckSummary(player) {
  const deck = player?.deck ?? [];
  return { character: player?.character ?? null, size: deck.length,
    types: Object.fromEntries(['Attack', 'Skill', 'Power', 'Curse', 'Status'].map(type => [type, deck.filter(card => card.type === type).length])),
    cards: deck.slice(0, 80).map(card => ({ id: String(card.id ?? '').slice(0, 100),
      name: String(card.name ?? '').slice(0, 100), upgraded: card.is_upgraded === true })) };
}

export function observeRun(book, observation) {
  const { run_id: runId, local_player_id: playerId } = observation.guard;
  if (typeof runId !== 'string' || !runId || typeof playerId !== 'string' || !playerId) return null;
  let run = book.runs.find(item => item.runId === runId && item.playerId === playerId);
  if (!run) {
    run = { runId, playerId, notes: null, turnPlan: null };
    book.runs = [...book.runs, run].slice(-8);
  }
  if (run.turnPlan && run.turnPlan.observationVersion !== observation.versionKey) {
    run.turnPlan = null;
    run.planStatus = '局面已改变，旧的具体出牌计划作废；先看最新观察再规划。';
  }
  run.deck = deckSummary(observation.state.player);
  const metadata = observation.state.run ?? observation.state.game;
  run.floor = metadata?.floor ?? null;
  run.act = metadata?.act ?? null;
  run.gameVersion = observation.state.game_version ?? observation.state.game?.version ?? null;
  run.lastObservedVersion = observation.versionKey;
  if (observation.state.state_type === 'game_over' && typeof observation.state.game_over?.win === 'boolean') {
    run.outcome = observation.state.game_over.win ? 'won' : 'lost';
    run.completedAt ??= Date.now();
  }
  return run;
}

export function setRunPlan(book, observation, input) {
  if (input.observation_version !== observation.versionKey) throw new Error('STALE_PLAN');
  const run = observeRun(book, observation);
  if (!run) throw new Error('RUN_NOT_AVAILABLE');
  const plan = {};
  for (const key of PLAN_FIELDS) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string' || input[key].length > 240) throw new Error('Invalid plan field');
      plan[key] = input[key].trim();
    }
  }
  if (!plan.goal) throw new Error('A short plan goal is required');
  run.turnPlan = { ...plan, observationVersion: observation.versionKey,
    round: observation.state.battle?.round ?? null, createdAt: Date.now(), source: 'agent-plan-not-observed-fact' };
  run.planStatus = '按当前局面提出的计划；每次动作与队友变化后必须重新核对。';
  return run.turnPlan;
}

export function setRunNotes(book, observation, input) {
  if (input.observation_version !== observation.versionKey) throw new Error('STALE_PLAN');
  const run = observeRun(book, observation);
  if (!run) throw new Error('RUN_NOT_AVAILABLE');
  const fields = ['direction', 'damage', 'defense', 'scaling', 'weakness', 'next_goal', 'potion_policy', 'team_roles'];
  const notes = {};
  for (const key of fields) {
    if (typeof input[key] === 'string' && input[key].length <= 240) notes[key] = input[key].trim();
    else if (input[key] !== undefined) throw new Error('Invalid run note');
  }
  if (!Object.keys(notes).length) throw new Error('A run note is required');
  run.notes = { ...run.notes, ...notes, updatedAt: Date.now(), observationVersion: observation.versionKey,
    source: 'agent-strategy-hypothesis', reminder: '这是本局策略判断，不是已确认战果；获得新卡、遗物或队友改变分工时重新评估。' };
  return run.notes;
}

export function runContext(book, observation) {
  const run = observeRun(book, observation);
  if (!run) return null;
  return { ...run, note: '只属于本局及本地角色；最新观察优先于策略笔记。未知抽牌顺序不可预测。' };
}
