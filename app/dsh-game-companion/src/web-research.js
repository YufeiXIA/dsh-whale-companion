export const webTools = ['web_search', 'web_fetch'];

export function publicTopic(value) {
  if (value?.public !== true || !['game','film','book','music','science','nature'].includes(value.category) || typeof value.topic !== 'string') return null;
  const topic=value.topic.trim();
  if (topic.length<2 || topic.length>40 || !/^[\p{L}\p{N} ·'’\-]+$/u.test(topic) || /\d{5}|密码|验证码|账号|账户|私聊|邮件|病历|身份证|住址|api.?key|token|secret/iu.test(topic)) return null;
  return {category:value.category,topic,public:true};
}

// The chat model chooses a complete prepared query; it cannot append screen text.
export function ambientSearchQueries(event, now=Date.now()) {
  const visual=event?.visual;
  const topic=visual && now-visual.capturedAt<180000 ? publicTopic(visual.searchTopic)?.topic : null;
  const games=['杀戮尖塔 2','杀戮尖塔','星露谷物语'];
  const subject=topic ?? [event?.openedInBackground,event?.application].find(name=>games.includes(name));
  return subject ? [`${subject} 趣闻`,`${subject} 入门建议`] : [];
}

export function publicSource(source) {
  try {
    const url = new URL(source.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, title: String(source.title || url.hostname).slice(0, 160) };
  } catch { return null; }
}

// Only accepted tool results can supply links. Never execute or render page markup.
export function researchSources(exec, result) {
  if (result.isError || !webTools.includes(exec.name)) return [];
  const value = result.value;
  const sources = exec.name === 'web_search' ? value?.sources :
    value?.statusCode >= 200 && value.statusCode < 300 ? [{ url: value.url }] : [];
  return (sources ?? []).map(publicSource).filter(Boolean);
}
