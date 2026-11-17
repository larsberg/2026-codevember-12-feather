import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3,Quaternion,Scene,Vector3 } from 'three';
import signatures from './fixtures/caustic-mesh-signatures.json' with {type:'json'};
import { defaultSetup,validateSetup } from '../src/settings.js';
import { initPhysics,FeatherSimulation } from '../src/feather-simulation.js';
import { createCreatureMesh } from '../src/creature-mesh.js';
import { createFeatherView } from '../src/feather-view.js';
import { featherScoreEvents } from '../src/feather-score.js';
import { libraryPalettes } from '../src/palette-library.js';
import { createPlumageLayout, PLUMAGE_STYLES } from '../src/plumage-layout.js';
import { MIRROR, mirrorColliders } from '../src/dressing-room.js';
await initPhysics();

test('live CSG generation reproduces all three actual Caustic polygon meshes',()=>{
  const settings=defaultSetup();
  for(const reference of signatures.cases){
    const generated=createCreatureMesh(settings,reference.seed);
    try{
      const vertices=generated.topology.vertices.map(v=>v.map(x=>Math.round(x*1e8)));
      const hash=createHash('sha256').update(JSON.stringify({vertices,faces:generated.topology.faces})).digest('hex');
      assert.equal(vertices.length,reference.vertices);assert.equal(generated.topology.faces.length,reference.polygons);assert.equal(hash,reference.sha256);
      assert.equal(generated.source.boxes.length,5);
    }finally{generated.geometry.dispose();}
  }
});

test('a full-sized five-hull body falls from above, deforms on landing, and never scales',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings),scene=new Scene(),view=createFeatherView(scene,sim);
  try{
    view.configure(settings);
    assert.equal(sim.meshRig.entries.length,5);assert.equal(sim.meshRig.joints.length,4);assert.equal(sim.surface.mesh.isSkinnedMesh,true);
    const start=sim.lowestHullPoint();assert.ok(start>=settings.mesh.dropHeight-.1);
    for(let i=0;i<15;i++){sim.update(1/60);view.update();assert.deepEqual(sim.object.scale.toArray(),[1,1,1]);}
    assert.ok(start<6,'the new arrival is close to the floor');
    assert.ok(sim.lowestHullPoint()<start-.8);assert.ok(sim.lowestHullPoint()>2.5);assert.equal(sim.landedAt,null);
    for(let i=0;i<120;i++){sim.update(1/60);view.update();assert.deepEqual(sim.object.scale.toArray(),[1,1,1]);}
    assert.ok(sim.landedAt>.35&&sim.landedAt<.8);assert.ok(Math.abs(sim.lowestHullPoint())<.2);
    assert.ok(sim.meshRig.entries.every(e=>e.body.getMass()>0));
    // The former kinematic host sphere has been removed: the only body
    // colliders are the five source-fitted convex hulls.
    assert.ok(sim.meshRig.colliders.every(c=>c&&c.points.length<=13));
  }finally{view.dispose();sim.dispose();}
});

test('plumage roots follow the actual skinned surface through impact and posing',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings),view=createFeatherView(new Scene(),sim);
  try{
    assert.equal(sim.rig.length,settings.feather.count);
    for(let frame=0;frame<14*60;frame++){
      sim.update(1/60);
      if(frame%60)continue;view.update();
      const holders=view.group.children.filter(o=>o.name==='Contact-separated plume');
      for(const [i,e]of sim.rig.entries()){
        const root=sim.sampleAttachment(e.attachment).position;
        assert.ok(root.toArray().every(Number.isFinite));
        assert.ok(holders[i].position.distanceTo(root)<1e-6);
        const rendered=new Vector3();
        e.attachment.ids.forEach((id,k)=>{const corner=sim.surface.corners.indexOf(id),vertex=sim.surface.mesh.getVertexPosition(corner,new Vector3()).applyMatrix4(sim.surface.mesh.matrixWorld);rendered.addScaledVector(vertex,e.attachment.barycentric.getComponent(k));});
        assert.ok(rendered.distanceTo(root)<2e-5,'follicle matches the rendered skinned triangle');
        assert.ok(Math.abs(e.attachment.barycentric.toArray().reduce((a,b)=>a+b,0)-1)<1e-10);
        assert.ok(new Vector3().copy(e.body.getPosition()).toArray().every(Number.isFinite));
      }
    }
    assert.ok(sim.stats.contactBegins>0);assert.ok(sim.motion.steps>6,'grounded stepping starts after landing');
    const changed=structuredClone(settings);changed.physics.mass=2;changed.physics.damping=3;sim.configure(changed);
    assert.equal(sim.meshRig.entries[0].body.getLinearDamping(),3);assert.equal(sim.rig[0].body.getLinearDamping(),3);
  }finally{view.dispose();sim.dispose();}
});

