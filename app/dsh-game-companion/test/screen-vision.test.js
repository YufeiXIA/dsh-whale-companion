import test from 'node:test';
import assert from 'node:assert/strict';
import { describeScreen } from '../src/screen-vision.js';

test('vision uses approved official destination, one inline image and a bounded fact summary',async()=>{
  let request;
  const result=await describeScreen(Buffer.from([255,216,255,217]),{key:'test-key',fetchApi:async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');
    request=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'桌上有一个蓝色手柄。',sensitive:false})}}],usage:{total_tokens:100}})};
  }});
  assert.equal(request.model,'deepseek-flash');
  assert.equal(request.messages[1].content[1].type,'image_url');
  assert.equal(result.summary,'桌上有一个蓝色手柄。');
  assert.equal(JSON.stringify(result).includes('base64'),false);
  await assert.rejects(()=>describeScreen(Buffer.from('not an image'),{key:'test-key'}),/INVALID_JPEG/);
});

test('sensitive or malformed summaries never become observed facts',async()=>{
  for(const content of [{summary:'private',sensitive:true},{summary:'not verified'},{summary:4,sensitive:false}]){
    const result=await describeScreen(Buffer.from([255,216,255,217]),{key:'test-key',fetchApi:async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(content)}}]})})});
    assert.equal(result,null);
  }
});
