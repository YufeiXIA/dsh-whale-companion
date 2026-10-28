import test from 'node:test';
import assert from 'node:assert/strict';
import { wantsTextOnly, distillSpeech } from '../src/speech.js';

test('explicit silence is respected without mistaking a discussion of silence for a command', () => {
  for (const content of ['只用文字解释', '请安静一下。', '别再说话', '不要语音']) {
    assert.equal(wantsTextOnly([{ content }]), true);
  }
  for (const content of ['不要太安静，陪我聊聊', '什么时候你会安静下来？', '保持暂停，和我商量一下']) {
    assert.equal(wantsTextOnly([{ content }]), false);
  }
});

test('speech editing bounds its input and rejects an overlong output', async () => {
  let request;
  const llm = { stream: async function* (options) {
    request = options;
    yield { type: 'text-delta', text: JSON.stringify({ text: '长'.repeat(151), emotion: 'neutral' }) };
  } };
  assert.equal(await distillSpeech(llm, { text: '报'.repeat(10000), userText: '问'.repeat(2000),
    provider: 'official', model: 'model', sessionId: 'test', signal: new AbortController().signal }), null);
  const payload = JSON.parse(request.messages[1].content[0].text);
  assert.equal(payload.reply.length, 4000);
  assert.equal(payload.user.length, 1000);
  assert.equal(request.tools, undefined);
  assert.equal(request.reasoningEffort, 'off');
});

test('tiny reactions retain shared context and emotion; malformed emotional output is rejected', async () => {
  let request;
  let output = { text: '欸？', emotion: 'shy_surprise' };
  const llm = { stream: async function* (options) { request = options; yield { type: 'text-delta', text: JSON.stringify(output) }; } };
  const args = { text: '欸？', userText: '给你留了夜宵', context: { recently_spoken: ['刚才有点饿'] }, situation: '桌面闲聊' };
  assert.deepEqual(await distillSpeech(llm, args), output);
  const payload = JSON.parse(request.messages[1].content[0].text);
  assert.deepEqual(payload.context, args.context);
  assert.match(request.messages[0].content[0].text, /鲸鱼娘/);
  output = { text: '鲸'.repeat(100), emotion: 'neutral' };
  assert.deepEqual(await distillSpeech(llm, args), output, 'The new 100-character speech limit is accepted');
  output = { text: '欸？', emotion: 'unsupported' };
  assert.equal(await distillSpeech(llm, args), null);
});

test('speech editing selects from the complete semantic catalog, independently of voice tone',async()=>{
  let request,output={text:'那我给你拉一小段。',emotion:'listening_nod',tone:'gentle',animation:'music/playing_the_violin'};
  const llm={stream:async function*(options){request=options;yield {type:'text-delta',text:JSON.stringify(output)};}};
  const args={text:'可以，给你拉一小段。',userText:'想听琴弦唱歌，不用开口的那种'};
  assert.equal((await distillSpeech(llm,args)).animation,'music/playing_the_violin');
  const payload=JSON.parse(request.messages[1].content[0].text);
  assert.equal(payload.animation.catalog.length,164);
  assert.ok(payload.animation.catalog.every(item=>item.id&&item.meaning));
  output={...output,animation:'none'};
  assert.equal((await distillSpeech(llm,{...args,userText:'不要拉小提琴'})).animation,'none');
  output={...output,animation:'../../missing'};
  assert.equal((await distillSpeech(llm,args)).animation,undefined);
});