test('short-drop migration preserves a custom arrival height and studio settings',()=>{
  const saved=defaultSetup();saved.version=3;saved.mesh.dropHeight=32;saved.camera.yaw=67;saved.audio.enabled=false;
  const migrated=validateSetup(saved);
  assert.equal(migrated.mesh.dropHeight,5);assert.equal(migrated.version,defaultSetup().version);
  assert.equal(migrated.camera.yaw,67);assert.equal(migrated.audio.enabled,false);
  assert.equal(saved.mesh.dropHeight,32,'migration does not write or mutate the saved setup');
  saved.mesh.dropHeight=18;assert.equal(validateSetup(saved).mesh.dropHeight,18);
  saved.version=4;saved.mesh.dropHeight=32;assert.equal(validateSetup(saved).mesh.dropHeight,32);
});

test('complete feathers fall with the body and retain their follicles through landing',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings),view=createFeatherView(new Scene(),sim);
  try{
    view.update();assert.equal(view.diagnostics.growth,1);
    assert.equal(sim.plumageAt,0);assert.equal(sim.landedAt,null);
    const holders=view.group.children.filter(o=>o.name==='Contact-separated plume');
    for(const holder of holders){assert.ok(holder.visible);assert.deepEqual(holder.scale.toArray(),[1,1,1]);}
    const attachments=sim.rig.map(e=>e.attachment),bodies=sim.rig.map(e=>e.body),revision=sim.plumageRevision;
    const rotations=sim.rig.map(e=>new Quaternion().copy(e.body.getRotation()).normalize());
    for(let frame=0;frame<15;frame++){sim.update(1/60);view.update();for(const holder of holders)assert.deepEqual(holder.scale.toArray(),[1,1,1]);}
    const flex=sim.rig.map((e,i)=>rotations[i].angleTo(new Quaternion().copy(e.body.getRotation()).normalize()));
    assert.ok(flex.reduce((a,b)=>a+b,0)/flex.length>.01,'the complete vanes respond to falling and neighbouring contacts');
    assert.ok(flex.every(angle=>Number.isFinite(angle)&&angle<1),'the spring response stays bounded');
    assert.equal(sim.landedAt,null,'the plumage is already visible while airborne');
    for(let frame=0;frame<120;frame++){sim.update(1/60);view.update();}
    assert.ok(sim.landedAt!==null);assert.equal(sim.plumageRevision,revision);
    sim.rig.forEach((e,i)=>{assert.equal(e.attachment,attachments[i]);assert.equal(e.body,bodies[i]);});
  }finally{view.dispose();sim.dispose();}
});

