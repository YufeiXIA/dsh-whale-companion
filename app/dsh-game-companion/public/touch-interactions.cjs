(function(root){
  const regions={
    head:{label:'头顶',animation:'companion/praise_hidden_joy',delivery:'被朋友轻轻摸头，很舒服、安心。声音柔软放松，语速稍慢，轻轻带笑；后半句有一点藏不住的开心。自然说话，不夸张，不呻吟。',lines:[
      '嗯……这样摸头，好像有点舒服。再一小会儿就好。',
      '唔，刚才还想说什么来着……算啦，先这样待一会儿。',
      '我才没有往你手心蹭。只是……你摸得挺好的。']},
    ear:{label:'耳朵',animation:'clicks/shy_surprise',delivery:'耳朵突然被碰到，敏感怕痒。开头短促地轻轻一惊，语调略上扬，接着害羞地笑一下，后半句放轻、带一点嘴硬。亲近自然，不尖叫，不耳语，不呻吟。',lines:[
      '欸！耳朵那里很痒啦……你先让我缓一下。',
      '呜，怎么偏偏碰这里。耳朵都要躲起来了。',
      '轻、轻一点啦。才不是害羞，是耳朵自己热起来的。']},
    cheek:{label:'脸颊',animation:'clicks/shy_surprise',delivery:'被朋友戳脸，先有一点意外，然后轻轻害羞、嘴硬地抱怨。语调活泼但柔和，不生气，不播报。',lines:[
      '欸，别戳脸啦，刚才想说什么都忘了。',
      '软、软也不能一直戳呀。我也是有脾气的。',
      '脸上没有饭粒吧？你帮我看看，别笑。']},
    hand:{label:'手边',animation:'clicks/cheerful_wave',delivery:'和熟悉的朋友碰手、击掌，亲近、轻快，带自然笑意。像随口聊天，不夸张。',lines:[
      '手给你一下。就一下，待会儿还要拿手柄呢。',
      '碰到啦。要击掌吗？这次我会跟上你的。',
      '我在这儿呢。想叫我陪你做什么？']},
    belly:{label:'肚子和围裙',animation:'clicks/ticklish_giggle',delivery:'被轻轻戳得有点痒，忍不住轻笑，带一点俏皮的抗议。轻快、自然，有笑意，不大喊，不呻吟。',lines:[
      '呜，有点痒！刚吃饱的鲸鱼不能随便戳。',
      '这里装的是白饭，不是按钮。按了也不会再掉一碗。',
      '围裙里没有藏零食……好吧，还有最后一颗。']},
    tail:{label:'尾巴边',animation:'special/whale_tail_slap',delivery:'敏感怕痒的尾巴突然被碰到，开头轻轻一惊，接着忍着笑躲一下。后半句带一点嘴硬的娇憨抗议，节奏有短暂停顿。自然、轻声，不尖叫，不呻吟。',lines:[
      '哇，尾巴！这里很怕痒的，你偷袭本鲸。',
      '欸嘿……别、别碰那边啦。尾巴要自己甩起来了。',
      '我没躲，是尾巴先躲的。你轻一点，我就不跑。']},
    feet:{label:'脚部',animation:'clicks/ticklish_giggle',delivery:'脚边被轻轻碰到，有点痒，惊讶地缩脚后轻笑，像朋友间的小玩闹。俏皮、轻快、略微嘴硬，不生气，不呻吟。',lines:[
      '欸，脚边痒痒的！我差点站不稳啦。',
      '鞋带没有松吧？你突然碰一下，我还以为踩到小虫子了。',
      '脚收起来了。不许偷挠，鲸鱼也是会怕痒的。']}
  };
  function regionAt(x,y){
    if(y>0.86&&x>0.28&&x<0.72)return 'feet';
    if(y>0.74&&(x<0.3||x>0.7))return 'tail';
    if(y>=0.18&&y<0.48&&(x<0.22||x>0.78))return 'ear';
    if(y<0.28)return 'head';
    if(y<0.5)return 'cheek';
    if(y>0.8)return 'tail';
    if(x<0.28||x>0.72)return 'hand';
    return 'belly';
  }
  function choose(region,previous,random=Math.random){
    const count=regions[region].lines.length;
    const choices=Array.from({length:count},(_,index)=>index).filter(index=>index!==previous);
    return choices[Math.floor(random()*choices.length)];
  }
  const api={regions,regionAt,choose,audioVersion:2};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CompanionTouches=api;
})(globalThis);
