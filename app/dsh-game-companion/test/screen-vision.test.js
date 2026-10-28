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

test('screen understanding separates public search topics and fails closed for private or uncertain output',async()=>{
  const topic={category:'game',topic:'星露谷物语',public:true};
  for(const [content,expected] of [
    [{summary:'公开游戏画面',sensitive:false,searchTopic:topic},topic],
    [{summary:'模糊画面',sensitive:false},null],
    [{summary:'普通界面',sensitive:false,searchTopic:{...topic,topic:'me@example.org'}},null],
    [{summary:'私人聊天',sensitive:true,searchTopic:topic},null]
  ]){
    const result=await describeScreen(Buffer.from([255,216,255,217]),{key:'test',fetchApi:async(_url,options)=>{
      assert.match(JSON.parse(options.body).messages[0].content,/混合画面也必须searchTopic=null/);
      return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(content)}}]})};
    }});
    assert.deepEqual(result?.searchTopic??null,expected);
  }
});

test('explicit uploads use the question and retain more detail without changing automatic screenshot privacy rules',async()=>{
  let body;
  const image=Buffer.from([255,216,255,217]);
  const options={key:'test',fetchApi:async(url,request)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');body=JSON.parse(request.body);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({summary:'图'.repeat(1800),sensitive:false})}}]})};
  }};
  const manual=await describeScreen(image,{...options,manual:true,question:'比较这两个形状'});
  assert.equal(manual.summary.length,1600);assert.match(body.messages[1].content[0].text,/比较这两个形状/);
  assert.match(body.messages[0].content,/主动上传/);assert.match(body.messages[0].content,/不执行/);
  const automatic=await describeScreen(image,options);
  assert.equal(automatic.summary.length,500);assert.match(body.messages[0].content,/私人聊天/);
});
