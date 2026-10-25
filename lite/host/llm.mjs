// One OpenAI-compatible chat call. Errors become short Chinese hints for the panel;
// the raw provider body is never shown because it can echo request details.
export class LlmError extends Error {}

function hint(status) {
  if (status === 401 || status === 403) return 'API Key 不对，或者没有这个模型的权限';
  if (status === 404) return '接口地址或模型名不对';
  if (status === 402) return '账户余额不足';
  if (status === 429) return '请求太频繁或额度用完了，过一会儿再试';
  if (status >= 500) return '模型服务那边出错了，过一会儿再试';
  return `模型服务返回 ${status}`;
}

export async function chatCompletion({ baseUrl, model, key, messages, json = true, maxTokens = 500, thinking = false, signal, fetchApi = fetch }) {
  if (!baseUrl || !model) throw new LlmError('还没设置聊天模型，去「设置」里填一下');
  if (!key) throw new LlmError('还没填聊天的 API Key，去「设置」里填一下');
  // DeepSeek models think first by default; that is slow for chat and can use up max_tokens
  // before any reply text, so it stays off unless the 深度思考 switch asks for it.
  const deepseek = new URL(baseUrl).hostname === 'api.deepseek.com';
  const send = async withFormat => fetchApi(`${baseUrl}/chat/completions`, {
    method: 'POST', signal, redirect: 'error',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.8,
      ...(deepseek ? { thinking: { type: thinking ? 'enabled' : 'disabled' } } : {}),
      ...(withFormat ? { response_format: { type: 'json_object' } } : {}) })
  });
  let response;
  try {
    response = await send(json);
    // Some compatible services reject response_format; the prompt still asks for JSON.
    if (json && response.status === 400) response = await send(false);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new LlmError('连不上模型服务，检查一下网络和接口地址');
  }
  if (!response.ok) throw new LlmError(hint(response.status));
  const result = await response.json().catch(() => null);
  const choice = result?.choices?.[0], content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmError(choice?.message?.reasoning_content && choice.finish_reason === 'length'
      ? '模型把字数都用在思考上了，换一个不带思考的模型试试' : '模型没有返回内容');
  }
  return content;
}

export async function listModels({ baseUrl, key, signal, fetchApi = fetch }) {
  if (!baseUrl) throw new LlmError('先填接口地址');
  if (!key) throw new LlmError('先填 API Key');
  let response;
  try {
    response = await fetchApi(`${baseUrl}/models`, { signal, redirect: 'error', headers: { authorization: `Bearer ${key}` } });
  } catch { throw new LlmError('连不上模型服务，检查一下网络和接口地址'); }
  if (!response.ok) throw new LlmError(hint(response.status));
  const result = await response.json().catch(() => null);
  const ids = (Array.isArray(result?.data) ? result.data : []).map(item => item?.id).filter(id => typeof id === 'string');
  return [...new Set(ids)].sort().slice(0, 200);
}

// Models sometimes wrap JSON in a code fence or add a sentence around it.
export function parseReply(content) {
  const text = content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const value = JSON.parse(text.slice(start, end + 1));
      if (value && typeof value.text === 'string') return value;
    } catch { /* plain text reply below */ }
  }
  return { text };
}
