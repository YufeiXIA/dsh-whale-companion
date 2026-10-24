export const COMPANION_VOICE = 'longhua_v3.1';
export const COMPANION_VOICE_MODEL = 'qwen-audio-3.1-tts-flash';
export const COMPANION_VOICE_ENDPOINT = 'https://ws-b4g9scafmw6zsv08.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer';

// Same verified system voice and HTTP request used for the accepted audition.
export class PresetVoiceProvider {
  constructor(config, store, transport, { normalizeAudio, inspectWav }) {
    this.config = config;
    this.store = store;
    this.transport = transport;
    this.normalizeAudio = normalizeAudio;
    this.inspectWav = inspectWav;
  }

  async synthesize(input, signal) {
    signal.throwIfAborted();
    const scope = { ...input.scope };
    const result = await this.transport.request(this.config, scope, 'tts', { input: {
      text: input.text, voice: this.config.voice, instruction: input.expression.delivery,
      format: 'wav', sample_rate: 24000
    } }, signal);
    if (result.output?.finish_reason !== 'stop') throw new Error('Voice synthesis incomplete');
    const bytes = this.normalizeAudio(await this.transport.downloadAudio(this.config.audioUrl(result.output.audio.url), signal));
    const wav = this.inspectWav(bytes);
    if (wav.sampleRate !== 24000 || wav.channels !== 1) throw new Error('Unexpected voice audio format');
    signal.throwIfAborted();
    const audio = await this.store.put(scope, bytes, 'audio/wav');
    return { scope, audio, expression: input.expression, durationMs: wav.durationMs, synchronization: 'amplitude' };
  }
}
