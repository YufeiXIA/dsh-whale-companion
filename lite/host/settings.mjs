// Model and voice settings for the standalone app. API keys never live here:
// they go through the injected secret store and the panel only sees a short hint.
export const chatPresets = Object.freeze({
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  qwen: { label: '通义千问（阿里百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  kimi: { label: 'Kimi（月之暗面）', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  zhipu: { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { label: '其他（OpenAI 兼容）', baseUrl: '', model: '' }
});

export const voiceDefaults = Object.freeze({
  endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
  model: 'qwen-audio-3.1-tts-flash', voice: 'longhua_v3.1'
});

export const secretNames = Object.freeze(['chatKey', 'voiceKey', 'visionKey']);

export function defaultSettings() {
  return { version: 1, chat: { preset: 'deepseek', ...pick(chatPresets.deepseek), thinking: false },
    voice: { ...voiceDefaults }, vision: { baseUrl: '', model: '' } };
}

function pick({ baseUrl, model }) { return { baseUrl, model }; }

function httpsUrl(value, field) {
  const text = String(value ?? '').trim().replace(/\/+$/, '');
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error(`${field}不是有效的网址`); }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error(`${field}要用 https:// 开头`);
  if (url.username || url.password || url.hash) throw new Error(`${field}里不能带账号或 # 片段`);
  return text;
}

function shortText(value, field, max = 120) {
  const text = String(value ?? '').trim();
  if (text.length > max || /[\s"'<>]/u.test(text)) throw new Error(`${field}格式不对`);
  return text;
}

// Accepts a partial update from the panel and returns the merged, validated settings.
export function mergeSettings(current, update = {}) {
  const next = structuredClone(current);
  if (update.chat) {
    const preset = update.chat.preset ?? next.chat.preset;
    if (!Object.hasOwn(chatPresets, preset)) throw new Error('不认识这个服务商');
    if (preset !== next.chat.preset && update.chat.baseUrl === undefined) Object.assign(next.chat, pick(chatPresets[preset]));
    next.chat.preset = preset;
    if (update.chat.baseUrl !== undefined) next.chat.baseUrl = httpsUrl(update.chat.baseUrl, '接口地址');
    if (update.chat.model !== undefined) next.chat.model = shortText(update.chat.model, '模型名');
    if (update.chat.thinking !== undefined) {
      if (typeof update.chat.thinking !== 'boolean') throw new Error('深度思考开关格式不对');
      next.chat.thinking = update.chat.thinking;
    }
  }
  if (update.voice) {
    if (update.voice.endpoint !== undefined) next.voice.endpoint = httpsUrl(update.voice.endpoint, '语音接口地址') || voiceDefaults.endpoint;
    if (update.voice.model !== undefined) next.voice.model = shortText(update.voice.model, '语音模型') || voiceDefaults.model;
    if (update.voice.voice !== undefined) next.voice.voice = shortText(update.voice.voice, '音色') || voiceDefaults.voice;
  }
  if (update.vision) {
    if (update.vision.baseUrl !== undefined) next.vision.baseUrl = httpsUrl(update.vision.baseUrl, '看图接口地址');
    if (update.vision.model !== undefined) next.vision.model = shortText(update.vision.model, '看图模型');
  }
  return next;
}

export function loadSettings(saved) {
  const base = defaultSettings();
  if (!saved || saved.version !== 1) return base;
  try { return mergeSettings(base, saved); } catch { return base; }
}

// Vision falls back to the chat endpoint, model and key unless set separately.
export function visionRoute(settings, secrets) {
  const baseUrl = settings.vision.baseUrl || settings.chat.baseUrl;
  return { baseUrl, model: settings.vision.model || settings.chat.model,
    key: secrets.get('visionKey') || (settings.vision.baseUrl ? null : secrets.get('chatKey')) };
}
