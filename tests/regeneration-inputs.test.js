import test from 'node:test';
import assert from 'node:assert/strict';
import { bindRegenerationInputs } from '../src/regeneration-inputs.js';

function target() {
  const handlers = new Map();
  return { hasFocus:()=>true, addEventListener:(name,handler)=>handlers.set(name,handler),
    removeEventListener:name=>handlers.delete(name),
    emit(name,props={}) { const e={target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...props};handlers.get(name)?.(e);return e; } };
}
test('Space regenerates once per press without stealing text and control activation',()=>{
  const canvas=target(),keyboard=target();let birds=0;
  const dispose=bindRegenerationInputs(canvas,()=>birds++,keyboard);
  assert.equal(keyboard.emit('keydown',{code:'Space'}).defaultPrevented,true);
  keyboard.emit('keydown',{code:'Space',repeat:true});assert.equal(birds,1);
  for(const props of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{target:{closest:()=>({})}},{defaultPrevented:true}])
    keyboard.emit('keydown',{code:'Space',...props});
  keyboard.emit('keydown',{code:'KeyP'});assert.equal(birds,1);
  keyboard.hasFocus=()=>false;keyboard.emit('keydown',{code:'Space'});assert.equal(birds,1);
  dispose();keyboard.hasFocus=()=>true;keyboard.emit('keydown',{code:'Space'});assert.equal(birds,1);
});
test('only a primary click or tap regenerates, never a drag, pinch or canceled gesture',()=>{
  const canvas=target();let birds=0;const dispose=bindRegenerationInputs(canvas,()=>birds++,target());
  const pointer=(name,props={})=>canvas.emit(name,{pointerId:1,button:0,isPrimary:true,clientX:20,clientY:30,...props});
  pointer('pointerdown');pointer('pointerup');assert.equal(birds,1);
  pointer('pointerdown');pointer('pointermove',{clientX:40});pointer('pointermove');pointer('pointerup');assert.equal(birds,1,'dragging back to the start is still a drag');
  pointer('pointerdown');pointer('pointerdown',{pointerId:2,isPrimary:false});pointer('pointerup',{pointerId:2,isPrimary:false});pointer('pointerup');assert.equal(birds,1);
  pointer('pointerdown',{button:2});pointer('pointerup',{button:2});assert.equal(birds,1);
  pointer('pointerdown');pointer('pointercancel');pointer('pointerup');assert.equal(birds,1);
  pointer('pointerdown',{pointerType:'touch'});pointer('pointerup',{pointerType:'touch',clientX:23});assert.equal(birds,2);
  dispose();pointer('pointerdown');pointer('pointerup');assert.equal(birds,2);
});
