import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('ambient status distinguishes waiting, focus, quiet time and slower unanswered company',async()=>{
  const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
  const source=html.slice(html.indexOf('function ambientStatusText('),html.indexOf('function render(value)'));
  const context={};runInNewContext(source,context);
  const status={enabled:true,waitingReason:'cooldown',quietUntil:300000};
  assert.match(context.ambientStatusText(status,true,false,0),/5 分钟/);
  assert.match(context.ambientStatusText({...status,waitingReason:'companion'},true,false,0),/切回其他应用/);
  assert.match(context.ambientStatusText({...status,unanswered:2},true,false,0),/放慢/);
  assert.match(context.ambientStatusText({...status,unanswered:3},true,false,0),/已加 15 分钟/);
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
    replaceChildren() {}, append() {}, setAttribute() {}, removeAttribute() {},
    cloneNode: () => element(), after() {}, load() {}, pause() {}, play: async () => {} });};
  const baseline = { sessionId: 'original-chat', scheduler: { paused: true }, messages: [
    { id: 'history', role: 'assistant', text: '这句已经说过了。', spoken: true, at: Date.now() }
  ], chatDelivery: [] };
  let currentState = baseline;
  const requests = [], players = [], controls=[];
  let completeAudio;
  const preferences = new Map();
  const timers = new Map(); let timerId=0, now=Date.now();
  class Clock extends Date { static now(){return now;} }
  const context = { localStorage: { getItem: key => preferences.get(key), setItem: (key, value) => preferences.set(key, value) }, document: { body: element(), documentElement: { hasAttribute: () => false }, createElement: element,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelector: () => element() },
    window: { addEventListener() {}, dispatchEvent() {} }, CustomEvent:class { constructor(type,options){this.type=type;Object.assign(this,options);} },
    setTimeout(fn,ms) { timers.set(++timerId,{fn,ms});return timerId; }, clearTimeout(id) { timers.delete(id); }, AbortController, Date:Clock,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Audio: class { constructor() { players.push(this); } async play() { this.played = true; } pause() { this.paused = true; } },
    fetch: async (path, options) => {
      if(path==='/game-companion/control')controls.push(JSON.parse(options.body).action);
      if (path === '/game-companion/voice') {
        requests.push(options);
        return new Promise(resolve => { completeAudio = () => resolve({ ok: true, blob: async () => ({}) }); });
      }
      return { ok: true, json: async () => currentState };
    }
  };
  runInNewContext(script + '\nglobalThis.panel = { render, stopVoice, control, showBubble, speak, quickNear, hideQuickChat, bubbleTimer:()=>bubbleTimer, enable() { voiceEnabled=true; }, disable() { voiceEnabled=false; } };', context);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  context.document.body.classList.add('compact');
  context.panel.quickNear(true);
  [...timers.values()].find(timer=>timer.ms===140).fn();
  assert.equal(context.document.body.classList.contains('quick-chat-open'),true);
  const quick=elements.get('quick-message'),quickForm=elements.get('quick-chat');
  quick.focus();context.panel.quickNear(false);
  assert.equal(context.document.body.classList.contains('quick-chat-open'),true);
  quick.value='鲸鱼在吗';quick.dispatchEvent({type:'compositionstart'});
  const noChat=controls.length;
  await quickForm.onsubmit({preventDefault(){}});assert.equal(controls.length,noChat);
  quick.dispatchEvent({type:'compositionend'});await quickForm.onsubmit({preventDefault(){}});
  assert.equal(controls.at(-1),'chat');assert.equal(quick.value,'');
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
  completeAudio();await speaking;
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
});
