const calibration = /连接测试|语音校准|试听|不要读取或操作游戏/u;
const preference = /我(?:不)?喜欢|我(?:更)?希望|我不爱|以后(?:请|别|不要)|叫我|别叫我|^(?:请)?记住[：:，,\s]?/u;
const clean = text => text.trim().replace(/[。！!～~]+$/u, '');

function topicOf(text) {
  if (/叫我|称呼|名字/u.test(text)) return '称呼';
  if (/语音|声音|音色/u.test(text)) return '语音偏好';
  if (/反问|问我/u.test(text)) return '提问方式';
  if (/简短|短句|详细|啰嗦|话痨|解释/u.test(text)) return '回复详略';
  if (/说话|安静/u.test(text)) return '交流频率';
  if (/冒险|保守|稳健|激进|风险/u.test(text)) return '风险偏好';
  if (/建议|指挥|操作|执行|配合|分工|帮我打|商量|关键选择/u.test(text)) return '合作方式';
  return clean(text).replace(/^(?:请)?记住[：:，,\s]*/u, '')
    .replace(/^我(?:不)?喜欢|^我不爱/u, '').split(/[，,。]/u)[0].slice(0, 100);
}

export function loadPersonalMemory(saved, conversations = []) {
  if (saved !== undefined) {
    if (saved?.version !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 0 ||
        !Array.isArray(saved.entries) || saved.entries.length > 24 ||
        saved.entries.some(item => !item || typeof item.id !== 'string' || typeof item.topic !== 'string' ||
          typeof item.text !== 'string' || item.text.length > 300 || !Number.isFinite(item.at))) {
      throw new Error('Invalid personal memory');
    }
    return structuredClone(saved);
  }
  const result = { version: 1, revision: 0, entries: [] };
  // One-time migration uses actual user messages, never assistant summaries.
  const messages = conversations.flatMap(conversation => conversation.messages ?? [])
    .filter(message => message.role === 'user').sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  for (const message of messages) editPersonalMemory(result, message);
  return result;
}

export function editPersonalMemory(memory, message, sessionId = null) {
  if (message.role !== 'user' || typeof message.text !== 'string' || calibration.test(message.text)) return null;
  // This is an explicit-statement extractor, not a semantic summarizer. Keep
  // the first statement so appended response instructions do not reclassify it.
  const text = clean(message.text.trim().split(/[。！？!?\n]/u)[0]);
  const forget = /^(?:请)?(?:忘记|删除(?:记忆|偏好)?|不要再记住)[：:，,\s]*(.+)$/u.exec(text);
  if (forget) {
    const query = clean(forget[1]);
    const all = /^(?:全部|所有)(?:的)?(?:记忆|偏好)?$/u.test(query);
    const topic = topicOf(query);
    const previous = memory.entries.length;
    memory.entries = memory.entries.filter(item => !all && item.topic !== topic && !item.text.includes(query));
    memory.revision++;
    return { operation: 'forget', removed: previous - memory.entries.length };
  }
  if (!preference.test(text)) return null;
  const topic = topicOf(text);
  if (!topic) return null;
  memory.entries = [...memory.entries.filter(item => item.topic !== topic && item.id !== message.id), {
    id: message.id, topic, text: text.slice(0, 300), at: message.at ?? Date.now(), sourceSession: sessionId
  }].slice(-24);
  memory.revision++;
  return { operation: 'remember', topic };
}

export function personalContext(memory) {
  return { revision: memory.revision, entries: memory.entries.map(({ id, topic, text, at }) => ({ id, topic, text, at })),
    note: '这些是用户有来源的长期偏好。较新条目优先；已经删除的偏好不能从旧聊天重新恢复。记住/忘记只影响偏好，不删除聊天原文。' };
}
