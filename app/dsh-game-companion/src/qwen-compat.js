// These two saved Instruct model IDs returned Model not exist on this account.
// Keep the pet's Momo HTTP pipeline, using the verified available Flash model.
export function gameVoiceModel(model) {
  return ['qwen3-tts-instruct-flash', 'qwen3-tts-instruct-flash-2026-01-26'].includes(model)
    ? 'qwen3-tts-flash' : model;
}

export function gameVoiceTransport(transport, normalizeAudio) {
  return {
    request(config, scope, operation, body, ...rest) {
      const model = gameVoiceModel(config.model);
      if (model === config.model) return transport.request(config, scope, operation, body, ...rest);
      // Plain Flash uses the same endpoint/voice but has no instruction controls.
      const { instructions, optimize_instructions, ...input } = body.input;
      return transport.request({ ...config, model }, scope, operation, { ...body, input }, ...rest);
    },
    async downloadAudio(...args) {
      const bytes = await transport.downloadAudio(...args);
      // Reuse the pet's exact sentinel-header repair; malformed WAVs still fail.
      const normalized = normalizeAudio(bytes);
      if (normalized !== bytes) bytes.fill(0);
      return normalized;
    }
  };
}
