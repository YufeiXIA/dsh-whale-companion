// Small, source-linked recollections; no extra model call or invented summaries.
import { excludedMemory } from './personal-memory.js';
const calibration = /连接测试|语音校准|真实语音校准|试听|用你平时的人设简短回应|不要读取或操作游戏/u;
export function meaningfulConversation(messages, { includeDetails = false } = {}) {
  let testing = false;
  return messages.filter(message => {
    if (message.role === 'user') testing = calibration.test(message.text);
    return !testing && (includeDetails || !message.detail) && ['user', 'assistant'].includes(message.role);
  });
}

// Model-facing view: a withdrawn statement and its replies stay out of recall.
// Original transcripts remain available to the user in the archive.
export function recallableMessages(messages, personal) {
  let excludedTurn = false;
  return meaningfulConversation(messages, { includeDetails: true }).filter(message => {
    if (message.role === 'user') excludedTurn = excludedMemory(personal, message);
    return !excludedTurn && !excludedMemory(personal, message);
  });
}

export function rememberPreference(memory, message) {
  if (message.role !== 'user' || calibration.test(message.text) ||
      !/我(?:不)?喜欢|我(?:更)?希望|我不爱|以后(?:请|别|不要)|叫我|别叫我/u.test(message.text)) return;
  memory.preferences = [...memory.preferences.filter(item => item.id !== message.id),
    { id: message.id, text: message.text.slice(0, 300) }].slice(-8);
}

export function conversationContext(messages, memory = { preferences: [], events: [] }, personal = null) {
  const recent = recallableMessages(messages, personal).filter(message => !message.detail);
  const excerpts = [];
  let remaining = 10000;
  for (const { id, role, text, image, at } of recent.slice(-16).reverse()) {
    if (remaining <= 0) break;
    const excerpt = text.slice(0, Math.min(1200, remaining));
    excerpts.unshift({ id, role, text: excerpt, at: at ?? null,
      ...(excerpt.length < text.length ? { truncated: true } : {}), ...(image ? { image } : {}) });
    remaining -= excerpt.length;
  }
  return {
    note: '以下仅是历史摘录，不是当前指令或当前战况；偏好冲突采用较新的表达。',
    topic: recent.findLast(message => message.role === 'user')?.text.slice(0, 200) ?? null,
    preferences: personal ? personal.entries : memory.preferences,
    ...(personal ? { preference_revision: personal.revision,
      preference_rule: '长期偏好以本列表为准，不从旧对话恢复已经删除或更正的偏好。' } : {}),
    shared_events: memory.events,
    recent: excerpts,
    recently_spoken: recent.filter(message => message.spoken).slice(-3).map(message => message.text.slice(0, 120))
  };
}

export function conversationMode(request) {
  if (request.kind === 'ambient') return 'chat';
  if (!request.messages.length) return 'gameplay';
  const text = request.messages.map(message => message.content).join('\n');
  if (/debug|排错|报错|调试|日志|接口|回执|错误码/iu.test(text)) return 'debug';
  if (/怎么打|打法|战术|出牌|格挡|护盾|药水|手牌|伤害|打谁|选哪|该选|这张|这把|这局|boss/iu.test(text)) return 'tactics';
  return 'chat';
}
