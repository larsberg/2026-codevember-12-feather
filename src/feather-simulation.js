import { Group, Quaternion, Vector3 } from 'three';
import { createPhysics, initPhysics as initBox3D, PHYSICS_STEP } from './physics.js';
import { initCSG, createCreatureMesh } from './creature-mesh.js';
import { createMeshSurface } from './caustic-mesh/mesh-surface.js';
import { createBoxRig } from './caustic-mesh/box-rig.js';
import { createAttachmentSampler, sampleFollicles } from './surface-attachments.js';
import { featherColliders } from './feather-geometry.js';
import { createPlumageLayout } from './plumage-layout.js';
import { CreatureMotion } from './creature-motion.js';
import { mirrorColliders } from './dressing-room.js';
import { createGlamourMaterial } from './glamour-material.js';
import { CreatureFoley } from './creature-foley.js';
const identity=new Quaternion();
export async function initPhysics(){await Promise.all([initBox3D(),initCSG()]);}

export class FeatherSimulation {
  constructor(settings,generation=0){
    this.settings=settings;this.time=0;this.floor=0;this.generation=generation;this.contacts=0;this.position=new Float64Array(48);this.landedAt=null;
    this.seed=(settings.feather.seed+generation*104729)%1000001;
    const generated=createCreatureMesh(settings,this.seed);
    this.requestedSeed=this.seed;this.seed=generated.source.seed;this.meshAttempts=generated.attempts;
    Object.assign(this,{geometry:generated.geometry,topology:generated.topology,source:generated.source,layers:generated.layers,provenance:generated.provenance});
    this.physics=createPhysics(settings.physics);this.object=new Group();this.object.name='Caustic five-hull creature';
    this.object.position.y=settings.mesh.dropHeight-this.geometry.boundingBox.min.y;
    this.object.updateMatrixWorld(true);this.rig=[];
    try{
      this.floorBody=this.physics.addBody({body:{type:'static',position:{x:0,y:-1,z:0}},shapes:[{type:'box',halfExtents:{x:80,y:1,z:80}}]});
      this.furnitureBodies=mirrorColliders(settings.feather.mirrorAngle).map(({position,rotation,halfExtents},index)=>({
        kind:index%5===0?'glass':'wood',entry:this.physics.addBody({body:{type:'static',position,rotation},shapes:[{type:'box',halfExtents}]})}));
      this.skinFinish=createGlamourMaterial(this.seed,generation,settings.mesh.size);
      this.skinMaterial=this.skinFinish.material;
      this.surface=createMeshSurface(this.topology,this.skinMaterial,{skinned:true});this.object.add(this.surface.mesh);
      // These are the original source's fitted hulls, weights, joints and GPU
      // skinning, not the previous kinematic sphere or a particle membrane.
      this.meshRig=createBoxRig(this.source,this.topology,this.surface,this.physics,positions=>{this.positions=positions;});
      // The source rig uses default category 1. Put its overlapping inner
      // hulls in their own category so plumage cannot punch the skin rig.
      for(const entry of this.meshRig.entries)for(const shape of entry.shapes)shape.setFilter({...shape.getFilter(),categoryBits:4,maskBits:5});
      this.motion=new CreatureMotion(this);
      this.object.updateMatrixWorld(true);
      this.sampleAttachment=createAttachmentSampler(this.positions,this.object.matrixWorld);
      this.plumageRevision=0;this.plumageAt=0;
      // Design the complete crest on the airborne body's actual surface.
      // These same follicles and feather bodies stay attached through landing.
      const plumageSurface=this.geometry.clone().applyMatrix4(this.object.matrixWorld);
      try{this.createPlumage(plumageSurface);}finally{plumageSurface.dispose();}
      this.foley=new CreatureFoley(this);
      this.physics.onBeforeStep(dt=>this.drive(dt));
      this.physics.onAfterStep(dt=>{const contacts=this.physics.world.getContactEvents();this.contacts+=contacts.begin.length;this.foley.afterStep(dt,contacts);});
      this.configure(settings);this.sync();
    }catch(error){this.dispose();throw error;}
  }
  createPlumage(geometry){
    const settings=this.settings;
    for(const entry of this.rig){this.physics.removeBody(entry.physicsEntry);this.physics.removeBody(entry.follicle);}
    this.rig=[];this.plumageBounds=geometry.boundingBox.clone();
    const follicles=sampleFollicles(geometry,Math.round(settings.feather.count),this.seed);
    const layout=createPlumageLayout(follicles,this.sampleAttachment,geometry.boundingBox,settings,this.seed,this.generation);
    for(const plume of layout){
      const {attachment,sample,rotation,length,width:vaneWidth}=plume,root=sample.position.clone();
      const follicle=this.physics.addBody({body:{type:'kinematic',position:root,rotation}});
      const shapes=featherColliders(length,vaneWidth,plume.profile,settings.physics.mass);
      const entry=this.physics.addBody({body:{type:'dynamic',position:new Vector3(0,length/2,0).applyQuaternion(rotation).add(root),rotation,linearDamping:settings.physics.damping,angularDamping:.6},shapes});
      const joint=this.physics.addSphericalJoint(follicle,entry,{localFrameA:{position:new Vector3(),rotation:identity},localFrameB:{position:{x:0,y:-length/2,z:0},rotation:identity},collideConnected:false,
        enableSpring:false,enableConeLimit:true,coneAngle:.18,enableTwistLimit:true,lowerTwistAngle:-.07,upperTwistAngle:.07});
      this.rig.push({...entry,physicsEntry:entry,...plume,follicle,joint,root,driveRotation:rotation.clone(),relativeRotation:sample.rotation.clone().invert().multiply(rotation),target:{position:new Vector3(),rotation:new Quaternion(),normal:new Vector3()}});
    }
    this.plumageRevision++;
  }
  lowestHullPoint(){
    let bottom=Infinity;
    for(const [i,entry] of this.meshRig.entries.entries())for(const p of this.meshRig.colliders[i]?.points??[])bottom=Math.min(bottom,entry.body.getWorldPoint(p).y);
    return bottom;
  }
  drive(dt){
    // Refresh the actual Box3D bones before sampling their weighted surface.
    this.physics.sync();
    const bottom=this.lowestHullPoint(),grounded=bottom<.16;
    if(grounded&&this.landedAt===null)this.landedAt=this.time;
    this.motion.update(dt,this.landedAt!==null);
    this.foley.beforeStep(dt,bottom);
    for(const entry of this.rig){
      const sample=this.sampleAttachment(entry.attachment,entry.target),desired=sample.rotation.clone().multiply(entry.relativeRotation);
      // A skin triangle can turn sharply as its supporting hulls step apart.
      // Bound the follicle's angular speed so the contact solver can follow;
      // ordinary head turns remain below this limit and retain their timing.
      entry.driveRotation.rotateTowards(desired,dt*12);
      entry.follicle.body.setTargetTransform({position:sample.position,rotation:entry.driveRotation},PHYSICS_STEP,true);
      const mass=entry.body.getMass();
      if(this.landedAt!==null)entry.body.applyForceToCenter({x:0,y:mass*this.settings.physics.gravity*.9,z:0},true);
      const delta=entry.driveRotation.clone().multiply(new Quaternion().copy(entry.body.getRotation()).invert());if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
      const omega=entry.body.getAngularVelocity(),inertia=mass*entry.length**2/12;
      entry.body.applyTorque({x:inertia*(delta.x*72-omega.x*3.8),y:inertia*(delta.y*72-omega.y*3.8),z:inertia*(delta.z*72-omega.z*3.8)},true);
    }
    return {substeps:8};
  }
  configure(settings){
    this.settings=settings;this.physics.configure(settings.physics);this.motion.configure(settings);this.skinFinish.configure(settings.materials.panels);
    for(const entry of this.meshRig.entries){entry.body.setLinearDamping(settings.physics.damping);entry.body.setAngularDamping(2);for(const shape of entry.shapes)shape.setDensity(settings.physics.mass,false);entry.body.applyMassFromShapes();}
    for(const e of this.rig){e.body.setLinearDamping(settings.physics.damping);for(const shape of e.shapes)shape.setDensity(settings.physics.mass*.08,false);e.body.applyMassFromShapes();}
  }
  sync(){this.physics.sync();for(let i=0;i<16;i++){const id=Math.floor(i/16*this.positions.length/3);new Vector3().fromArray(this.positions,id*3).applyMatrix4(this.object.matrixWorld).toArray(this.position,i*3);}}
  update(dt){if(!Number.isFinite(dt)||dt<=0)return;this.time+=dt;this.physics.step(dt);this.sync();}
  getCenter(target){return target.set(0,7.5,0);}
  get stats(){return {physicsEngine:'Box3D',meshSource:this.provenance,meshVertices:this.topology.vertices.length,meshPolygons:this.topology.faces.length,hullBodies:this.meshRig.entries.length,bodyJoints:this.meshRig.joints.length,contactBegins:this.contacts,generation:this.generation,seed:this.seed,requestedSeed:this.requestedSeed,meshAttempts:this.meshAttempts,time:this.time,landedAt:this.landedAt,plumageAt:this.plumageAt,plumageStyle:this.rig[0]?.plumageStyle,skinFinish:this.skinFinish.diagnostics,lowestHullPoint:this.lowestHullPoint(),bodies:this.physics.entries.length,colliders:this.physics.entries.reduce((sum,e)=>sum+e.shapes.length,0),joints:this.physics.joints.length,feathers:this.rig.length,motion:this.motion.diagnostics};}
  dispose(){if(this.disposed)return;this.disposed=true;this.meshRig?.dispose();this.surface?.dispose();this.skinFinish?.dispose();this.physics?.dispose();this.geometry?.dispose();}
}
