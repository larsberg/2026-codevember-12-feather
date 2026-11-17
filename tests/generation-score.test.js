import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerationScore } from '../src/generation-score.js';
import { defaultSetup,validateSetup } from '../src/settings.js';

test('silent Strudel arrivals survive exact boundaries and pause without duplicates',()=>{
  const settings=defaultSetup();settings.audio.enabled=false;
  const score=new GenerationScore(settings.cadence,settings.audio.tempo),events=[];
  for(let frame=0;frame<60*36;frame++)events.push(...score.advance(1/60).events);
  assert.deepEqual(events.map(e=>e.cycle),[6,12,18]);
  const before=score.cycle;
  for(let frame=0;frame<100;frame++)assert.deepEqual(score.advance(0).events,[]);
  assert.equal(score.cycle,before);
  assert.equal(score.advance(.01).events.length,0,'resuming does not replay the preceding boundary');
  score.reset();assert.equal(score.cycle,0);assert.equal(score.advance(12).events.length,1);
  assert.equal(score.advance(0).events.length,0);
});

test('tempo changes retain Strudel phase and patterned rests change the arrival cadence',()=>{
  const score=new GenerationScore({bars:6,rhythm:'x'},120);
  score.advance(6);assert.equal(score.cycle,3);
  score.configure({bars:6,rhythm:'x'},60);
  assert.equal(score.advance(11.9).events.length,0);
  assert.deepEqual(score.advance(.2).events.map(e=>e.cycle),[6]);
  const staggered=new GenerationScore({bars:8,rhythm:'x.x.'},120);
  assert.deepEqual(staggered.advance(32).events.map(e=>e.cycle),[4,8,12,16]);
});

test('saved cadence retains custom old intervals, tempo, audio and studio edits',()=>{
  const old=defaultSetup();old.version=4;delete old.cadence;old.feather.cycle=20;
  old.audio.tempo=96;old.audio.enabled=false;old.camera.yaw=77;
  const next=validateSetup(old);
  assert.deepEqual(next.cadence,{bars:8,rhythm:'x'});
  assert.equal(next.cadence.bars*240/next.audio.tempo,20);
  assert.equal(next.audio.enabled,false);assert.equal(next.camera.yaw,77);
  old.feather.cycle=36;assert.deepEqual(validateSetup(old).cadence,{bars:6,rhythm:'x'});
  next.cadence={bars:4,rhythm:'x..x'};assert.deepEqual(validateSetup(next),next);
  assert.throws(()=>validateSetup({...next,cadence:{bars:0,rhythm:'x'}}));
  assert.throws(()=>validateSetup({...next,cadence:{bars:4,rhythm:'....'}}));
});