test('three different bodies stand, lift individual feet quickly, hold, and turn their heads',()=>{
  for(const generation of [0,1,2]){
    const sim=new FeatherSimulation(defaultSetup(),generation);
    try{
      let lift=0,headChange=0,holdDrift=0,hold=null;
      const head=sim.motion.links.reduce((a,b)=>a.head>b.head?a:b);
      for(let frame=0;frame<10*60;frame++){
        sim.update(1/60);
        const motion=sim.motion;
        assert.ok(sim.lowestHullPoint()>-.08,'hulls stay above the floor');
        if(sim.time<2)continue;
        for(const link of motion.links)assert.ok(link.target.distanceTo(link.entry.body.getPosition())<1.6,'dynamic hulls keep up with their stance');
        if(motion.phase==='stepping'){
          hold=null;
          assert.ok(motion.stepDuration>=.15&&motion.stepDuration<=.2,'each foot moves in a quick burst');
          const link=motion.swing.link;
          lift=Math.max(lift,link.entry.body.getPosition().y-link.rest.y);
        }else if(motion.phase==='looking'&&motion.steps>0&&motion.phaseTime>.15){
          hold??={feet:motion.feet.map(l=>new Vector3().copy(l.entry.body.getPosition())),head:new Quaternion().copy(head.entry.body.getRotation()).normalize()};
          headChange=Math.max(headChange,hold.head.angleTo(new Quaternion().copy(head.entry.body.getRotation()).normalize()));
          holdDrift=Math.max(holdDrift,...motion.feet.map((l,i)=>hold.feet[i].distanceTo(l.entry.body.getPosition())));
        }
      }
      assert.ok(sim.motion.steps>=12,'the lower hulls actually reposition');
      assert.ok(lift>.15,'a swing foot visibly clears the ground');
      assert.ok(headChange>.12,'the head rotates independently during a hold');
      assert.ok(holdDrift<.12,'planted feet stay still while looking');
      assert.ok(head.entry.body.getPosition().y>head.rest.y-.4,'the upper lobe remains upright');
    }finally{sim.dispose();}
  }
});

test('regenerated Caustic meshes retain shared material, mirror and palette edits',()=>{
  const settings=defaultSetup();settings.materials.panels.roughness=.81;settings.materials.struts.metalness=.12;settings.feather.mirrorAngle=32;
  const palette=libraryPalettes(settings.paletteLibrary)[0];
  for(const generation of [0,1,2]){
    const sim=new FeatherSimulation(settings,generation),scene=new Scene(),view=createFeatherView(scene,sim);
    try{view.configure(settings,palette);sim.update(1/60);view.update();assert.equal(view.materials.panels.roughness,.81);assert.equal(view.materials.struts.metalness,.12);assert.equal(view.diagnostics.mirrorPanels,3);assert.equal(view.diagnostics.feathers,settings.feather.count);assert.deepEqual(sim.object.scale.toArray(),[1,1,1]);}
    finally{view.dispose();sim.dispose();assert.equal(scene.children.length,0);}
  }
});

test('version-one saves migrate the retired mesh defaults while preserving studio edits',()=>{
  const saved=defaultSetup();saved.version=1;saved.feather.seed=1207;saved.physics.gravity=9.8;saved.materials.panels.flatShading=false;delete saved.mesh;delete saved.pipeline;
  saved.materials.panels.roughness=.72;saved.camera.yaw=56;saved.audio.enabled=false;
  const migrated=validateSetup(saved);assert.equal(migrated.feather.seed,732234);assert.equal(migrated.physics.gravity,35.1);assert.equal(migrated.materials.panels.flatShading,true);assert.deepEqual(migrated.mesh,defaultSetup().mesh);assert.deepEqual(migrated.pipeline,defaultSetup().pipeline);
  assert.equal(migrated.materials.panels.roughness,.72);assert.equal(migrated.camera.yaw,56);assert.equal(migrated.audio.enabled,false);assert.deepEqual(validateSetup(migrated),migrated);
  saved.feather.seed=98765;saved.physics.gravity=17;const custom=validateSetup(saved);assert.equal(custom.feather.seed,98765);assert.equal(custom.physics.gravity,17);
  assert.equal(saved.version,1,'migration does not mutate or write the old save');
});

