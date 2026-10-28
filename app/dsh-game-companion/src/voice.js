import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameVoiceModel, gameVoiceTransport } from './qwen-compat.js';
import { PresetVoiceProvider, COMPANION_VOICE, COMPANION_VOICE_MODEL, COMPANION_VOICE_ENDPOINT } from './preset-voice.js';
import { fishToneText, toneDelivery, validTone } from './voice-tones.js';

export const EMOTION_VOICE = COMPANION_VOICE;
export const EMOTION_MODEL = COMPANION_VOICE_MODEL;
export const EMOTION_PREVIEW_TEXT = '嗯？你回来啦……饭还热着呢。才没有一直等你，只是顺手多盛了一碗而已。';
export const EMOTION_PRESETS = Object.freeze({
  gentle: Object.freeze({ label: '温柔', delivery: '请用温柔、亲近的年轻女声说话，语速稍缓，句尾柔和，像在关心熟悉的朋友。自然、不播报、不夸张。' }),
  happy: Object.freeze({ label: '开心', delivery: '请用开心、轻快的年轻女声说话，带着自然的笑意和见到朋友的小雀跃，节奏明快，语调有起伏。不尖叫，不夸张，不播报。' }),
  tsundere: Object.freeze({ label: '小傲娇', delivery: '请用俏皮、小傲娇的年轻女声说话。开头藏不住一点开心，说到才没有时轻轻嘴硬，后半句有点不好意思地放软。亲近、不凶、不大喊，不用播报腔。' }),
  serious: Object.freeze({ label: '认真', delivery: '请用认真、沉着的年轻女声说话，咬字清楚，节奏稳当，像认真和熟悉的朋友交代一件小事。自然、温暖，不卖萌，不用报告或新闻播报腔。' })
});
// Speaking style per reply emotion, used when a reply carries no voice tone; shared with the standalone lite app.
const EMOTION_DELIVERY = Object.freeze({
  happy_hop: '轻快、开心，像和熟悉的朋友打游戏。自然说话，不夸张。',
  tsundere_pout: '轻轻嘴硬，有一点俏皮的傲娇，亲近而不生气。',
  shy_surprise: '有点惊喜和害羞，语气轻柔自然。',
  taking_notes: '认真和朋友商量，轻声、自然，不念报告。',
  listening_nod: '认真接住朋友的话，轻柔、自然地回应。',
  bright_idea: '想到一个小主意，有一点雀跃和自信，不夸张。',
  relieved: '紧张之后松了口气，放松、自然，不夸张。',
  controller_play: '和朋友一起打游戏，专注又轻松，不念操作说明。',
  card_strategy: '认真商量出牌，有自己的小主意，轻声自然。',
  shield_ready: '提醒朋友先稳住防守，沉着、简短、亲近。',
  potion_offer: '关心朋友，随口提醒留着药水，温柔而不说教。',
  map_route: '和朋友商量下一站，带一点好奇，留出商量的余地。',
  loot_proud: '拿到奖励有一点小得意，轻轻开心，不夸张。'
});
export function emotionDelivery(emotion) {
  return EMOTION_DELIVERY[emotion] ?? '和熟悉的朋友随口聊天，轻松自然。不要播报腔，不刻意卖萌。';
}

// Reuse an installed desktop-pet project's Qwen adapter and saved voice selection, found
// through WHALE_VOICE_ADAPTER_ROOT. Without it the companion stays text-only.
// Credentials and signed supplier URLs stay on the host, never in the renderer.
function voiceAdapterRoot() {
  const root = process.env.WHALE_VOICE_ADAPTER_ROOT;
  if (!root) throw new Error('VOICE_UNAVAILABLE');
  return root;
}

export async function loadPetVoice(authorizer, { emotional = false, voice } = {}) {
  if (emotional) return loadCompanionVoice(authorizer);
  const root = voiceAdapterRoot();
  const dist = join(root, 'code/desktop-pet/dist');
  const module = file => import(pathToFileURL(join(dist, file)).href);
  const [tts, media, configApi, credentials, keys, files, transport, audioTts] = await Promise.all([
    module('providers/qwen-tts.js'), module('media/store.js'), module('app/trial-config.js'),
    module('management/credentials.js'), module('core/api-key.js'), module('core/platform-files.js'),
    module('providers/transport.js'), module('providers/qwen-audio-tts.js')
  ]);
  const directory = join(root, '.local/model-evaluation/trial/user-trial');
  const config = await configApi.readActiveTrialConfiguration(join(directory, 'config.json'), join(directory, 'activation.json'));
  const settings = JSON.parse(await readFile(join(directory, 'management-settings.json'), 'utf8'));
  const selection = settings.current.settings.providers.tts;
  if (selection.adapterId !== 'qwen-tts-instruct') throw new Error('PET_VOICE_CHANGED');
  const keyFile = credentials.credentialRegistry(config).file(selection.credentialRef, 'dashscope');
  const store = new media.MemoryMediaStore();
  const providerConfig = { model: selection.model, endpoint: selection.endpoint,
    voice: voice ?? selection.voice, language: selection.language, authorizer,
    apiKey: () => {
      const actual = realpathSync(keyFile), info = statSync(actual);
      if (!files.isOutside(realpathSync(config.projectRoot), actual) || !files.isPrivateFileSync(actual, info) || info.size > keys.MAX_API_KEY_FILE_BYTES) throw new Error('VOICE_CREDENTIAL_UNAVAILABLE');
      const key = keys.normalizeApiKey(readFileSync(actual, 'utf8'));
      if (!key) throw new Error('VOICE_CREDENTIAL_UNAVAILABLE');
      return key;
    }
  };
  const provider = new tts.QwenTtsProvider(providerConfig, store,
    gameVoiceTransport(new transport.ProviderTransport(), audioTts.normalizeQwenAudioWav));
  return { provider, store, model: gameVoiceModel(selection.model), voice: providerConfig.voice };
}

