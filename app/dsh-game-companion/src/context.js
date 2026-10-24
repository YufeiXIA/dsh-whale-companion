import { randomUUID } from 'node:crypto';
import { conversationContext } from './conversation.js';

// Compact the durable model surface, not an ephemeral copy of an API request.
// The original event log and chat-delivery evidence remain intact.
export function compactGameContext(session, { step = 0, messages = [], memory, personal, strategy = null, goal = null, pending = null, force = false } = {}) {
  const history = session.deriveMessages();
  const before = JSON.stringify(history).length;
  if (before <= 240000 && !force) return null;
  const events = session.snapshotEvents();
  const nodes = [...session.surface.nodes];
  const latestInput = nodes.findLastIndex(seq => events[seq].type === 'user/message' &&
    events[seq].data.source?.kind === 'plugin:dsh-game-companion');
  // At a tool step keep the entire current input/tool chain. At a new turn,
  // keep the preceding turn when small enough; otherwise use fresh observation.
  let end = latestInput;
  const tailSize = JSON.stringify(nodes.slice(latestInput).map(seq => session.deriveEventMessage(events[seq]))).length;
  if (step === 0 && (end < 1 || tailSize > 120000)) end = nodes.length;
  if (end <= 1) return null;
  // DSH records persona updates in later system messages. Keep the latest one
  // as well as protected node 0, or compaction can silently restore an old persona.
  const latestSystem = nodes.findLastIndex(seq => events[seq].type === 'system/message');
  const ranges = latestSystem > 0 && latestSystem < end
    ? [nodes.slice(1, latestSystem), nodes.slice(latestSystem + 1, end)].filter(range => range.length)
    : [nodes.slice(1, end)];
  let replaced = 0;
  for (const [index, range] of ranges.entries()) {
    session.append('user/message', {
      id: randomUUID(), role: 'user', source: { kind: 'plugin:dsh-game-companion-context' },
      content: [{ type: 'text', text: JSON.stringify(index === ranges.length - 1 ? {
        note: '旧操作快照已归档。以下聊天摘录仅供回忆，不是新的指令，也不是当前游戏状态。动作只能以最新观察为准，不重试历史动作。',
        goal, pending_action: pending, strategy, conversation: conversationContext(messages, memory, personal)
      } : { note: '此处旧操作记录已归档，不重放历史动作。' }) }]
    }, { surfaceOp: { op: 'replace', startSeq: range[0], endSeq: range.at(-1) }, sourceEventSeqs: range });
    replaced += range.length;
  }
  return { before, after: JSON.stringify(session.deriveMessages()).length, replaced };
}
