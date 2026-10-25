// Voice tone chosen per reply from what is being said, independent of the pet animation.
// fish: bracket cue read by Fish Audio S2 models. delivery: speaking instruction for Qwen voices.
export const VOICE_TONES = Object.freeze({
  neutral: { label: '平常', fish: null, delivery: '和熟悉的人随口聊天，轻松自然。' },
  happy: { label: '开心', fish: '[happy]', delivery: '开心、轻快，带着自然的笑意，语调有起伏。' },
  excited: { label: '兴奋', fish: '[very excited]', delivery: '很兴奋，声音明亮上扬，忍不住雀跃，语速稍快。' },
  tsundere: { label: '傲娇嘴硬', fish: '[pouty, a little embarrassed]', delivery: '轻轻嘴硬的小傲娇，有点不服气又藏不住在意，亲近、不凶。' },
  shy: { label: '害羞', fish: '[shy]', delivery: '害羞，声音放轻，有点不好意思，句尾微微含糊。' },
  clingy: { label: '撒娇', fish: '[clingy, sweet]', delivery: '撒娇，声音软一点，尾音拖一点，黏人但不做作。' },
  gentle: { label: '温柔', fish: '[gentle, soft tone]', delivery: '温柔、亲近，语速稍缓，句尾柔和。' },
  caring: { label: '关心', fish: '[caring, warm]', delivery: '关心对方，温暖、轻声，带一点担心，不说教。' },
  comforting: { label: '安慰', fish: '[soothing, soft tone]', delivery: '轻声安慰，慢一点、稳一点，让人安心。' },
  aggrieved: { label: '委屈', fish: '[aggrieved, a little sad]', delivery: '有点委屈，声音小一点，带点小抱怨，不哭闹。' },
  sad: { label: '难过', fish: '[sad]', delivery: '难过、低落，语速放慢，声音轻。' },
  annoyed: { label: '小脾气', fish: '[annoyed, pouty]', delivery: '闹一点小脾气，鼓着腮帮子不满，但不凶不吵。' },
  angry: { label: '生气', fish: '[angry]', delivery: '真的有点生气，语气加重、短促，但不大喊。' },
  smug: { label: '得意', fish: '[smug]', delivery: '小得意，尾音上扬，有点臭屁。' },
  proud: { label: '自豪', fish: '[proud]', delivery: '自豪、有底气，开心地挺起胸膛。' },
  surprised: { label: '惊讶', fish: '[surprised]', delivery: '吃了一惊，开头短促上扬。' },
  curious: { label: '好奇', fish: '[curious]', delivery: '好奇，语调上扬，想知道更多。' },
  serious: { label: '认真', fish: '[calm, serious]', delivery: '认真、沉着，咬字清楚，节奏稳当。' },
  thoughtful: { label: '思考', fish: '[thoughtful]', delivery: '边想边说，稍慢，带一点停顿。' },
  sleepy: { label: '犯困', fish: '[sleepy]', delivery: '困倦，慢吞吞，声音软软的，像快睡着。' },
  hungry: { label: '嘴馋', fish: '[eager, hungry]', delivery: '一提到吃的就来劲，带点馋。' },
  relieved: { label: '松口气', fish: '[relieved, sighing]', delivery: '松了一口气，放松下来。' },
  playful: { label: '调皮', fish: '[playful, teasing]', delivery: '调皮、逗人，带着一点坏笑。' },
  jealous: { label: '吃醋', fish: '[jealous, pouty]', delivery: '有点吃醋，酸酸的，故作不在意。' },
  sheepish: { label: '心虚', fish: '[sheepish, apologetic]', delivery: '心虚、不好意思，声音弱下去，像做错事被抓到。' }
});

export const TONE_IDS = Object.freeze(Object.keys(VOICE_TONES));
export const TONE_GUIDE = `tone 按这句话当下的情绪选：${TONE_IDS.map(id => `${id}（${VOICE_TONES[id].label}）`).join('、')}。` +
  'tone_end 只在最后一句情绪明显转折时填（比如前面嘴硬 tsundere、最后一句害羞 shy），否则省略。';

export const validTone = tone => typeof tone === 'string' && Object.hasOwn(VOICE_TONES, tone) ? tone : null;

// The part a turn in tone applies to: the last sentence, when there is more than one.
function splitLast(text) {
  const sentences = text.match(/[^。！？!?…~～]+[。！？!?…~～]*/gu) ?? [text];
  if (sentences.length < 2) return [text, ''];
  const last = sentences.pop();
  return [sentences.join(''), last];
}

export function fishToneText(text, tone, toneEnd) {
  const start = VOICE_TONES[validTone(tone)]?.fish, end = VOICE_TONES[validTone(toneEnd)]?.fish;
  const [head, last] = end && end !== start ? splitLast(text) : [text, ''];
  return [start ? `${start} ${head}` : head, last && `${end} ${last}`].filter(Boolean).join(' ');
}

export function toneDelivery(tone, toneEnd) {
  const start = VOICE_TONES[validTone(tone) ?? 'neutral'], end = VOICE_TONES[validTone(toneEnd)];
  return `请用年轻女声说话：${start.delivery}${end && end !== start ? `最后一句转为：${end.delivery}` : ''}自然说话，不要播报腔，不夸张。`;
}