test('audio arc splits retain the onset when crossing a beat',()=>{
  const events=featherScoreEvents(.49,.51,120);assert.equal(events.length,2);assert.equal(events[1].serial,1);assert.ok(events[1].from<0);assert.ok(events[1].to>0);assert.deepEqual(featherScoreEvents(1,1,120),[]);
});

test('the swept crest converges on the upper surface before the drop',()=>{
  const sim=new FeatherSimulation(defaultSetup());
  try{
    assert.equal(sim.plumageAt,0);assert.equal(sim.landedAt,null);
    const roots=[],tips=[];
    for(const e of sim.rig){
      const root=e.root,tip=e.profile.p3.clone().applyQuaternion(e.rotation).add(root);
      assert.ok(tip.z<root.z-1,'the point trails behind the follicle');
      assert.ok(root.y>=sim.plumageBounds.min.y+sim.plumageBounds.getSize(new Vector3()).y*.48-.001,'follicles occupy the original upper surface');
      roots.push(root.x);tips.push(tip.x);
      assert.ok(e.shapes.every(shape=>shape.getFilter().categoryBits===2));
    }
    const span=values=>Math.max(...values)-Math.min(...values);
    assert.ok(span(tips)<span(roots)*.55,'the crest narrows toward its trailing point');
    for(const e of sim.meshRig.entries)for(const shape of e.shapes)assert.equal(shape.getFilter().maskBits&2,0,'feathers cannot hit overlapping internal hulls');
  }finally{sim.dispose();}
});

test('plumage families change silhouette and graduate lengths deterministically',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings);
  try{
    const follicles=sim.rig.map(e=>e.attachment),summaries=[],signatures=[];
    for(let generation=0;generation<PLUMAGE_STYLES.length;generation++){
      const make=()=>createPlumageLayout(follicles,sim.sampleAttachment,sim.plumageBounds,settings,sim.seed,generation);
      const layout=make(),tips=layout.map(e=>e.profile.p3.clone().applyQuaternion(e.rotation).add(e.sample.position));
      const signature=entries=>entries.map(e=>[e.length,e.width,...e.profile.p3.toArray(),e.hue]);
      assert.deepEqual(signature(layout),signature(make()),'the seed reproduces the same crest');
      assert.equal(layout[0].plumageStyle,PLUMAGE_STYLES[generation]);
      assert.ok(layout.every(e=>e.width>.4&&e.length>1&&e.length<18),'retain broad vanes at usable lengths');
      const lengths=layout.map(e=>e.length);
      assert.ok(Math.max(...lengths)/Math.min(...lengths)>1.3,'short coverts blend into longer feathers');
      summaries.push({x:Math.max(...tips.map(p=>p.x))-Math.min(...tips.map(p=>p.x)),y:Math.max(...tips.map(p=>p.y)),z:Math.min(...tips.map(p=>p.z)),meanX:tips.reduce((sum,p)=>sum+p.x,0)/tips.length});
      signatures.push(JSON.stringify(signature(layout)));
    }
    assert.equal(new Set(signatures).size,PLUMAGE_STYLES.length);
    assert.ok(summaries[1].x>summaries[0].x*1.5,'the graduated fan opens across the head');
    assert.ok(Math.abs(summaries[2].meanX-summaries[0].meanX)>1,'the side sweep has a different direction');
    assert.ok(summaries[3].x>summaries[0].x*2,'the split crest has separate trailing tips');
    assert.ok(summaries[4].y>summaries[0].y+1.5,'the arched fan stands taller');
    assert.ok(summaries[5].z<summaries[0].z,'the cascade trails farther back');
  }finally{sim.dispose();}
});

