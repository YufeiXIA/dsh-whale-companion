import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
const create=runInNewContext(html.slice(html.indexOf('function createVideoPlayer('),html.indexOf('function createPetAnimator('))+';createVideoPlayer');
function layer(){
  const classes=new Set(),properties={};
  return {id:'pet',src:'old',duration:10,currentTime:0,properties,plays:0,pauses:0,
    classList:{add(...names){names.forEach(n=>classes.add(n));},remove(n){classes.delete(n);},contains(n){return classes.has(n);}},
    style:{setProperty(k,v){properties[k]=v;}},
    cloneNode(){return layer();},removeAttribute(){},after(other){this.other=other;},
    play:async function(){this.plays++;},pause(){this.pauses++;},load(){this.currentTime=0;}
  };
}
test('old picture remains until the incoming clip is decoded; stale loads cannot replace it',async()=>{
  const first=layer(),player=create(first),back=first.other;let ready=0;
  player.start('/whale-pet/magic/card_magic.webm',false,()=>ready++);
  assert.equal(first.classList.contains('pet-front'),true);assert.equal(back.classList.contains('pet-front'),false);
  const stale=back.onloadeddata;
  player.start('/whale-pet/work/deep_thought.webm',false,()=>ready++);
  stale();assert.equal(first.id,'pet');assert.equal(ready,0);
  back.onloadeddata();await Promise.resolve();
  assert.equal(back.id,'pet');assert.equal(first.id,'pet-buffer');assert.equal(ready,1);
  assert.equal(back.properties['--clip-facing'],'1');
  player.start('/whale-pet/work/deep_thought.webm',false,()=>ready++);
  first.onloadeddata();await Promise.resolve();assert.equal(first.id,'pet');assert.equal(ready,2);
});
test('old end event does not finish a newer action; ball waits for its seek before showing',async()=>{
  const first=layer(),player=create(first),back=first.other;let ended=0,ready=0;
  player.onended=()=>ended++;
  player.start('/whale-pet/magic/card_magic.webm',false);back.onloadeddata();await Promise.resolve();
  const oldEnd=back.onended;
  player.start('/whale-pet/drag/turn_into_ball.webm',false,()=>ready++,2);
  first.onloadeddata();assert.equal(first.currentTime,2);assert.equal(back.id,'pet');
  oldEnd();assert.equal(ended,0);
  first.onseeked();await Promise.resolve();assert.equal(first.id,'pet');assert.equal(ready,1);
  first.onended();assert.equal(ended,1);
});
