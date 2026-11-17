import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { FEATHER_TYPES } from '../src/plumage-layout.js';
import { createFeatherGeometry, featherColliders, featherWidth } from '../src/feather-geometry.js';
import { createAttachmentSampler } from '../src/surface-attachments.js';

test('six vane types have distinct solid outlines and finite matching contact geometry',()=>{
  const outlines=new Set();
  for(const [type,morph]of Object.entries(FEATHER_TYPES)){
    const profile={...morph,p1:new Vector3(0,1.5,.5),p2:new Vector3(.3,4,1.2),p3:new Vector3(0,6,1.8),twist:.3,camber:.2,scallopCount:7,
      paint:{pattern:2,phase:.4,strength:1,accentHue:.3}};
    outlines.add(JSON.stringify(Array.from({length:19},(_,i)=>featherWidth((i+1)/20,1,profile))));
    assert.equal(featherWidth(0,1,profile),0);assert.ok(featherWidth(1,1,profile)<1e-6);
    assert.ok(featherWidth(.5,1,profile)>.45,`${type} retains a filled vane`);
    const {vane}=createFeatherGeometry(6,.7,.55,0,profile);
    try{
      for(const attribute of Object.values(vane.attributes))assert.ok([...attribute.array].every(Number.isFinite),`${type} produces finite geometry`);
      assert.equal(vane.attributes.featherPaint.count,vane.attributes.position.count);
      assert.equal(vane.attributes.featherAccent.count,vane.attributes.position.count);
      const normals=vane.attributes.normal;
      for(let i=0;i<normals.count;i++)assert.ok(Math.abs(new Vector3().fromBufferAttribute(normals,i).length()-1)<1e-5);
      const colliders=featherColliders(6,.7,profile,1);
      assert.equal(colliders.length,3,'new outlines retain the existing three contacts per vane');
      assert.ok(colliders.every(c=>c.points.every(p=>p.toArray().every(Number.isFinite))));
    }finally{vane.dispose();}
  }
  assert.equal(outlines.size,6);
  assert.ok(featherWidth(.85,1,FEATHER_TYPES.paddle)>featherWidth(.85,1,FEATHER_TYPES.lance)*1.5,'paddles broaden toward the tip while lances taper');
});

test('a folding skin triangle keeps its follicle orientation continuous and its position exact',()=>{
  const positions=new Float32Array([0,0,0,1,0,0,0,0,-1]);
  const sample=createAttachmentSampler(positions,new Matrix4()),attachment={ids:[0,1,2],barycentric:new Vector3(.2,.3,.5)};
  const initial=sample(attachment).rotation.clone();
  for(const z of [-.1,0,.1,1]){
    positions[8]=z;const result=sample(attachment);
    assert.ok(result.rotation.angleTo(initial)<1e-6,'no half-turn when the triangle changes winding');
    assert.ok(result.position.distanceTo(new Vector3(.3,0,positions[8]*.5))<1e-7);
    assert.ok(Math.abs(result.normal.length()-1)<1e-6);
  }
});
