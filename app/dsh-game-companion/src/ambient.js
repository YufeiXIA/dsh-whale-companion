// Activity samples carry only allow-listed identities, not titles or input text.
// Separately authorized image capture uses its own expiring ticket; saved policy
// state contains settings/counters, while coarse cues enter the model's chat log.
export const ambientApps = Object.freeze({
  code: ['coding', '代码编辑器'], documents: ['work', '文档工具'],
  browser: ['browser', '浏览器'], media: ['media', '影音播放器'],
  sts2: ['game', '杀戮尖塔 2'], sts: ['game', '杀戮尖塔'],
  stardew: ['game', '星露谷物语'], game: ['game', '游戏'],
  desktop: ['desktop', '桌面'], companion: ['companion', '搭子窗口'],
  other: ['other', '其他程序']
});
// Background apps arrive as allow-listed kinds only; the label is all the model sees.
export const backgroundApps = Object.freeze({
  steam: 'Steam', epic: 'Epic 游戏平台', discord: 'Discord', wechat: '微信', qq: 'QQ', music: '音乐软件',
  obs: 'OBS 录屏/直播', download: '下载工具', code: '代码编辑器', documents: '文档工具', browser: '浏览器',
  media: '视频播放器', terminal: '终端', ai: 'AI 助手（ChatGPT、Claude、Codex 之类）',
  sts2: '杀戮尖塔 2', sts: '杀戮尖塔', stardew: '星露谷物语'
});

export class AmbientCompanion {
  constructor(saved = {}, { now = Date.now } = {}) {
    this.now = now;
    this.enabled = saved.enabled !== false;
    this.intervalMinutes = saved.intervalMinutes ?? saved.minMinutes ?? 5;
    // Off until the user turns it on and confirms; older saves that only had the default do not count.
    this.visionEnabled = saved.visionOptIn === true;
    this.backgroundEnabled = saved.backgroundEnabled !== false;
    this.background = null;
    this.newBackground = [];
    this.lastCaptureAt = Number(saved.lastCaptureAt) || 0;
    // Legacy randomized/backoff deadlines must not delay the fixed schedule.
    this.nextAt = saved.intervalMinutes !== undefined && Number.isFinite(saved.nextAt)
      ? saved.nextAt : now() + this.cooldown();
    this.lastUserAt = now();
    this.lastSampleAt = 0;
    this.revision = 0;
    this.current = null;
    this.topics = new Map();
    this.result = null;
    this.waitingReason = 'starting';
  }

  save() {
    return { enabled: this.enabled, intervalMinutes: this.intervalMinutes,
      visionOptIn: this.visionEnabled, backgroundEnabled: this.backgroundEnabled, lastCaptureAt: this.lastCaptureAt,
      nextAt: this.nextAt };
  }

  status() {
    let waitingReason = this.waitingReason;
    if (!this.enabled) waitingReason = 'disabled';
    else if (!this.fresh()) waitingReason = 'unavailable';
    return { enabled: this.enabled, intervalMinutes: this.intervalMinutes, visionEnabled: this.visionEnabled,
      backgroundEnabled: this.backgroundEnabled, available: this.fresh(),
      waitingReason,
      quietUntil: this.nextAt, lastResult: this.result,
      policy: '按固定周期检查并主动陪伴，默认每5分钟，可手动调整；不因未回复延长。看图须先开启，只看主屏可见窗口；后台程序只读类别。忙碌、免打扰、锁屏时暂缓，恢复后不连续补发。' };
  }

  fresh() {
    return this.enabled && this.current !== null && this.now() - this.lastSampleAt <= 25000;
  }

  valid(event) {
    return this.fresh() && this.revision === event.revision && this.now() < event.expiresAt &&
      (event.resumed === true || this.current.app !== 'companion');
  }

  invalidate() {
    this.current = null;
    this.revision++;
  }

