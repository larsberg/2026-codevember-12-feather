import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Box3,DoubleSide,Quaternion,Scene,Texture,Vector3 } from 'three';
import signatures from './fixtures/caustic-mesh-signatures.json' with {type:'json'};
import { defaultSetup,validateSetup } from '../src/settings.js';
import { initPhysics,FeatherSimulation } from '../src/feather-simulation.js';
import { createCreatureMesh } from '../src/creature-mesh.js';
import { createFeatherView } from '../src/feather-view.js';
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

test('folded generated candidates retry deterministically without changing the Caustic pipeline',()=>{
  const settings=defaultSetup(),before=structuredClone(settings);
  for(const [generation,requestedSeed]of [[24,245727],[63,330154]]){
    const sim=new FeatherSimulation(settings,generation),repeat=createCreatureMesh(settings,requestedSeed);
    try{
      assert.equal(sim.requestedSeed,requestedSeed);assert.ok(sim.meshAttempts>1&&sim.meshAttempts<=8);
      assert.equal(sim.seed,repeat.source.seed);assert.deepEqual(sim.topology,repeat.topology);
      assert.equal(sim.meshRig.entries.length,5);assert.equal(sim.rig.length,64);
      for(let i=0;i<90;i++)sim.update(1/60);
      assert.ok(sim.landedAt!==null);assert.ok(sim.positions.every(Number.isFinite));
    }finally{sim.dispose();repeat.geometry.dispose();}
  }
  assert.deepEqual(settings,before);
  assert.throws(()=>createCreatureMesh({...settings,pipeline:{...settings.pipeline,insetScale:0}},245727),/Inset scale/,'unrelated configuration errors still propagate');
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
    for(const holder of holders){
      assert.ok(holder.visible);assert.deepEqual(holder.scale.toArray(),[1,1,1]);
      const vane=holder.children[0];
      assert.ok(vane.layers.isEnabled(1),'opaque feathers occlude the mirror in the AO depth pass');
      assert.equal(vane.material.opacity,1);assert.equal(vane.material.depthWrite,true);
      assert.equal(vane.userData.aoNormalMaterial.side,DoubleSide,'back-facing vanes also write AO depth');
      assert.equal(vane.userData.aoNormalMaterial.allowOverride,false);
    }
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

test('black-stage migration replaces the paper default and preserves custom studio edits',()=>{
  const saved=defaultSetup();saved.version=7;saved.studio.background='#e9e2d4';saved.studio.exposure=1.25;
  const next=validateSetup(saved);
  assert.equal(next.studio.background,'#000000');assert.equal(next.studio.exposure,1.25);
  assert.equal(saved.studio.background,'#e9e2d4');assert.deepEqual(validateSetup(next),next);
  saved.studio.background='#15345a';assert.equal(validateSetup(saved).studio.background,'#15345a');
  saved.version=8;saved.studio.background='#e9e2d4';assert.equal(validateSetup(saved).studio.background,'#e9e2d4');
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
      const signature=entries=>entries.map(e=>[e.length,e.width,...e.profile.p3.toArray(),e.hue,e.role,e.featherType,e.profile.paint]);
      assert.deepEqual(signature(layout),signature(make()),'the seed reproduces the same crest');
      assert.equal(layout[0].plumageStyle,PLUMAGE_STYLES[generation]);
      assert.ok(layout.every(e=>e.width>.25&&e.length>.7&&e.length<18),'ribbons retain a full vane and compact coverts remain usable');
      assert.deepEqual(new Set(layout.map(e=>e.role)),new Set(['covert','secondary','display']));
      const lengths=layout.map(e=>e.length);
      assert.ok(Math.max(...lengths)/Math.min(...lengths)>1.3,'short coverts blend into longer feathers');
      summaries.push({x:Math.max(...tips.map(p=>p.x))-Math.min(...tips.map(p=>p.x)),y:Math.max(...tips.map(p=>p.y)),z:Math.min(...tips.map(p=>p.z)),meanX:tips.reduce((sum,p)=>sum+p.x,0)/tips.length,meanLength:lengths.reduce((a,b)=>a+b,0)/lengths.length});
      signatures.push(JSON.stringify(signature(layout)));
    }
    assert.equal(new Set(signatures).size,PLUMAGE_STYLES.length);
    assert.ok(summaries[1].x>summaries[0].x*1.5,'the graduated fan opens across the head');
    assert.ok(Math.abs(summaries[2].meanX-summaries[0].meanX)>1,'the side sweep has a different direction');
    assert.ok(summaries[3].x>summaries[0].x*2,'the split crest has separate trailing tips');
    assert.ok(summaries[4].y>summaries[0].y+1.5,'the arched fan stands taller');
    assert.ok(summaries[5].z<summaries[0].z,'the cascade trails farther back');
    assert.ok(summaries[6].meanLength<summaries[0].meanLength*.65,'compact caps have genuinely shorter feathers');
    assert.ok(summaries[7].x>summaries[0].x*3,'the royal fan spreads across the crown');
    assert.ok(summaries[8].meanLength>summaries[6].meanLength*2,'the ribbon train has a distinct size');
    const variant=createPlumageLayout(follicles,sim.sampleAttachment,sim.plumageBounds,settings,sim.seed,10);
    assert.equal(variant[0].plumageStyle,'swept');
    assert.ok(variant.some(e=>e.featherType==='sabre'),'later cycles change feather types within the same arrangement');
  }finally{sim.dispose();}
});

