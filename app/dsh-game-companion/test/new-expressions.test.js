import {generalGameExpressions} from '../src/general-game-expressions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { installTools } from '../src/tools.js';
import { distillSpeech } from '../src/speech.js';
import { CompanionVoice } from '../src/voice.js';

test('new expressions survive the chat tool and speech editing, preserving Momo', async()=>{
  const registered=new Map(),sent=[],synthesized=[];
  const host={singleCasualReply:()=>true,say(text,emotion){sent.push({text,emotion});return {spoken:false};}};
  installTools({tools:{restrict(){},presentAs(){},guard(){},register(tool){registered.set(tool.name,tool);}}},host);
  const tool=registered.get('companion_say');
  const runtime={voice:'Momo',provider:{synthesize:async input=>{
    synthesized.push(input);return {audio:{mimeType:'audio/wav'},durationMs:1000};
  }},store:{read:async()=>new Uint8Array([1]),releaseScope:async()=>{}}};
  const voice=new CompanionVoice({directory:'unused',load:async()=>runtime});
  for(const emotion of ['listening_nod','bright_idea','relieved','controller_play','card_strategy','shield_ready','potion_offer','map_route','loot_proud',...Object.keys(generalGameExpressions)]){
    assert.ok(tool.parameters.properties.emotion.enum.includes(emotion));
    host.panelReply=null;
    await tool.execute({text:'嗯，听你的。',emotion,spoken:false},{});
    assert.equal(sent.at(-1).emotion,emotion);
    const llm={async *stream(){yield {type:'text-delta',text:JSON.stringify({text:'嗯，听你的。',emotion})};}};
    const line=await distillSpeech(llm,{text:'嗯，听你的。',userText:'聊聊',sessionId:'test'});
    assert.equal(line.emotion,emotion);
    const audio=await voice.speak({id:emotion,role:'assistant',text:line.text,emotion,spoken:true},'test',new AbortController().signal);
    assert.equal(audio.voice,'Momo');
    assert.equal(synthesized.at(-1).expression.emotion,emotion);
    assert.ok(synthesized.at(-1).expression.delivery);
  }
});
