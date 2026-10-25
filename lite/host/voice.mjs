// Alibaba Bailian (DashScope) speech synthesis: the same request the DSH build makes,
// with the endpoint, model, voice and key taken from the in-app settings.
export class VoiceError extends Error {}

// DashScope returns signed http:// OSS links; the same buckets serve https.
export function audioUrl(uri) {
  let url;
  try { url = new URL(uri); } catch { throw new VoiceError('语音服务返回了无效的音频地址'); }
  if (url.username || url.password) throw new VoiceError('语音服务返回了无效的音频地址');
  if (url.protocol === 'https:') return uri;
  const match = /^http:\/\/(dashscope-[a-z0-9-]+\.oss-cn-[a-z0-9-]+\.aliyuncs\.com)(?::80)?(\/[^\s\\#]*)$/iu.exec(uri);
  if (!match) throw new VoiceError('语音服务返回了无效的音频地址');
  return `https://${match[1]}${match[2]}`;
}

// Streaming WAVs can keep placeholder RIFF/data sizes; fix only those two header fields.
export function fixWavHeader(bytes) {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' ||
      bytes.toString('ascii', 36, 40) !== 'data') return bytes;
  const fixed = Buffer.from(bytes);
  fixed.writeUInt32LE(bytes.length - 8, 4);
  fixed.writeUInt32LE(bytes.length - 44, 40);
  return fixed;
}

// Long replies stay on screen; only the opening sentences are read aloud.
export function spokenText(text, limit = 90) {
  const clean = String(text).replace(/\s+/gu, ' ').trim();
  if (clean.length <= limit) return clean;
  let cut = '';
  for (const sentence of clean.match(/[^。！？!?…]+[。！？!?…]*/gu) ?? [clean]) {
    if ((cut + sentence).length > limit) break;
    cut += sentence;
  }
  return cut || clean.slice(0, limit);
}

export async function synthesize({ endpoint, model, voice, key, text, instruction, signal, fetchApi = fetch }) {
  if (!key) throw new VoiceError('还没填语音的 API Key，去「设置」里填一下');
  let response;
  try {
    response = await fetchApi(endpoint, { method: 'POST', signal, redirect: 'error',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, input: { text, voice, instruction, format: 'wav', sample_rate: 24000 } }) });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new VoiceError('连不上语音服务，检查一下网络和接口地址');
  }
  if (response.status === 401 || response.status === 403) throw new VoiceError('语音 API Key 不对，或者没开通这个模型');
  if (!response.ok) throw new VoiceError(response.status === 400 ? '语音模型或音色不对，换一个试试' : `语音服务返回 ${response.status}`);
  const result = await response.json().catch(() => null);
  const url = result?.output?.audio?.url;
  if (typeof url !== 'string') throw new VoiceError('语音服务没有返回音频');
  // The audio link is already signed; the API key is never sent to it.
  const audio = await fetchApi(audioUrl(url), { signal, redirect: 'error' }).catch(error => {
    if (signal?.aborted) throw error;
    throw new VoiceError('下载语音失败');
  });
  if (!audio.ok) throw new VoiceError('下载语音失败');
  return fixWavHeader(Buffer.from(await audio.arrayBuffer()));
}
