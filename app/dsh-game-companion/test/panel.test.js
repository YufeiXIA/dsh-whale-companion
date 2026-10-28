import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('continuous play shows counts without a countdown and offers recovery only for a record failure',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('  const budget=state.budget;'),html.indexOf("  $('bind').textContent="));
  const elements=new Map();
  const render=budget=>{
    const context={state:{bindingConfirmed:true,budget},s:{paused:true,active:false},needsReconciliation:false,
      $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);}};
    runInNewContext(source,context);
  };
  render({continuous:true,startedAt:1,deadlineAt:null,requestCount:125,limitReason:null});
  assert.match(elements.get('budget').textContent,/持续陪玩.*125/);
  assert.doesNotMatch(elements.get('budget').textContent,/剩余|\/100|30 分钟/);
  assert.equal(elements.get('new-trial').hidden,true);
  assert.equal(elements.get('resume').disabled,false);
  render({continuous:true,startedAt:1,requestCount:125,limitReason:'budget-persistence-error'});
  assert.equal(elements.get('resume').disabled,true);
  assert.equal(elements.get('new-trial').hidden,false);
  assert.equal(elements.get('new-trial').disabled,false);
  assert.equal(elements.get('new-trial').textContent,'重试调用记录');
});

test('selecting and decoding a point run cannot be canceled by the hover input',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const motion=html.slice(html.indexOf('let petMoving='),html.indexOf('// The carrier is inside'));
  const hover=html.slice(html.indexOf('function quickNear('),html.indexOf("window.addEventListener('companion-pet-near'"));
  const listeners=new Map();let openings=0;
  const context={sleeping:false,state:{scheduler:{paused:true}},document:{body:{classList:{contains:()=>true}}},
    window:{addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)},
    CustomEvent:class{constructor(type,options={}){this.type=type;Object.assign(this,options);}},
    hideQuickChat(){},setPanel(){},showBubble(){},setTimeout(fn){fn();},clearTimeout(){},quickTimer:null,
    showQuickChat(){openings++;},petAnimator:{pointRun:()=>true,cancelPoint(){},fling(){},settle(){},finishPoint(){}}};
  runInNewContext(motion+'\n'+hover,context);
  const emit=(type,detail)=>context.window.dispatchEvent(new context.CustomEvent(type,{detail}));
  emit('companion-pick-point');emit('companion-roam',false);context.quickNear(true);
  assert.equal(openings,0,'hover must stay suppressed while the picker is opening');
  emit('companion-point-run');emit('companion-roam',false);context.quickNear(true);
  assert.equal(openings,0,'hover must stay suppressed before the run video has decoded');
  emit('companion-point-selection-cancel');context.quickNear(true);
  assert.equal(openings,1,'canceling the picker restores ordinary hover chat');
  emit('companion-pick-point');emit('companion-point-stop');emit('companion-point-motion','cancel');context.quickNear(true);
  assert.equal(openings,1,'canceling the old route must not expose hover while choosing a new destination');
});

test('ambient status distinguishes waiting, focus, quiet time and fixed cadence',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('function ambientStatusText('),html.indexOf('function render(value)'));
  const context={};runInNewContext(source,context);
  const status={enabled:true,waitingReason:'cooldown',quietUntil:300000};
  assert.match(context.ambientStatusText(status,true,false,0),/5 分钟/);
  assert.match(context.ambientStatusText({...status,waitingReason:'companion'},true,false,0),/切回其他应用/);
  assert.match(context.ambientStatusText({...status,intervalMinutes:5},true,false,0),/固定每 5 分钟/);
  assert.doesNotMatch(context.ambientStatusText({...status,unanswered:3},true,false,0),/放慢|已加/);
  assert.match(context.ambientStatusText(status,true,true,0,true),/全屏自动隐藏/);
  assert.match(context.ambientStatusText(status,true,true,0),/免打扰/);
  assert.match(context.ambientStatusText(status,false,false,0),/合作游戏/);
  assert.match(context.ambientStatusText({...status,enabled:false},true,false,0),/已关闭/);
  assert.match(html,/id="ambient-status"/);assert.match(html,/id="vision-status"/);
});