test('compact, broad, trailing and tall plumage stays attached through landing and quick turns',()=>{
  for(const generation of [6,7,8,9]){
    const sim=new FeatherSimulation(defaultSetup(),generation);
    try{
      for(let frame=0;frame<300;frame++){
        sim.update(1/60);
        for(const entry of sim.rig){
          const position=new Vector3().copy(entry.body.getPosition());
          assert.ok(position.toArray().every(Number.isFinite)&&position.length()<40);
          const anchor=new Vector3().copy(entry.body.getWorldPoint({x:0,y:-entry.length/2,z:0}));
          assert.ok(anchor.distanceTo(sim.sampleAttachment(entry.attachment).position)<1.2,'the contact solver keeps up with the moving follicle');
          assert.ok(new Quaternion().copy(entry.body.getRotation()).angleTo(entry.driveRotation)<1.5,'no sudden half-turn of the vane');
        }
      }
      assert.ok(sim.landedAt<.8);assert.ok(sim.motion.steps>=6);
      assert.equal(sim.rig.length,64);assert.ok(sim.rig.every(e=>e.shapes.length===3));
    }finally{sim.dispose();}
  }
});

test('raised mirror supports meet the floor and the physical panels leave space beneath the glass',()=>{
  const settings=defaultSetup(),sim=new FeatherSimulation(settings),scene=new Scene();
  scene.environment=new Texture();
  const view=createFeatherView(scene,sim);
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
      assert.equal(cloth.material.envMap,scene.environment,'explicit map avoids Three falling back to scene environment intensity');
      assert.equal(cloth.material.envMapIntensity,0,'shadowless environment does not illuminate the cloth');
      const bounds=new Box3().setFromObject(cloth);assert.ok(bounds.min.y>=0&&bounds.max.y<28);
      assert.ok([...cloth.geometry.attributes.position.array,...cloth.geometry.attributes.tangent.array].every(Number.isFinite));
    }
  }finally{view.dispose();sim.dispose();scene.environment.dispose();}
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

test('real spotlight migration restores the original beam and preserves custom lighting',()=>{
  const saved=defaultSetup();saved.version=8;
  Object.assign(saved.lighting.spotlight,{intensity:9000,angle:27,offsetX:-10,height:22,offsetZ:16});
  const next=validateSetup(saved);
  assert.deepEqual(next.lighting.spotlight,defaultSetup().lighting.spotlight);
  assert.equal(saved.lighting.spotlight.angle,27);assert.deepEqual(validateSetup(next),next);
  Object.assign(saved.lighting.spotlight,{angle:48,intensity:11200,offsetX:-18,height:40,offsetZ:32,softness:5,penumbra:.6});
  assert.deepEqual(validateSetup(saved).lighting.spotlight,saved.lighting.spotlight);
  saved.version=9;
  Object.assign(saved.lighting.spotlight,{intensity:14000,angle:36,offsetX:-12,height:28,offsetZ:26});
  saved.lighting.fill.enabled=true;saved.lighting.hemisphere.enabled=true;
  saved.bloom={enabled:true,strength:.05,radius:0,threshold:0};saved.camera.yaw=68;
  const restored=validateSetup(saved);
  for(const key of ['intensity','angle','offsetX','height','offsetZ'])assert.equal(restored.lighting.spotlight[key],defaultSetup().lighting.spotlight[key]);
  assert.equal(restored.lighting.spotlight.softness,5);assert.equal(restored.lighting.spotlight.penumbra,.6);
  assert.equal(restored.lighting.fill.enabled,false);assert.equal(restored.lighting.hemisphere.enabled,false);
  assert.deepEqual(restored.bloom,saved.bloom);assert.equal(restored.camera.yaw,68);
  assert.equal(saved.lighting.spotlight.angle,36,'migration never mutates the saved input');
  saved.lighting.fill.intensity=1.7;saved.lighting.hemisphere.skyColor='#ffaaaa';
  assert.equal(validateSetup(saved).lighting.fill.enabled,true);assert.equal(validateSetup(saved).lighting.hemisphere.enabled,true);
  restored.lighting.fill.enabled=true;restored.lighting.hemisphere.enabled=true;
  assert.deepEqual(validateSetup(restored),restored,'new lighting edits survive subsequent validation');
  saved.version=8;
  assert.deepEqual(validateSetup(saved).lighting.spotlight,saved.lighting.spotlight,'pre-v9 custom settings are not mistaken for the rejected defaults');
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
