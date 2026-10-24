import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const ACTION_FIELDS = {
  play_card: ['card_index', 'target'],
  end_turn: [],
  use_potion: ['slot', 'target'],
  discard_potion: ['slot'],
  choose_map_node: ['index'],
  claim_reward: ['index'],
  select_card_reward: ['card_index'],
  skip_card_reward: [],
  proceed: [],
  choose_event_option: ['index'],
  advance_dialogue: [],
  choose_rest_option: ['index'],
  select_card: ['index'],
  confirm_selection: [],
  cancel_selection: [],
  open_shop: [],
  close_shop: [],
  shop_purchase: ['index'],
  open_treasure: [],
  claim_treasure_relic: ['index'],
};
const BATTLE_SCREENS = new Set(['monster', 'elite', 'boss']);

export class Sts2Error extends Error {
  constructor(code, message, { pauseRequired = false, actionId = null } = {}) {
    super(message);
    this.name = 'Sts2Error';
    this.code = code;
    this.pauseRequired = pauseRequired;
    this.actionId = actionId;
  }
}

/** Guard-only REST client. No requests fall back to the raw multiplayer API.
 * Bind explicitly after observe(). Tools should pass their decision's
 * expectedVersionKey to act(), rather than letting background polls change
 * the version against which model-selected indices are checked.
 * Persist snapshot() through onStateChange; pending state is awaited before
 * POST. The host also saves after synchronous bind(). On restart, pass restored,
 * reconcile pending receipts, then explicitly bind and enable the live gate.
 * observe() detects binding changes strictly. reconcile() is the explicit
 * recovery path: without pending work it clears invalid bindings and returns
 * the fresh observation with status 'binding-changed', requiresBinding: true.
 */
export class Sts2Adapter {
  #token;
  #fetch;
  #canAct;
  #busy = false;
  #pending = null;
  #binding = null;
  #needsBindingConfirmation = false;
  #onStateChange;

  constructor({ baseUrl = 'http://127.0.0.1:15527', token, fetchImpl = fetch,
    canAct, requestTimeoutMs = 6000, actionTtlMs = 15000, pollIntervalMs = 250,
    restored, onStateChange }) {
    let url;
    try { url = new URL(baseUrl); } catch { throw new TypeError('Invalid loopback game URL'); }
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new TypeError('Game URL must be an HTTP loopback origin');
    }
    if (typeof token !== 'string' || !token.trim()) throw new TypeError('Companion token is required');
    if (typeof canAct !== 'function' || typeof fetchImpl !== 'function') {
      throw new TypeError('canAct and fetchImpl must be functions');
    }
    for (const value of [requestTimeoutMs, actionTtlMs, pollIntervalMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('Timeouts must be positive integer milliseconds');
    }
    if (actionTtlMs > 30000) throw new TypeError('Action TTL cannot exceed 30 seconds');
    if (onStateChange !== undefined && typeof onStateChange !== 'function') {
      throw new TypeError('onStateChange must be a function');
    }
    if (restored !== undefined) {
      if (!restored || typeof restored !== 'object' || Array.isArray(restored) ||
          (restored.binding !== null && (!restored.binding ||
            ['instance_id', 'run_id', 'local_player_id'].some(key =>
              typeof restored.binding[key] !== 'string' || !restored.binding[key]))) ||
          (restored.pending !== null && (!restored.pending ||
            typeof restored.pending.actionId !== 'string' || !restored.pending.actionId ||
            !Number.isSafeInteger(restored.pending.deadline) || restored.pending.deadline < 1 || !restored.binding))) {
        throw new TypeError('Invalid restored adapter snapshot');
      }
      this.#binding = restored.binding && { ...restored.binding };
      this.#pending = restored.pending && { ...restored.pending };
      this.#needsBindingConfirmation = Boolean(this.#binding);
    }
    this.endpoint = new URL('/api/v1/companion', url).href;
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#canAct = canAct;
    this.#onStateChange = onStateChange;
    this.requestTimeoutMs = requestTimeoutMs;
    this.actionTtlMs = actionTtlMs;
    this.pollIntervalMs = pollIntervalMs;
    this.latest = null;
  }

