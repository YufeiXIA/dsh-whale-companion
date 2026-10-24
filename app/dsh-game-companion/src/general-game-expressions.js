import {personalityExpressions,naturalPersonalityExpressions} from './personality-expressions.js';

// Reusable game reactions describe the conversation, never prove a game result.
export const generalGameExpressions = {
  victory_smug: '已确认赢了，轻轻得意',
  victory_trophy: '已确认获胜，捧小奖杯开心',
  victory_fistpump: '已确认配合成功，握拳庆祝',
  victory_mvp: '已确认表现出色，展示搭子勋章',
  defeat_slump: '已确认输了，有些沮丧',
  defeat_rage: '已确认输了，向游戏发一点可爱的小脾气；不责怪或辱骂用户',
  defeat_retry: '已确认失利后重振旗鼓，想再来一次',
  mistake_awkward: '确实犯错后有些尴尬，坦率认错',
  combo_focus: '专注、流畅地操作；不能据此宣称打出了真实连招',
  clutch_save: '已确认极限救场或脱险，终于松口气',
  keyboard_burst: '谈到键鼠操作，专心敲键',
  rhythm_tap: '谈到节奏或音游，跟着打拍子',
  precision_aim: '认真商量瞄准和细调操作，不宣称已经命中',
  racing_turn: '谈到赛车或转向操作，专注压弯',
  teammate_cheer: '给朋友加油，不表示已经获胜',
  teammate_highfive: '已确认配合成功，邀请朋友击掌',
  teammate_praise: '认可朋友已发生的好操作，给你点赞',
  teammate_comfort: '朋友失落或输了，陪着缓一缓',
  waiting_hourglass: '耐心等匹配、等队友或等事情有变化',
  loading_bored: '等待加载有点无聊，不重复催促',
  low_battery: '用户提到或已观测到低电量才提醒，不虚构设备状态',
  new_record: '已确认刷新纪录，开心展示小彩带',
  loot_choice: '商量奖励和物品选择，不表示已经获得或使用',
  ready_go: '朋友准备开始，确认准备好了，不擅自恢复游戏控制',
  ...personalityExpressions
};

export const naturalGameExpressions = ['combo_focus', 'keyboard_burst', 'rhythm_tap',
  'racing_turn', 'waiting_hourglass', 'loading_bored',...naturalPersonalityExpressions];
export const generalGameGuide = Object.entries(generalGameExpressions)
  .map(([name, meaning]) => `${name}（${meaning}）`).join('、');
