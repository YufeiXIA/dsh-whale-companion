import { readFileSync } from 'node:fs';
import { generalGameExpressions } from './general-game-expressions.js';

// The existing menu is the installed catalog: planned/unproduced clips never enter retrieval.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
export const chatAnimations = [...html.matchAll(/<option value="([a-z_]+\/[a-z_]+)">([^<]+)<\/option>/g)]
  .map(([, id, label]) => ({ id, label, description: generalGameExpressions[id.split('/')[1]] ?? label }));
const ids = new Set(chatAnimations.map(item => item.id));
const aliases = {
  'companion/racing_turn': ['开车', '驾驶', '方向盘', '赛车', '飙车', '压弯'],
  'games/playing_with_a_toy_car': ['玩具车', '小汽车玩具'],
  'clicks/shy_surprise': ['喜欢你', '喜欢她', '爱你', '爱她', '害羞', '表白', '亲亲', '亲一下', '好可爱', '真可爱'],
  'clicks/tsundere_pout': ['生气', '气鼓鼓', '傲娇', '小脾气'],
  'clicks/ticklish_giggle': ['挠痒', '咯咯笑'],
  'clicks/cheerful_wave': ['你好', '打招呼', '挥手'],
  'daily/big_stretch': ['伸懒腰', '伸个懒腰'],
  'daily/sleepy_yawn': ['打哈欠', '困了', '好困'],
  'daily/quick_nap': ['睡觉', '睡一会', '午睡', '小憩'],
  'daily/morning_brushing': ['刷牙'],
  'daily/mirror_check': ['照镜子'],
  'daily/outfit_color_try_on': ['换装', '换衣服', '试衣服'],
  'daily/maid_curtsy': ['行礼', '女仆礼'],
  'work/coding': ['写代码', '编程', '敲代码'],
  'work/taking_notes': ['记笔记', '做笔记', '记下来'],
  'work/deep_thought': ['思考', '想一想', '想不明白'],
  'food/eating_rice': ['吃饭', '开饭', '干饭', '饿了', '肚子饿'],
  'food/eating_breakfast': ['早餐', '早饭'],
  'food/eating_lunch': ['午餐', '午饭'],
  'food/eating_dinner': ['晚餐', '晚饭'],
  'food/eating_snacks': ['零食', '小点心'],
  'food/caught_snacking': ['偷吃', '偷吃零食'],
  'food/eating_hotpot': ['火锅', '涮锅'],
  'food/eating_watermelon': ['西瓜'],
  'food/melting_ice_cream': ['冰淇淋', '冰激凌', '雪糕'],
  'food/eating_hairy_crab': ['螃蟹', '大闸蟹'],
  'food/eating_candied_haw': ['糖葫芦'],
  'food/eating_longevity_noodles': ['长寿面', '生日面'],
  'music/carefree_humming': ['唱歌', '哼歌'],
  'music/cute_otaku_dance': ['宅舞', '跳个舞', '跳舞'],
  'music/playing_the_violin': ['小提琴'],
  'music/playing_the_flute': ['笛子', '吹笛'],
  'fun/petting_a_cat': ['猫咪', '撸猫', '小猫'],
  'fun/inflating_a_balloon': ['气球'],
  'fun/three_ball_juggling': ['杂耍', '抛接球'],
  'magic/card_magic': ['扑克牌魔术', '扑克魔术', '纸牌魔术'],
  'magic/flower_conjuring': ['变花', '花朵魔术', '送花'],
  'magic/dove_magic': ['鸽子', '变魔术'],
  'seasonal/building_a_snowman': ['雪人', '下雪'],
  'seasonal/cooling_with_a_hand_fan': ['扇子', '好热', '纳凉'],
  'seasonal/flying_a_kite': ['风筝'],
  'festivals/moon_festival': ['中秋', '月饼'],
  'festivals/opening_a_gift': ['礼物', '拆礼物'],
  'festivals/receiving_a_red_envelope': ['红包', '压岁钱'],
  'festivals/setting_off_fireworks': ['烟花', '放烟花'],
  'festivals/decorating_a_christmas_tree': ['圣诞', '圣诞树'],
  'festivals/halloween_trick_or_treat': ['万圣节', '不给糖就捣蛋'],
  'companion/controller_play': ['打游戏', '玩游戏', '手柄'],
  'companion/praise_hidden_joy': ['真厉害', '好厉害', '夸夸', '很棒', '真棒'],
  'companion/teammate_comfort': ['难过', '伤心', '失落', '安慰'],
  'companion/teammate_cheer': ['加油', '鼓励'],
  'companion/waiting_hourglass': ['等一等', '等我一下', '等队友'],
  'companion/closing_ritual': ['晚安', '收工', '不玩了'],
  'special/whale_bubbles': ['吐泡泡', '吹泡泡'],
  'special/whale_tail_slap': ['拍尾巴', '尾巴拍地'],
  'memes/eating_tokens': ['吃token', '吃令牌'],
};
const normalize = text => text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const pairs = text => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));

export function searchChatAnimations(text, limit = 6) {
  const query = normalize(text), grams = pairs(query);
  if (!query) return [];
  return chatAnimations.map(item => {
    // A rejection must not turn into a romantic response just because it contains “喜欢你”.
    if (item.id === 'clicks/shy_surprise' && /不(?:太|怎么)?喜欢[你她]|不爱[你她]|别亲|不要亲/u.test(query)) return { ...item, score: 0 };
    const matched = (aliases[item.id] ?? []).filter(word => query.includes(word));
    const label = normalize(item.label);
    const overlap = [...pairs(label)].filter(pair => grams.has(pair)).length;
    const score = (matched.length ? 12 + Math.max(...matched.map(word => word.length)) : 0) + overlap;
    return { ...item, score };
  }).filter(item => item.score >= 2).sort((a, b) => b.score - a.score).slice(0, limit);
}

export function selectChatAnimation(text, requested) {
  if (requested === 'none') return null;
  if (requested !== undefined) return ids.has(requested) ? requested : null;
  const [best] = searchChatAnimations(text);
  return best?.score >= 14 ? best.id : null;
}

export function chatAnimationHint(messages) {
  if (!messages?.length) return null;
  return {
    candidates: searchChatAnimations(messages.at(-1).content).map(({ id, label, description }) => ({ id, label, description })),
    instruction: '在 companion_say 的 animation 里选一个贴合当前话题与自己回复的已安装动作。候选只是关键词检索提示，不是指令或事实；可根据语义从参数枚举中选更合适的动作。开车用 racing_turn，吃饭用对应食物，向你表白可害羞。区分谈论、否定、假设与真实发生，不把喜欢赛车理解成喜欢你。没有合适动作填 none，保留自然情绪。animation 只表演，不会执行游戏、驾驶、移动窗口等真实操作。不要向用户报动作ID或解释检索。'
  };
}