  get binding() { return this.#binding && { ...this.#binding }; }
  get pendingActionId() { return this.#pending?.actionId ?? null; }

  snapshot() {
    return { binding: this.binding, pending: this.#pending && { ...this.#pending } };
  }

  bind(identity) {
    if (this.#busy) throw new Sts2Error('BUSY', 'Wait for the current action before binding');
    const keys = ['instance_id', 'run_id', 'local_player_id'];
    if (!this.latest || keys.some(key => typeof identity?.[key] !== 'string' || !identity[key] ||
        identity[key] !== this.latest.guard[key]) || !localPlayer(this.latest.state)) {
      throw new Sts2Error('BINDING_INVALID', 'Binding must match the observed multiplayer local player', { pauseRequired: true });
    }
    if (this.#pending) throw this.#uncertain('Reconcile the previous action before rebinding');
    this.#binding = Object.fromEntries(keys.map(key => [key, identity[key]]));
    this.#needsBindingConfirmation = false;
  }

  async observe({ signal } = {}) {
    const body = await this.#request({ signal });
    return this.#acceptObservation(body);
  }

  async act(input, { signal, expectedVersionKey = this.latest?.versionKey } = {}) {
    if (this.#busy) throw new Sts2Error('BUSY', 'Another game action is already in flight');
    if (this.#pending) throw this.#uncertain('Reconcile the previous action before another submission');
    this.#checkGate(signal);
    this.#checkBinding(this.latest);
    if (expectedVersionKey !== this.latest.versionKey) {
      throw new Sts2Error('STALE_STATE', 'Decision state is stale; observe and decide again');
    }
    this.#checkAction(input, this.latest);
    this.#busy = true;
    try {
      const fresh = await this.observe({ signal });
      if (fresh.versionKey !== expectedVersionKey) {
        throw new Sts2Error('STALE_STATE', 'Game changed before submission; target indices were not refreshed');
      }
      this.#checkAction(input, fresh);
      this.#checkGate(signal);
      const actionId = randomUUID();
      const deadline = Date.now() + this.actionTtlMs;
      const payload = { ...input, ...this.#binding, version: fresh.guard.version,
        action_id: actionId, expires_at: new Date(deadline).toISOString() };
      this.#pending = { actionId, deadline };
      try {
        await this.#persist();
        this.#checkGate(signal);
      } catch (error) {
        this.#pending = null;
        if (error.code !== 'STORE_FAILED') await this.#persist();
        throw error;
      }
      let body = null;
      try {
        body = await this.#request({ method: 'POST', payload, signal,
          timeoutMs: Math.min(this.requestTimeoutMs, this.actionTtlMs) });
      } catch (error) {
        if (signal?.aborted || !this.#canAct()) throw this.#uncertain('Action interrupted after submission; reconcile its receipt');
        if (error.httpStatus >= 400 && error.httpStatus < 500) {
          this.#pending = null;
          await this.#persist();
          throw error;
        }
        // Delivery may have succeeded. Query this ID; never repeat the POST.
      }
      return await this.#waitForEffect(body, signal);
    } finally {
      this.#busy = false;
    }
  }

  async reconcile({ signal } = {}) {
    if (this.#busy) throw new Sts2Error('BUSY', 'Wait for the current action before reconciliation');
    this.#busy = true;
    try {
      const actionId = this.#pending?.actionId;
      const body = await this.#request({ actionId, signal });
      const observation = this.#acceptObservation(body, { checkBinding: false });
      if (!this.#pending) {
        const changed = this.#binding && Object.keys(this.#binding).some(key =>
          observation.guard[key] !== this.#binding[key]);
        if (changed) {
          this.#binding = null;
          this.#needsBindingConfirmation = true;
          await this.#persist();
        }
        return { status: changed ? 'binding-changed' : 'observed', observation,
          requiresBinding: !this.#binding || this.#needsBindingConfirmation };
      }
      if (this.#binding && observation.guard.instance_id !== this.#binding.instance_id) {
        this.#pending = null;
        this.#binding = null;
        this.#needsBindingConfirmation = true;
        await this.#persist();
        return { actionId, status: 'previous-instance-ended', observation, requiresBinding: true };
      }
      this.#checkBinding(observation);
      const receipt = findReceipt(body, actionId);
      if (receipt?.status === 'not_executed' && !confirmedNotExecuted(receipt)) {
        throw this.#uncertain('Execution cancellation lacks conclusive no-effect evidence');
      }
      if (receipt?.effect_observed === true || receipt?.status === 'rejected' || confirmedNotExecuted(receipt)) {
        this.#pending = null;
        await this.#persist();
        return { actionId, status: receipt.effect_observed ? 'effect_observed' : receipt.status, receipt, observation,
          requiresBinding: this.#needsBindingConfirmation };
      }
      throw this.#uncertain('Action remains unconfirmed; keep game control paused');
    } finally {
      this.#busy = false;
    }
  }

  #checkGate(signal) {
    if (signal?.aborted || !this.#canAct() || this.#needsBindingConfirmation) {
      throw new Sts2Error('PAUSED', 'Game actions are paused');
    }
  }

  #checkBinding(observation) {
    if (!this.#binding) throw new Sts2Error('UNBOUND', 'Explicit local-player binding is required');
    if (!observation || Object.keys(this.#binding).some(key =>
      observation.guard[key] !== this.#binding[key])) {
      throw new Sts2Error('BINDING_CHANGED', 'Game instance, run, or local player changed', { pauseRequired: true });
    }
  }

  #checkAction(input, observation) {
    if (!Object.hasOwn(ACTION_FIELDS, input?.action) || !observation.guard.allowed_actions.includes(input.action)) {
      throw new Sts2Error('ACTION_NOT_ALLOWED', 'Action is outside the current companion allowlist');
    }
    if (!observation.availableActions.includes(input.action)) {
      throw new Sts2Error('NOT_ACTIONABLE', 'This screen or player state requires waiting or manual interaction');
    }
    const fields = ACTION_FIELDS[input.action];
    if (Object.keys(input).some(key => key !== 'action' && !fields.includes(key))) {
      throw new Sts2Error('INVALID_ACTION', 'Unexpected action argument');
    }
    for (const key of fields) {
      if (key === 'target') {
        if (input.target !== undefined && (typeof input.target !== 'string' || !input.target)) {
          throw new Sts2Error('INVALID_ACTION', 'Target must be a nonempty entity ID');
        }
      } else if (!Number.isSafeInteger(input[key]) || input[key] < 0) {
        throw new Sts2Error('INVALID_ACTION', 'Action index must be a nonnegative integer');
      }
    }
    const choices = choicesFor(input.action, observation.state);
    const index = input.action === 'select_card_reward' ? input.card_index : input.index;
    if (choices !== null && !choices.some(choice => choice.index === index)) {
      throw new Sts2Error('INVALID_ACTION', 'Selected index is not an available local choice');
    }
    if (input.action === 'discard_potion' && observation.phase !== 'combat' &&
        !observation.state.player?.potions?.some(potion => potion.slot === input.slot)) {
      throw new Sts2Error('INVALID_ACTION', 'Selected potion slot is not occupied');
    }
  }

  #acceptObservation(body, { checkBinding = true } = {}) {
    if (!body || typeof body.instance_id !== 'string' || !body.instance_id ||
        !Number.isSafeInteger(body.version) || body.version < 1 ||
        !body.state || typeof body.state !== 'object' || Array.isArray(body.state) ||
        !Array.isArray(body.allowed_actions) || body.allowed_actions.some(action => typeof action !== 'string') ||
        (body.receipts !== undefined && !Array.isArray(body.receipts))) {
      throw new Sts2Error('PROTOCOL_ERROR', 'Invalid companion observation', { pauseRequired: true });
    }
    const { state, ...guard } = body;
    const { phase, actionable, availableActions } = phaseOf(state, guard);
    const observation = { versionKey: JSON.stringify([guard.instance_id, guard.run_id, guard.local_player_id, guard.version]),
      phase, actionable, availableActions, state, guard };
    this.latest = observation;
    if (checkBinding && this.#binding) this.#checkBinding(observation);
    return observation;
  }

  async #waitForEffect(body, signal) {
    const { actionId, deadline } = this.#pending;
    while (true) {
      if (body?.state) {
        try { this.#acceptObservation(body); }
        catch { throw this.#uncertain('Game identity or protocol changed before effect confirmation'); }
        const receipt = findReceipt(body, actionId);
        if (receipt?.status === 'not_executed') {
          if (!confirmedNotExecuted(receipt)) throw this.#uncertain('Execution cancellation lacks conclusive no-effect evidence');
          this.#pending = null;
          await this.#persist();
          throw new Sts2Error('ACTION_NOT_EXECUTED', 'Game canceled this action before any effect; observe and make a new decision', { actionId });
        }
        if (receipt?.status === 'rejected') {
          this.#pending = null;
          await this.#persist();
          throw new Sts2Error('ACTION_REJECTED', 'Companion guard rejected the action', { actionId });
        }
        if (receipt?.effect_observed === true) {
          let observation;
          try { observation = await this.observe({ signal }); }
          catch { throw this.#uncertain('Local effect was observed but final state readback failed'); }
          this.#pending = null;
          await this.#persist();
          return { actionId, status: 'effect_observed', receipt, observation };
        }
        if (receipt?.status === 'uncertain' || body.requires_reconciliation) {
          throw this.#uncertain('Guard could not confirm the expected local effect');
        }
      }
      if (signal?.aborted || !this.#canAct()) throw this.#uncertain('Control paused after submission; reconcile its receipt');
      if (Date.now() >= deadline) throw this.#uncertain('Receipt deadline expired without local-effect confirmation');
      try {
        await delay(Math.min(this.pollIntervalMs, deadline - Date.now()), undefined, { signal });
        body = await this.#request({ actionId, signal, timeoutMs: Math.max(1, Math.min(this.requestTimeoutMs, deadline - Date.now())) });
      } catch {
        body = null;
      }
    }
  }

  #uncertain(message) {
    return new Sts2Error('ACTION_UNCERTAIN', message, { pauseRequired: true, actionId: this.#pending?.actionId });
  }

  async #persist() {
    try { await this.#onStateChange?.(this.snapshot()); }
    catch {
      throw new Sts2Error('STORE_FAILED', 'Could not persist companion action state',
        { pauseRequired: true, actionId: this.#pending?.actionId });
    }
  }

  async #request({ method = 'GET', payload, actionId, signal, timeoutMs = this.requestTimeoutMs } = {}) {
    const url = new URL(this.endpoint);
    if (actionId) url.searchParams.set('action_id', actionId);
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    try {
      const response = await this.#fetch(url.href, { method, redirect: 'error', signal: requestSignal,
        headers: { Authorization: `Bearer ${this.#token}`, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}) });
      if (!response.ok) {
        const error = new Sts2Error('HTTP_ERROR', `Companion request failed with HTTP ${response.status}`);
        error.httpStatus = response.status;
        throw error;
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Sts2Error) throw error;
      // Fetch and JSON errors can contain URLs or headers. Never forward them.
      throw new Sts2Error(signal?.aborted ? 'ABORTED' : 'TRANSPORT_ERROR', 'Companion request did not complete');
    }
  }
}

function findReceipt(body, actionId) {
  if (body.receipt?.action_id === actionId) return body.receipt;
  return body.receipts?.find(receipt => receipt.action_id === actionId);
}

function confirmedNotExecuted(receipt) {
  return receipt?.status === 'not_executed' && receipt.effect_observed === false && receipt.requires_reconciliation === false;
}

function localPlayer(state) {
  if (state?.game_mode !== 'multiplayer' || !Number.isInteger(state.local_player_slot) ||
      !Number.isInteger(state.player_count) || state.player_count < 2 || !Array.isArray(state.players) ||
      state.players.length !== state.player_count) return null;
  const local = state.players[state.local_player_slot];
  if (local?.is_local !== true || state.players.filter(player => player?.is_local === true).length !== 1) return null;
  return local;
}

function phaseOf(state, guard) {
  function offer(phase, candidates = []) {
    const availableActions = candidates.filter(action => guard.allowed_actions.includes(action));
    return { phase, actionable: availableActions.length > 0, availableActions };
  }
  const manual = offer('manual_interaction');
  const wait = offer('wait_for_player');
  const local = localPlayer(state);
  if (!local || guard.requires_reconciliation) return manual;
  if (guard.pending_action_id) return wait;
  if (local.is_alive !== true) return wait;
  if (BATTLE_SCREENS.has(state.state_type)) {
    if (local.is_ready_to_end_turn === true) return offer('ready');
    if (local.is_ready_to_end_turn !== false || state.battle?.all_players_ready === true ||
        state.battle?.turn !== 'player' || state.battle?.is_play_phase !== true) return wait;
    return offer('combat', ['play_card', 'end_turn', 'use_potion', 'discard_potion']);
  }
  if (state.state_type === 'map') {
    const vote = localVote(state.map?.votes);
    if (!vote) return manual;
    if (vote.voted) return wait;
    if (!Array.isArray(state.map.next_options)) return manual;
    if (!choicesFor('choose_map_node', state).length) return wait;
    return offer('map', ['choose_map_node']);
  }
  const candidates = [];
  function add(action, condition) { if (condition) candidates.push(action); }
  const canDiscardPotion = Array.isArray(state.player?.potions) && state.player.potions.some(potion =>
    Number.isSafeInteger(potion?.slot) && potion.slot >= 0);
  switch (state.state_type) {
    case 'rewards':
      add('claim_reward', choicesFor('claim_reward', state).length > 0);
      add('proceed', state.rewards?.can_proceed === true);
      add('discard_potion', canDiscardPotion);
      break;
    case 'card_reward':
      add('select_card_reward', choicesFor('select_card_reward', state).length > 0);
      add('skip_card_reward', state.card_reward?.can_skip === true);
      break;
    case 'event': {
      const event = state.event;
      if (event?.is_shared === true) {
        const vote = localVote(event.votes);
        if (!vote) return manual;
        if (vote.voted) return wait;
      } else if (event?.is_shared !== false) return manual;
      if (event.in_dialogue === true) add('advance_dialogue', true);
      else add('choose_event_option', choicesFor('choose_event_option', state).length > 0);
      break;
    }
    case 'rest_site':
      add('choose_rest_option', choicesFor('choose_rest_option', state).length > 0);
      add('proceed', state.rest_site?.can_proceed === true);
      break;
    case 'card_select':
      add('select_card', state.card_select?.preview_showing === false && choicesFor('select_card', state).length > 0);
      add('confirm_selection', state.card_select?.can_confirm === true);
      add('cancel_selection', state.card_select?.can_cancel === true);
      break;
    case 'shop':
    case 'fake_merchant': {
      const shop = shopState(state);
      if (shop?.started_fight === true) {
        add('proceed', shop.can_proceed === true);
      } else if (shop?.inventory_open === true) {
        add('shop_purchase', choicesFor('shop_purchase', state).length > 0);
        add('close_shop', true);
        add('discard_potion', canDiscardPotion);
      } else if (shop?.inventory_open === false) {
        add('open_shop', true);
        add('proceed', shop.can_proceed === true);
      }
      break;
    }
    case 'treasure': {
      const treasure = state.treasure;
      if (treasure?.can_open_chest === true) {
        add('open_treasure', true);
      } else if (treasure?.is_bidding_phase === true) {
        const bid = localVote(treasure.bids);
        if (!bid) return manual;
        if (bid.voted) return wait;
        add('claim_treasure_relic', choicesFor('claim_treasure_relic', state).length > 0);
      } else if (treasure?.is_bidding_phase === false) {
        add('proceed', treasure.can_proceed === true);
      }
      break;
    }
    default: return manual;
  }
  return offer(state.state_type, candidates);
}

function localVote(votes) {
  if (!Array.isArray(votes)) return null;
  const local = votes.filter(vote => vote?.is_local === true);
  return local.length === 1 && typeof local[0].voted === 'boolean' ? local[0] : null;
}

function shopState(state) {
  if (state.state_type !== 'fake_merchant') return state.shop;
  return { ...state.fake_merchant?.shop, inventory_open: state.fake_merchant?.inventory_open,
    started_fight: state.fake_merchant?.started_fight };
}

function choicesFor(action, state) {
  let choices;
  switch (action) {
    case 'choose_map_node': choices = state.map?.next_options; break;
    case 'claim_reward': choices = state.rewards?.items; break;
    case 'select_card_reward': choices = state.card_reward?.cards; break;
    case 'choose_event_option': choices = state.event?.options; break;
    case 'choose_rest_option': choices = state.rest_site?.options; break;
    case 'select_card': choices = state.card_select?.cards; break;
    case 'shop_purchase': choices = shopState(state)?.items; break;
    case 'claim_treasure_relic': choices = state.treasure?.relics; break;
    default: return null;
  }
  if (!Array.isArray(choices)) return [];
  return choices.filter(choice => {
    if (!Number.isSafeInteger(choice?.index) || choice.index < 0) return false;
    if (action === 'choose_event_option') return choice.is_locked === false && choice.was_chosen === false && choice.is_enabled !== false;
    if (action === 'select_card_reward' || action === 'select_card') return choice.can_select !== false;
    if (action === 'choose_rest_option') return choice.is_enabled === true;
    if (action === 'shop_purchase') return choice.is_stocked === true && choice.can_afford === true;
    return true;
  });
}