test('panel only voices fresh selected lines, skips busy/old lines and stops on user input', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = () => {const classes=new Set(),listeners=new Map();return ({ options:[], style:{setProperty(){}}, classList: {
    add(name){classes.add(name);},remove(name){classes.delete(name);},contains:name=>classes.has(name),
    toggle(name,force){if(force??!classes.has(name))classes.add(name);else classes.delete(name);} }, value: '0.8',
    focus(){context.document.activeElement=this;this.onfocus?.();},blur(){context.document.activeElement=null;this.onblur?.();},
    addEventListener(name,handler){listeners.set(name,handler);},dispatchEvent(event){listeners.get(event.type)?.(event);},
    replaceChildren() {}, append() {}, setAttribute() {}, removeAttribute() {}, scrollHeight:36,getBoundingClientRect:()=>({height:54}),
    cloneNode: () => element(), before() {}, after() {}, load() {}, pause() {}, play: async () => {} });};
  const baseline = { sessionId: 'original-chat', scheduler: { paused: true }, messages: [
    { id: 'history', role: 'assistant', text: '这句已经说过了。', spoken: true, at: Date.now() }
  ], chatDelivery: [] };
  let currentState = baseline;
  const requests = [], players = [], controls=[], interactionReports=[], activitySignals=[];
  let completeAudio;
  const preferences = new Map();
  const timers = new Map(); let timerId=0, now=Date.now();
  class Clock extends Date { static now(){return now;} }
  const context = { localStorage: { getItem: key => preferences.get(key), setItem: (key, value) => preferences.set(key, value) }, document: { documentElement: { hasAttribute: () => false }, body: element(), createElement: element,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => element() },
    window: { addEventListener() {}, dispatchEvent(event) {if(event.type==='companion-activity')activitySignals.push({at:now,enabled:event.detail});} }, CustomEvent:class { constructor(type,options){this.type=type;Object.assign(this,options);} },
    EventSource:class {},
    setTimeout(fn,ms) { timers.set(++timerId,{fn,ms,at:now+ms});return timerId; }, clearTimeout(id) { timers.delete(id); }, AbortController, Date:Clock,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Audio: class { constructor() { players.push(this); } async play() { this.played = true; } pause() { this.paused = true; } },
    fetch: async (path, options) => {
      if(path==='/game-companion/control'){const body=JSON.parse(options.body);controls.push(body.action);if(body.action==='interaction-state')interactionReports.push(body);}
      if (path === '/game-companion/voice') {
        requests.push(options);
        return new Promise(resolve => { completeAudio = () => resolve({ ok: true, blob: async () => ({}) }); });
      }
      return { ok: true, json: async () => currentState };
    }
  };
  runInNewContext(script + '\nglobalThis.panel = { render, stopVoice, control, showBubble, speak, quickNear, hideQuickChat, reportInteraction, bubbleTimer:()=>bubbleTimer, enable() { voiceEnabled=true; }, disable() { voiceEnabled=false; } };', context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  // A quiet SSE connection sends no changed snapshots. The native overlay still
  // needs a renderer heartbeat within 20 s throughout the 45 s settling period.
  const settleStart=now;
  context.panel.render({...baseline,ambient:{enabled:true}});
  while(now<settleStart+60000){
    now+=1000;
    for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
    assert.ok(now-activitySignals.at(-1).at<=20000,'quiet SSE must not expire the native activity heartbeat');
    assert.equal(activitySignals.at(-1).enabled,true);
  }
  now=settleStart;
  context.panel.render(baseline);
  context.document.body.classList.add('compact');
  context.panel.quickNear(true);
  [...timers.values()].find(timer=>timer.ms===140).fn();
  assert.equal(context.document.body.classList.contains('quick-chat-open'),true);
  const quick=elements.get('quick-message'),quickForm=elements.get('quick-chat');
  quick.focus();context.panel.quickNear(false);
  assert.equal(context.document.body.classList.contains('quick-chat-open'),true);
  quick.value='鲸鱼在吗';quick.dispatchEvent({type:'compositionstart'});
  const noChat=controls.filter(action=>action==='chat').length;
  await quickForm.onsubmit({preventDefault(){}});assert.equal(controls.filter(action=>action==='chat').length,noChat);
  quick.dispatchEvent({type:'compositionend'});await quickForm.onsubmit({preventDefault(){}});
  assert.equal(controls.findLast(action=>action!=='interaction-state'),'chat');assert.equal(quick.value,'');
  assert.equal(context.document.body.classList.contains('compact'),true);
  assert.equal(context.document.body.classList.contains('quick-chat-open'),false);
  assert.equal(preferences.get('companion-pet-size'),'100');
  elements.get('pet-size').value='145';elements.get('pet-size').oninput();
  assert.equal(preferences.get('companion-pet-size'),'145');
  assert.equal(elements.get('pet-size-value').textContent,'145%');
  assert.equal(elements.get('bubble-text')?.textContent, undefined, 'Old messages must not create an arrival bubble');
  context.panel.enable();
  const messages = [...baseline.messages];
  const add = (id, spoken, at = Date.now()) => {
    messages.push({ id, role: 'assistant', text: '这张挑得不错嘛。', spoken, at });
    currentState = { ...baseline, messages: [...messages] };
    context.panel.render(currentState);
  };
  add('ordinary', false);
  assert.equal(elements.get('bubble-text').textContent, '这张挑得不错嘛。', 'New text replies also get a temporary bubble');
  assert.equal(requests.length, 0, 'enabling speech must not replay history or ordinary replies');
  add('selected', true);
  assert.equal(requests.length, 1);
  add('during-synthesis', true);
  assert.equal(requests.length, 1);
  completeAudio(); await flush();
  assert.equal(players[0].played, true);
  add('during-playback', true);
  assert.equal(requests.length, 1);
  await context.panel.control('chat', { text: '听我说' });
  assert.equal(players[0].paused, true);
  assert.equal(requests[0].signal.aborted, true);
  context.panel.render(currentState);
  add('too-late', true, Date.now() - 16000);
  assert.equal(requests.length, 1, 'missed lines are not queued or replayed');
  context.panel.disable();
  elements.get('preview-voice').onclick();
  assert.equal(requests.length, 2, 'explicit preview works without enabling automatic speech');
  assert.deepEqual(JSON.parse(requests[1].body), { preview: true, voiceId: 'longhua' });
  completeAudio(); await flush();
  assert.equal(players[1].played, true);
  players[1].onended();
  assert.equal(players[1].paused, true);
  elements.get('voice').onclick();
  assert.equal(preferences.get('companion-voice'), 'on');
  elements.get('voice').onclick();
  assert.equal(preferences.get('companion-voice'), 'off');
  context.panel.render({...baseline,bindingConfirmed:true,observation:{guard:{requires_reconciliation:true,pending_action_id:'uncertain-potion'}}});
  assert.equal(elements.get('resume').disabled, true, 'Unconfirmed game action must not look ready to resume');
  assert.match(elements.get('error').textContent, /还没确认生效/);
  assert.match(elements.get('debug-error').textContent, /uncertain-potion/);
  context.panel.render({...baseline,bindingConfirmed:true,observation:{guard:{requires_reconciliation:false}}});
  assert.equal(elements.get('resume').disabled, false, 'Settled state restores normal resume availability');
  elements.get('desktop-play').onclick();await flush();
  assert.equal(controls.at(-1),'pause','Desktop mode must pause game control before enabling');
  assert.equal(elements.get('desktop-play').textContent,'停止桌面陪伴');
  elements.get('desktop-mode').value='natural';elements.get('free-roam').checked=true;
  elements.get('free-roam').onchange();
  const wandering=elements.get('random-roam'),stroll=elements.get('stroll');
  assert.equal(wandering.checked,true,'preserve existing roaming behavior by default');
  wandering.checked=false;wandering.onchange();
  assert.equal(preferences.get('companion-random-roam'),'false');
  assert.equal(wandering.disabled,false);
  stroll.checked=true;stroll.onchange();assert.equal(wandering.disabled,true,'taskbar mode owns routes independently');
  stroll.checked=false;stroll.onchange();assert.equal(wandering.disabled,false);assert.equal(wandering.checked,false);
  elements.get('desktop-mode').value='showcase';elements.get('desktop-mode').onchange();assert.equal(wandering.disabled,true);
  elements.get('desktop-mode').value='natural';elements.get('desktop-mode').onchange();
  context.panel.render({...baseline,error:'provider unavailable',scheduler:{paused:true,faulted:true}});
  assert.notEqual(elements.get('error').textContent,'','Desktop mode must not hide chat failures');
  context.panel.render({...baseline,error:'TRANSPORT_ERROR'});
  assert.equal(elements.get('error').textContent,'','An absent game is normal during desktop chat');
  await elements.get('resume').onclick();
  assert.equal(controls.at(-1),'resume');
  assert.equal(elements.get('desktop-play').textContent,'开始桌面陪伴','Continuing the game exits desktop mode');
  context.panel.showBubble('短句','short');
  assert.equal(timers.get(context.panel.bubbleTimer()).ms,12000);
  context.panel.showBubble('鲸'.repeat(100),'long');
  assert.equal(timers.get(context.panel.bubbleTimer()).ms,30000);
  assert.equal(elements.get('bubble-text').textContent.length,100,'Longer speech is not truncated at the old 80-character limit');
  context.panel.showBubble('鲸'.repeat(240),'ambient-long',240);
  assert.equal(elements.get('bubble-text').textContent.length,240);
  assert.equal(elements.get('speech-bubble').classList.contains('long'),true);
  assert.equal(timers.get(context.panel.bubbleTimer()).ms,66400);
  context.panel.showBubble('鲸'.repeat(100),'long');
  context.panel.enable();
  const speaking=context.panel.speak({id:'long',at:now});
  assert.equal(timers.has(context.panel.bubbleTimer()),false,'Bubble must stay while speech is being prepared');
  const beforeSlow=players.length;
  now+=17000;
  completeAudio();await speaking;
  assert.equal(players.length,beforeSlow+1,'Fresh speech must still play after synthesis takes over 15 seconds');
  assert.equal(players.at(-1).played,true);
  now+=40000;
  players.at(-1).onended();
  assert.equal(timers.get(context.panel.bubbleTimer()).ms,4000,'Speech ending leaves at least four more seconds to read');
  context.panel.showBubble('旧句','old');
  const oldSpeech=context.panel.speak({id:'old',at:now});completeAudio();await oldSpeech;
  context.panel.showBubble('新句','new');
  const newTimer=context.panel.bubbleTimer();
  context.panel.stopVoice();
  assert.equal(context.panel.bubbleTimer(),newTimer,'Stopping older audio must not retime the newer bubble');
  const voiceCount=requests.length;
  currentState={...baseline,sessionId:'new-chat',messages:[],conversations:[
    {sessionId:'new-chat',title:'新对话'},{sessionId:'original-chat',title:'之前的聊天'}]};
  await elements.get('new-conversation').onclick();
  assert.equal(controls.at(-1),'new-conversation');
  assert.equal(elements.get('conversation-list').value,'new-chat');
  assert.equal(elements.get('chat').value,'','Switching chat clears the old draft');
  assert.equal(timers.has(context.panel.bubbleTimer()),false,'Switching hides the old speech bubble');
  currentState={...baseline,messages:[{id:'old-voice',role:'assistant',text:'历史语音不重播。',spoken:true,at:now}]};
  elements.get('conversation-list').value='original-chat';
  await elements.get('conversation-list').onchange();
  assert.equal(controls.at(-1),'switch-conversation');
  assert.equal(requests.length,voiceCount,'Opening recent history must not replay its voice');
  context.panel.render({...currentState,conversationBusy:true});
  assert.equal(elements.get('new-conversation').disabled,true);
  assert.equal(elements.get('conversation-list').disabled,true);
  const voicePreference=preferences.get('companion-voice');
  for(const preset of ['gentle','happy','tsundere','serious']){
    elements.get('preview-'+preset).onclick();
    assert.deepEqual(JSON.parse(requests.at(-1).body),{emotionPreview:preset,voiceId:'longhua'});
    now+=20000;
    completeAudio();await flush();
    assert.equal(players.at(-1).played,true,'Explicit audition remains playable after a slow synthesis');
    players.at(-1).onended();
  }
  assert.equal(preferences.get('companion-voice'),voicePreference,'Emotional audition does not change the default voice preference');
  assert.equal(preferences.get('companion-voice-choice'),undefined,'new option must not change the default');
  elements.get('voice-choice').value='momo';elements.get('voice-choice').onchange();
  assert.equal(preferences.get('companion-voice-choice'),'momo');
  assert.equal(elements.get('emotion-previews').hidden,true);
  elements.get('preview-voice').onclick();
  assert.equal(JSON.parse(requests.at(-1).body).voiceId,'momo');
  elements.get('voice-choice').value='longhua';elements.get('voice-choice').onchange();
  assert.equal(elements.get('emotion-previews').hidden,false);
  assert.equal(preferences.get('companion-voice-choice'),'longhua');
  context.panel.enable();context.panel.stopVoice();now+=20000;
  const ambient={id:'interrupt-me',role:'assistant',text:'截图里的旧话题',spoken:true,ambient:true,at:now};
  currentState={...baseline,messages:[...baseline.messages,ambient]};context.panel.render(currentState);
  now+=18000;
  completeAudio();await flush();const interruptedPlayer=players.at(-1);assert.equal(interruptedPlayer.played,true);
  quick.focus();quick.dispatchEvent({type:'beforeinput'});
  assert.equal(interruptedPlayer.paused,true,'typing stops proactive audio immediately');
  assert.equal(interactionReports.at(-1).typing,true);assert.equal(interactionReports.at(-1).interruptedId,'interrupt-me');
  const count=requests.length;
  const late={...ambient,id:'late-ambient',text:'迟到的主动内容',at:now};currentState={...baseline,messages:[...baseline.messages,ambient,late]};context.panel.render(currentState);
  assert.equal(requests.length,count,'a proactive line arriving while typing cannot start synthesis');
  assert.equal(elements.get('bubble-text').textContent,ambient.text,'late proactive output cannot overwrite the current bubble');
  assert.equal(interactionReports.at(-1).interruptedId,'late-ambient');
  quick.value='';quick.blur();
  const direct={id:'direct-answer',role:'assistant',text:'先回答你',spoken:true,at:now};
  currentState={...baseline,messages:[...baseline.messages,ambient,late,direct]};context.panel.render(currentState);
  completeAudio();await flush();context.panel.reportInteraction();
  assert.equal(interactionReports.at(-1).speaking,true);
  assert.equal(interactionReports.at(-1).seenReplyId,'direct-answer');
  players.at(-1).onended();context.panel.reportInteraction();assert.equal(interactionReports.at(-1).speaking,false);
  const canceledSpeech=context.panel.speak({...ambient,id:'slow-interrupted',at:now});
  const playersBeforeCancel=players.length;
  quick.focus();quick.dispatchEvent({type:'beforeinput'});
  assert.equal(requests.at(-1).signal.aborted,true);
  now+=20000;completeAudio();await canceledSpeech;
  assert.equal(players.length,playersBeforeCancel,'Interrupted slow synthesis must never start audio when it finally returns');
  quick.value='';quick.blur();
  const roamSetting=preferences.get('companion-free-roam'),randomSetting=preferences.get('companion-random-roam');
  await elements.get('sleep-mode').onclick();
  assert.equal(preferences.get('companion-sleep'),'true');assert.equal(elements.get('sleep-mode').textContent,'叫醒小鲸');
  assert.equal(activitySignals.at(-1).enabled,false,'sleep pauses desktop observation without changing the saved setting');
  assert.equal(elements.get('free-roam').disabled,true);assert.equal(elements.get('stroll').disabled,true);
  const requestsBeforeSleep=requests.length;
  await context.panel.speak({...ambient,id:'sleep-voice',at:now});
  await context.panel.speak({...direct,id:'sleep-answer',at:now});
  assert.equal(requests.length,requestsBeforeSleep,'sleep keeps both proactive and direct speech silent');
  await elements.get('sleep-mode').onclick();
  assert.equal(preferences.get('companion-sleep'),'false');assert.equal(elements.get('sleep-mode').textContent,'睡眠模式');
  assert.equal(preferences.get('companion-free-roam'),roamSetting);assert.equal(preferences.get('companion-random-roam'),randomSetting);
});
