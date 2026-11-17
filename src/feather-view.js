import { Color, DoubleSide, Group, Mesh, MeshNormalMaterial, MeshStandardMaterial, Quaternion } from 'three';
import { bindFeatherBarbs, createFeatherGeometry } from './feather-geometry.js';
import { applyMaterialSettings } from './material-settings.js';
import { createDressingRoom } from './dressing-room.js';
export function createFeatherView(scene,simulation) {
  const group=new Group(),creature=simulation.object;group.name='Feather / dressing room';group.add(creature);scene.add(group);
  const materials={panels:simulation.skinMaterial,struts:new MeshStandardMaterial({vertexColors:true,side:DoubleSide}),pistons:new MeshStandardMaterial(),joints:new MeshStandardMaterial()};
  bindFeatherBarbs(materials.struts);
  // The AO depth/normal pass must see both sides of every opaque vane,
  // otherwise the mirror frame behind it gets composited over the feather.
  const featherNormals=new MeshNormalMaterial({side:DoubleSide});featherNormals.allowOverride=false;
  const body=simulation.surface.mesh;body.name='Caustic CSG creature / five fitted hulls';
  let feathers=[],plumageRevision=-1;
  function syncFeathers(){
    if(plumageRevision===simulation.plumageRevision)return;
    for(const {holder}of feathers){holder.traverse(o=>o.geometry?.dispose());holder.removeFromParent();}
    feathers=simulation.rig.map(entry=>{
      const holder=new Group(),{vane:surface}=createFeatherGeometry(entry.length,entry.width,entry.hue,entry.style,entry.profile);
      const blade=new Mesh(surface,materials.struts);
      blade.layers.enable(1);blade.userData.aoNormalMaterial=featherNormals;
      blade.castShadow=true;blade.receiveShadow=true;holder.add(blade);holder.name='Contact-separated plume';group.add(holder);return {entry,holder};
    });plumageRevision=simulation.plumageRevision;
  }
  syncFeathers();
  const room=createDressingRoom(materials);group.add(room.group);
  function configure(next,palette){
    for(const [key,material]of Object.entries(materials)){
      applyMaterialSettings(material,next.materials[key],key);
      if(key==='panels')simulation.skinFinish.configure(next.materials.panels);
      material.envMap=scene.environment;material.envMapIntensity=next.materials[key].envMapIntensity*(next.lighting.environment.enabled?next.lighting.environment.intensity:0);
      material.envMapRotation.y=next.lighting.environment.rotation*Math.PI/180;
    }
    // Palette workshop changes the plumage hue while preserving chromatic detail.
    const tint=palette?.environment?.accentColor;
    if(tint)materials.struts.color.multiply(new Color(tint).lerp(new Color('#ffffff'),.78));
    room.configure(next,scene);
  }
  function update(){
    simulation.surface.configure();syncFeathers();
    // Body size never animates. Its rendered skin follows only the five
    // dynamic Box3D hulls, including free fall and the landing deformation.
    for(const {entry,holder}of feathers){
      const sample=simulation.sampleAttachment(entry.attachment),rotation=new Quaternion().copy(entry.body.getRotation());
      holder.position.copy(sample.position);holder.quaternion.copy(rotation);
      // Complete vanes are visible during the drop as well as on the ground.
      // Landing and head motion excite their springy physical attachments.
      holder.scale.setScalar(1);holder.visible=true;
    }
  }
  return {group,materials,room,configure,update,get diagnostics(){return {feathers:feathers.length,mirrorPanels:room.mirrors.length,furnitureLegs:room.feet.length,curtainPanels:room.curtains.length,growth:simulation.plumageAt===null?0:1,generation:simulation.generation};},dispose(){
    scene.remove(group);const geometries=new Set(),mats=new Set();
    // The simulation owns the skin, skeleton and collider-debug resources.
    for(const child of group.children){if(child===creature)continue;child.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)mats.add(o.material);});}
    geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());featherNormals.dispose();for(const m of room.mirrors)m.getRenderTarget().dispose();
  }};
}
