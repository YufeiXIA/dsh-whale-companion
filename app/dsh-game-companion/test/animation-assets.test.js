import test from 'node:test';
import assert from 'node:assert/strict';
import { serveAnimation } from '../src/animation-assets.js';

test('video byte ranges allow full reads, seeking, suffix cues and reject invalid ranges',()=>{
  const bytes=Buffer.from('0123456789');
  function response(range){
    const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body?.toString();}};
    serveAnimation({headers:range?{range}:{}},res,bytes);return res;
  }
  assert.equal(response().body,'0123456789');
  for(const [range,body] of [['bytes=2-5','2345'],['bytes=7-','789'],['bytes=-3','789'],['bytes=8-99','89']]){
    const res=response(range);assert.equal(res.status,206);assert.equal(res.body,body);
    assert.equal(res.headers['content-length'],body.length);
  }
  for(const range of ['bytes=10-','bytes=5-2','bytes=-0','bytes=-','bytes=0-1,3-4','invalid']){
    assert.equal(response(range).status,416);
  }
});