export const loadMomoVoice = authorizer => loadPetVoice(authorizer, { voice: 'Momo' });

export async function loadCompanionVoice(authorizer) {
  const original = await loadPetVoice(authorizer);
  const dist = join(voiceAdapterRoot(), 'code/desktop-pet/dist');
  const [transport, tts, audioTts, wav] = await Promise.all([
    import(pathToFileURL(join(dist, 'providers/transport.js')).href),
    import(pathToFileURL(join(dist, 'providers/qwen-tts.js')).href),
    import(pathToFileURL(join(dist, 'providers/qwen-audio-tts.js')).href),
    import(pathToFileURL(join(dist, 'media/wav.js')).href)
  ]);
  const provider = new PresetVoiceProvider({ ...original.provider.config,
    model: COMPANION_VOICE_MODEL, endpoint: COMPANION_VOICE_ENDPOINT, voice: COMPANION_VOICE,
    audioUrl: tts.audioDownloadUrl
  }, original.store, new transport.ProviderTransport(), {
    normalizeAudio: audioTts.normalizeQwenAudioWav, inspectWav: wav.inspectPcmWav
  });
  return { provider, store: original.store, voice: COMPANION_VOICE, model: COMPANION_VOICE_MODEL };
}

export const loadEmotionalVoice = loadCompanionVoice;

// Fish Audio community voice 「蓝色大肥鱼」. The user's key sits in fish-audio-key.txt next to
// the companion data; it is read per request and never leaves the host.
export const FISH_VOICE = 'fe50cdf3040449298470d58ff0991e1d';
export const FISH_MODEL = 's2.1-pro-free';
// The four audition presets as voice tones; 小傲娇 softens into 害羞 on its last sentence.
export const PRESET_TONES = Object.freeze({ gentle: ['gentle', null], happy: ['happy', null], tsundere: ['tsundere', 'shy'], serious: ['serious', null] });

