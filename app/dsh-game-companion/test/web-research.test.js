import test from 'node:test';
import assert from 'node:assert/strict';
import { installTools } from '../src/tools.js';
import { publicSource, researchSources, publicTopic, ambientSearchQueries } from '../src/web-research.js';

test('only actual successful web results become plain http sources', () => {
  assert.equal(publicSource({url:'javascript:alert(1)'}),null);
  assert.equal(publicSource({url:'file:///private'}),null);
  assert.equal(publicSource({url:'https://secret@example.org/'}),null);
  const source={url:'https://example.org/',title:'<script>untrusted</script>'};
  assert.deepEqual(researchSources({name:'web_search'},{isError:false,value:{sources:[source]}}),[source]);
  assert.deepEqual(researchSources({name:'web_search'},{isError:true,value:{sources:[source]}}),[]);
  assert.deepEqual(researchSources({name:'web_fetch'},{isError:false,value:{url:source.url,statusCode:403}}),[]);
  assert.deepEqual(researchSources({name:'web_fetch'},{isError:false,value:{url:source.url,statusCode:200}}),[{url:source.url,title:'example.org'}]);
});

test('web tools work during user chat even in Stardew, stay off for ambient, cancel and autonomous play', () => {
  let guard,result;
  const host={game:'stardew',replyingToUser:true,webSources:[],webCalls:0,scheduler:{active:{}},ambientTurn:false,ambient:{valid:()=>false},replyRequest:{environment:{}}};
  installTools({on(_name,fn){result=fn;},tools:{restrict(filter){assert.deepEqual(filter.allow,['web_search','web_fetch']);},presentAs(){},guard(fn){guard=fn;},register(){}}},host);
  for(let i=0;i<5;i++)assert.equal(guard({name:'web_search'}),undefined);
  assert.match(guard({name:'web_fetch'}),/limit/);
  assert.ok(guard({name:'shell'}));
  host.webCalls=0;host.ambientTurn=true;assert.ok(guard({name:'web_search'}));
  host.ambientTurn=false;host.replyingToUser=false;assert.ok(guard({name:'web_fetch'}));
  host.replyingToUser=true;host.scheduler.active.canceled=true;assert.ok(guard({name:'web_search'}));
  const found={isError:false,value:{sources:[{url:'https://example.org/',title:'Example'}]}};
  result({name:'web_search'},found);assert.equal(host.webSources.length,0);
  host.scheduler.active.canceled=false;
  result({name:'web_search'},found);result({name:'web_search'},found);assert.equal(host.webSources.length,1);
  result({name:'web_search',signal:AbortSignal.abort()}, {isError:false,value:{sources:[{url:'https://other.example/'}]}});
  assert.equal(host.webSources.length,1);
});

test('ambient queries come only from a bounded public topic or a fixed game name, never the summary',()=>{
  const topic={category:'game',topic:'星露谷物语',public:true};
  const event={application:'浏览器',visual:{capturedAt:Date.now(),searchTopic:topic,summary:'PRIVATE CHAT email@example.org and a secret'}};
  assert.deepEqual(ambientSearchQueries(event),['星露谷物语 趣闻','星露谷物语 入门建议']);
  assert.equal(JSON.stringify(ambientSearchQueries(event)).includes('PRIVATE'),false);
  for(const invalid of [{...topic,public:false},{...topic,category:'document'},{...topic,topic:'email@example.org'},{...topic,topic:'C:/private/file'},{...topic,topic:'账号 123456789'},{...topic,topic:'api key secret'}])assert.equal(publicTopic(invalid),null);
  event.visual.capturedAt=Date.now()-180001;assert.deepEqual(ambientSearchQueries(event),[]);
  assert.deepEqual(ambientSearchQueries({application:'文档工具'}),[]);
  assert.deepEqual(ambientSearchQueries({application:'星露谷物语'}),['星露谷物语 趣闻','星露谷物语 入门建议']);
});

test('ambient guard allows one exact prepared search and one returned URL, with cancellation and expiry',()=>{
  let guard,result,current=true;
  const host={game:'stardew',replyingToUser:false,webSources:[],webCalls:0,scheduler:{active:{}},ambientTurn:true,
    ambient:{valid:()=>current},replyRequest:{environment:{application:'星露谷物语'}}};
  installTools({on(_name,fn){result=fn;},tools:{restrict(){},presentAs(){},guard(fn){guard=fn;},register(){}}},host);
  for(const queries of [['星露谷物语 我的私聊'],['星露谷物语 趣闻','私人内容'],['我住在哪里']])assert.ok(guard({name:'web_search',arguments:{queries}}));
  assert.equal(host.webCalls,0);
  assert.equal(guard({name:'web_search',arguments:{queries:['星露谷物语 趣闻']}}),undefined);
  assert.ok(guard({name:'web_search',arguments:{queries:['星露谷物语 趣闻']}}));
  assert.ok(guard({name:'web_fetch',arguments:{url:'https://example.org/?private=secret'}}));
  result({name:'web_search'},{isError:false,value:{sources:[{url:'https://example.org/',title:'Public result'}]}});
  assert.equal(guard({name:'web_fetch',arguments:{url:'https://example.org/'}}),undefined);
  assert.ok(guard({name:'web_fetch',arguments:{url:'https://example.org/'}}));
  current=false;
  result({name:'web_search'},{isError:false,value:{sources:[{url:'https://stale.example/'}]}});
  assert.equal(host.webSources.length,1);assert.ok(guard({name:'companion_say'}));
  host.scheduler.active.canceled=true;assert.ok(guard({name:'web_search',arguments:{queries:['星露谷物语 趣闻']}}));
});
