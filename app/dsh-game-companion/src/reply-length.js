// How long her direct chat replies run, chosen in the panel. Proactive company and game lines keep their own limits.
export const REPLY_LENGTHS = {
  short: { chat: '通常1～2句、10～60字，最多100字', speech: '一两句话，最多80字', max: 100, speechMax: 80 },
  medium: { chat: '通常2～3句、30～120字，最多180字', speech: '两三句话，最多150字', max: 180, speechMax: 150 },
  long: { chat: '通常3～5句、80～200字，最多300字', speech: '三到五句话，最多240字', max: 300, speechMax: 240 }
};

export function cleanReplyLength(value) {
  return Object.hasOwn(REPLY_LENGTHS, value) ? value : 'medium';
}