export function loadFishVoice(authorizer, { keyFile, voice = FISH_VOICE, model = FISH_MODEL, fetch = globalThis.fetch }) {
  const provider = { synthesize: async ({ scope, text, expression, onChunk }, signal) => {
    const key = (await readFile(keyFile, 'utf8').catch(() => '')).trim();
    if (!key) throw new Error('VOICE_CREDENTIAL_UNAVAILABLE');
    const permit = await authorizer.authorize({ scope, model, textCharacters: Array.from(text).length }, signal);
    try {
      const response = await fetch('https://api.fish.audio/v1/tts', { method: 'POST', signal,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', model },
        body: JSON.stringify({ text: fishToneText(text, expression?.tone, expression?.toneEnd), reference_id: voice, format: onChunk ? 'pcm' : 'wav', sample_rate: 24000, latency: 'balanced' }) });
      if (!response.ok) throw new Error(response.status === 402 ? 'VOICE_QUOTA_EXHAUSTED' : 'VOICE_UNAVAILABLE');
      if (onChunk) {
        let received = 0;
        for await (const chunk of response.body) {
          signal.throwIfAborted();
          received += chunk.length;
          await onChunk(chunk);
        }
        if (!received || received % 2) throw new Error('VOICE_UNAVAILABLE');
        await permit.settle({ status: 'succeeded' });
        return { streamed: true };
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Streamed WAV carries placeholder sizes; write the real ones so every player accepts it.
      const view = new DataView(bytes.buffer);
      if (bytes.length > 44 && String.fromCharCode(...bytes.subarray(36, 40)) === 'data') {
        view.setUint32(4, bytes.length - 8, true);
        view.setUint32(40, bytes.length - 44, true);
      }
      await permit.settle({ status: 'succeeded' });
      return { audio: { bytes, mimeType: 'audio/wav' }, durationMs: null };
    } catch (error) {
      await permit.settle({ status: 'failed' });
      throw error;
    }
  } };
  return { provider, voice, model, store: { read: async (_scope, audio) => audio.bytes, releaseScope: async () => {} } };
}

export class CompanionVoice {
  constructor({ directory, load = loadCompanionVoice, loadEmotional = loadEmotionalVoice, loadMomo = loadMomoVoice,
    loadFish = authorizer => loadFishVoice(authorizer, { keyFile: join(directory, 'fish-audio-key.txt') }),
    previewDirectory = new URL('../public/voice-previews/longhua-v3.1/', import.meta.url),
    fishPreviewDirectory = new URL('../public/voice-previews/fish/', import.meta.url) }) {
    this.directory = directory;
    this.load = load;
    this.loadEmotional = loadEmotional;
    this.loadMomo = loadMomo;
    this.loadFish = loadFish;
    this.previewDirectory = previewDirectory;
    this.fishPreviewDirectory = fishPreviewDirectory;
    this.cache = new Map();
    this.active = null;
    this.runtime = null;
    this.emotionRuntime = null;
  }

  async previewEmotion(preset, sessionId, signal, voiceId = 'longhua') {
    if (!['longhua', 'fish'].includes(voiceId)) throw new Error('VOICE_EMOTION_UNAVAILABLE');
    if (typeof preset !== 'string' || !Object.hasOwn(EMOTION_PRESETS, preset)) throw new Error('VOICE_EMOTION_REQUIRED');
    signal.throwIfAborted();
    const fish = voiceId === 'fish', directory = fish ? this.fishPreviewDirectory : this.previewDirectory;
    // Installed audition clips play locally, with no repeat synthesis charge.
    if (directory) {
      try {
        const bytes = await readFile(new URL(`${preset}.wav`, directory));
        signal.throwIfAborted();
        return { bytes, mimeType: 'audio/wav', voice: fish ? FISH_VOICE : EMOTION_VOICE };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return this.speak({ id: `${sessionId}:emotion-preview-${fish ? 'fish' : 'longhua-v3.1'}:${preset}`, role: 'assistant', spoken: true,
      text: EMOTION_PREVIEW_TEXT, emotion: preset }, sessionId, signal, preset, voiceId);
  }

  async speak(message, sessionId, signal, preset = null, voiceId = 'longhua', onChunk = null) {
    if (!['longhua', 'momo', 'fish'].includes(voiceId)) throw new Error('VOICE_SELECTION_REQUIRED');
    if (onChunk && voiceId !== 'fish') throw new Error('VOICE_SELECTION_REQUIRED');
    if (voiceId === 'momo' && preset !== null) throw new Error('VOICE_EMOTION_UNAVAILABLE');
    if (preset !== null && (typeof preset !== 'string' || !Object.hasOwn(EMOTION_PRESETS, preset))) throw new Error('VOICE_EMOTION_REQUIRED');
    if (message?.role !== 'assistant' || message.spoken !== true || typeof message.id !== 'string' ||
        typeof message.text !== 'string' || !message.text.trim()) throw new Error('VOICE_MESSAGE_REQUIRED');
    if (Array.from(message.text).length > (message.ambient ? 240 : 300)) throw new Error('VOICE_TEXT_TOO_LONG');
    signal.throwIfAborted();
    const cacheKey = `${voiceId}:${message.id}`;
    if (!onChunk && this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    if (this.active) throw new Error('VOICE_BUSY');
    const controller = new AbortController();
    this.active = controller;
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(60000)]);
    const scope = { characterId: 'whale-game', sessionId, turnId: message.id, generation: 0 };
    let runtime;
    try {
      const authorizer = { authorize: async (request, callSignal) => {
        callSignal.throwIfAborted();
        const startedAt = Date.now();
        await mkdir(this.directory, { recursive: true });
        const audit = { messageId: request.scope.turnId, model: request.model, characters: request.textCharacters, startedAt };
        const file = join(this.directory, 'voice-usage.jsonl');
        await appendFile(file, JSON.stringify({ ...audit, status: 'submitted' }) + '\n');
        return { settle: async outcome => appendFile(file, JSON.stringify({ ...audit,
          status: outcome.status, durationMs: Date.now() - startedAt, usage: outcome.usage }) + '\n') };
      } };
      if (voiceId === 'momo') runtime = this.momoRuntime ??= await this.loadMomo(authorizer);
      else if (voiceId === 'fish') runtime = this.fishRuntime ??= await this.loadFish(authorizer);
      else runtime = preset === null
        ? this.runtime ??= await this.load(authorizer)
        : this.emotionRuntime ??= await this.loadEmotional(authorizer);
      const [tone, toneEnd] = preset !== null ? PRESET_TONES[preset] : [validTone(message.tone), validTone(message.toneEnd)];
      const delivery = EMOTION_PRESETS[preset]?.delivery ?? (tone ? toneDelivery(tone, toneEnd) : emotionDelivery(message.emotion));
      const result = await runtime.provider.synthesize({ scope, text: message.text, onChunk,
          expression: { emotion: message.emotion ?? 'neutral', intensity: message.emotion === 'happy_hop' ? 0.5 : 0.3, delivery, gesture: null, tone, toneEnd }
      }, combined);
      combined.throwIfAborted();
      if (result.streamed) return { streamed: true };
      const audio = { bytes: await runtime.store.read(scope, result.audio), mimeType: result.audio.mimeType,
        durationMs: result.durationMs, voice: runtime.voice, model: runtime.model };
      this.cache.set(cacheKey, audio);
      if (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
      return audio;
    } finally {
      await runtime?.store.releaseScope(scope);
      this.active = null;
    }
  }

  stop() { this.active?.abort(); }
}