test('raised mirror supports meet the floor and the physical panels leave space beneath the glass',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings),view=createFeatherView(new Scene(),sim);
  try{
    view.configure(settings);view.group.updateMatrixWorld(true);
    assert.equal(view.room.feet.length,6);
    for(const foot of view.room.feet){const bounds=new Box3().setFromObject(foot);assert.ok(Math.abs(bounds.min.y)<.02,'the furniture feet contact the floor');assert.ok(bounds.max.y>=MIRROR.footHeight);}
    const colliders=mirrorColliders(settings.feather.mirrorAngle);
    for(const [index,mirror]of view.room.mirrors.entries()){
      const collider=colliders[index*5],center=mirror.getWorldPosition(new Vector3());
      assert.ok(center.distanceTo(collider.position)<1e-7,'rendered and physical panel transforms agree');
      assert.ok(collider.position.y-collider.halfExtents.y>2.8,'no invisible panel wall below the raised frame');
    }
    assert.equal(view.room.curtains.length,7);
    for(const cloth of view.room.curtains){
      assert.ok(cloth.material.isMeshPhysicalMaterial);assert.ok(cloth.material.sheen>0&&cloth.material.anisotropy>0);
      assert.ok(cloth.castShadow&&cloth.receiveShadow);
      const bounds=new Box3().setFromObject(cloth);assert.ok(bounds.min.y>=0&&bounds.max.y<28);
      assert.ok([...cloth.geometry.attributes.position.array,...cloth.geometry.attributes.tangent.array].every(Number.isFinite));
    }
  }finally{view.dispose();sim.dispose();}
});

test('stage spotlight migration updates untouched defaults and preserves lighting edits',()=>{
  const old=defaultSetup();old.version=5;
  Object.assign(old.lighting.spotlight,{color:'#ffffff',intensity:15000,angle:32,penumbra:.65,offsetX:-14,height:28,offsetZ:22,softness:1.2,shadowBias:-.00001,normalBias:.002});
  old.lighting.hemisphere.intensity=1.1;old.studio.shadowOpacity=.24;
  const next=validateSetup(old);
  assert.deepEqual(next.lighting.spotlight,defaultSetup().lighting.spotlight);
  assert.equal(next.studio.shadowOpacity,.32);assert.equal(next.lighting.hemisphere.intensity,.65);
  assert.equal(old.lighting.spotlight.softness,1.2,'the saved input remains untouched');
  old.lighting.spotlight.softness=5;old.lighting.spotlight.intensity=12300;old.lighting.spotlight.color='#aabbcc';old.camera.yaw=48;
  const custom=validateSetup(old);assert.equal(custom.lighting.spotlight.softness,5);assert.equal(custom.lighting.spotlight.intensity,12300);assert.equal(custom.lighting.spotlight.color,'#aabbcc');assert.equal(custom.camera.yaw,48);
});

test('replacing a blob releases its owned finish once without touching the next blob',()=>{
  const settings=defaultSetup(),scene=new Scene(),old=new FeatherSimulation(settings),view=createFeatherView(scene,old),next=new FeatherSimulation(settings,1);
  const counts={material:0,textures:[0,0]},nextCounts={material:0,textures:[0,0]};
  for(const [simulation,events]of [[old,counts],[next,nextCounts]]){
    simulation.skinMaterial.addEventListener('dispose',()=>events.material++);
    simulation.skinFinish.textures.forEach((texture,i)=>texture.addEventListener('dispose',()=>events.textures[i]++));
  }
  try{
    assert.notEqual(old.skinMaterial,next.skinMaterial);
    assert.ok(old.skinFinish.textures.every(texture=>!next.skinFinish.textures.includes(texture)));
    view.dispose();assert.equal(old.skinFinish.diagnostics.disposed,false,'the view does not own the body finish');
    old.dispose();old.dispose();
    assert.deepEqual(counts,{material:1,textures:[1,1]});assert.equal(old.skinFinish.diagnostics.disposed,true);
    assert.deepEqual(nextCounts,{material:0,textures:[0,0]});assert.equal(next.skinFinish.diagnostics.disposed,false);
    next.update(1/60);assert.ok(next.skinMaterial.isMeshPhysicalMaterial);
  }finally{old.dispose();next.dispose();}
  assert.deepEqual(nextCounts,{material:1,textures:[1,1]});
});
