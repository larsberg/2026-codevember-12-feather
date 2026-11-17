import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createGlamourMaterial, GLAMOUR_FINISHES } from '../src/glamour-material.js';
import { defaultSetup, validateSetup } from '../src/settings.js';

const digest = texture => createHash('sha256').update(texture.image.data).digest('hex');

test('generated finish families reproduce seeded paint but never share material or texture objects',()=>{
  const signatures=new Set();
  for(let generation=0;generation<GLAMOUR_FINISHES.length;generation++){
    const seed=732234+generation*104729,a=createGlamourMaterial(seed,generation,7.2),b=createGlamourMaterial(seed,generation,7.2);
    try{
      assert.ok(a.material.isMeshPhysicalMaterial);
      assert.ok(a.material.clearcoat>0&&a.material.iridescence>0);
      assert.notEqual(a.material,b.material);assert.notEqual(a.material.uuid,b.material.uuid);
      assert.deepEqual(a.recipe,b.recipe);
      a.textures.forEach((texture,i)=>{assert.notEqual(texture,b.textures[i]);assert.equal(digest(texture),digest(b.textures[i]));});
      signatures.add(digest(a.textures[0]));
      assert.ok(new Set(a.textures[0].image.data).size>70,'the finish contains a colored texture, not a flat swatch');
      assert.ok(new Set(a.textures[1].image.data).size>70,'film thickness and surface response vary across the skin');
    }finally{a.dispose();b.dispose();}
  }
  assert.equal(signatures.size,GLAMOUR_FINISHES.length);
  const a=createGlamourMaterial(732234,0,7.2),b=createGlamourMaterial(836963,0,7.2);
  try{assert.notEqual(digest(a.textures[0]),digest(b.textures[0]),'different seeds also vary within one finish family');}finally{a.dispose();b.dispose();}
});

test('existing skin controls edit a generated finish without reallocating its paint',()=>{
  const finish=createGlamourMaterial(732234,0,7.2),values=defaultSetup().materials.panels;
  try{
    finish.configure(values);const coat=finish.material.clearcoatRoughness,material=finish.material,textures=[...finish.textures],paint=finish.textures.map(digest);
    finish.configure({...values,color:'#c8b6ff',roughness:.8,metalness:.42,opacity:.65});
    assert.equal(finish.material,material);assert.equal(material.color.getHexString(),'c8b6ff');
    assert.equal(material.roughness,.8);assert.equal(material.metalness,.42);assert.equal(material.opacity,.65);
    assert.ok(material.clearcoatRoughness>coat,'roughness also softens the top coat');
    finish.textures.forEach((texture,i)=>{assert.equal(texture,textures[i]);assert.equal(digest(texture),paint[i]);});
    finish.configure(values);assert.equal(material.clearcoatRoughness,coat);
  }finally{finish.dispose();}
});

test('old gray skin migrates to a neutral tint while custom material edits survive',()=>{
  const old=defaultSetup();old.version=6;old.materials.panels.color='#48565c';old.materials.panels.roughness=.81;
  const next=validateSetup(old);assert.equal(next.materials.panels.color,'#ffffff');assert.equal(next.materials.panels.roughness,.81);
  assert.equal(old.materials.panels.color,'#48565c');assert.deepEqual(validateSetup(next),next);
  old.materials.panels.color='#2a77d4';assert.equal(validateSetup(old).materials.panels.color,'#2a77d4');
});