  configure(enabled, { intervalMinutes = this.intervalMinutes, visionEnabled = this.visionEnabled,
    backgroundEnabled = this.backgroundEnabled } = {}) {
    if (typeof enabled !== 'boolean') throw new Error('Expected ambient enabled boolean');
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60 || typeof visionEnabled !== 'boolean' ||
        typeof backgroundEnabled !== 'boolean') throw new Error('请选择1～60分钟内的有效周期');
    const resetClock = enabled !== this.enabled || intervalMinutes !== this.intervalMinutes;
    this.enabled = enabled;
    this.intervalMinutes = intervalMinutes;
    this.visionEnabled = visionEnabled;
    this.backgroundEnabled = backgroundEnabled;
    this.background = null; this.newBackground = [];
    this.invalidate();
    if (resetClock) this.nextAt = this.now() + this.cooldown();
  }

  userInteraction() {
    this.lastUserAt = this.now();
    this.revision++;
  }

  cooldown() { return this.intervalMinutes * 60000; }

  captureDue() { return this.visionEnabled; }

  sample(sample, { blocked = false } = {}) {
    if (!sample || typeof sample.available !== 'boolean' ||
        (sample.available && (!Object.hasOwn(ambientApps, sample.app) ||
          !Number.isFinite(sample.idleMs) || sample.idleMs < 0 ||
          (sample.background !== undefined && (!Array.isArray(sample.background) || sample.background.length > 30 ||
            !sample.background.every(kind => Object.hasOwn(backgroundApps, kind))))))) throw new Error('Invalid desktop activity sample');
    const now = this.now();
    const gap = now - this.lastSampleAt > 25000;
    this.lastSampleAt = now;
    if (!this.enabled || !sample.available) { this.invalidate(); return null; }
    this.trackBackground(this.backgroundEnabled ? sample.background ?? [] : []);
    if (gap || sample.app !== this.current?.app || sample.contextKey !== this.current?.contextKey) {
      this.current = { app: sample.app, contextKey: sample.contextKey, since: now, offered: false, longOffered: false };
    }
    const current = this.current;
    this.waitingReason = null;
    if (blocked) this.waitingReason = 'busy';
    else if (sample.app === 'companion') this.waitingReason = 'companion';
    else if (now < this.nextAt) this.waitingReason = 'cooldown';
    if (this.waitingReason) return null;
    let kind;
    if (!current.offered) kind = 'application';
    else if (!current.longOffered && now - current.since >= 2700000 && ['code', 'documents'].includes(sample.app)) kind = 'long-focus';
    else kind = 'company';
    let key = `${kind}:${sample.app}`;
    if (this.topics.has(key) && now - this.topics.get(key) < 1800000) {
      kind = 'company'; key = `company:${sample.app}`;
    }
    // A background app that just opened can be the topic instead of plain company.
    const opened = kind === 'company' ? this.newBackground.find(kind => !(this.topics.has(`background:${kind}`) &&
      now - this.topics.get(`background:${kind}`) < 1800000)) : undefined;
    if (opened) { kind = 'background'; key = `background:${opened}`; }
    this.waitingReason = 'ready';
    const [category, application] = ambientApps[sample.app];
    return { kind, category, application, minutes: Math.floor((now - current.since) / 60000),
      background: (this.background ?? []).map(kind => backgroundApps[kind]),
      openedInBackground: opened ? backgroundApps[opened] : null, openedKind: opened ?? null,
      sampledAt: now, revision: this.revision, expiresAt: now + 90000, key };
  }

  // The first list after start or a settings change is the baseline, so only apps opened later count as new.
  trackBackground(kinds) {
    if (this.background !== null) {
      this.newBackground = [...this.newBackground.filter(kind => kinds.includes(kind)),
        ...kinds.filter(kind => !this.background.includes(kind) && !this.newBackground.includes(kind))];
    }
    this.background = kinds;
  }

  attempted(event) {
    const period = this.cooldown();
    this.nextAt += Math.max(1, Math.floor((this.now() - this.nextAt) / period) + 1) * period;
    if (event.kind !== 'company') this.topics.set(event.key, this.now());
    if (event.openedKind) this.newBackground = this.newBackground.filter(kind => kind !== event.openedKind);
    this.current.offered = true;
    if (event.kind === 'long-focus') this.current.longOffered = true;
    this.result = 'thinking';
    this.waitingReason = 'cooldown';
  }

  delivered() {
    this.result = 'said';
  }
}
