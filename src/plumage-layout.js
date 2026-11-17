import { Matrix4, Quaternion, Vector3 } from 'three';
import { randomFor } from './feather-geometry.js';
const back=new Vector3(0,0,-1);
export const PLUMAGE_STYLES=['swept','graduated-fan','side-sweep','split-crest','arched-fan','cascade'];
const clamp=value=>Math.max(0,Math.min(1,value));

// Each creature gets one coherent flow field, with seeded variations inside
// six families. +Z is the face. Even an open fan follows the scalp first, with
// broad coverts blending into longer flight feathers rather than radial rods.
export function createPlumageLayout(follicles,sampleAttachment,bounds,settings,seed,generation){
  const random=randomFor(seed),size=bounds.getSize(new Vector3());
  const family=PLUMAGE_STYLES[generation%PLUMAGE_STYLES.length],center=bounds.getCenter(new Vector3());
  const handedness=random()<.5?-1:1,length=settings.feather.length*(.9+random()*.2),spread=.85+random()*.3;
  const sweep=handedness*(.52+random()*.25),arching=.85+random()*.3;
  return follicles.map(attachment=>{
    const sample=sampleAttachment(attachment),root=attachment.point;
    const height=clamp((root.y-bounds.min.y)/size.y),side=Math.max(-1,Math.min(1,(root.x-center.x)/Math.max(.1,size.x*.5))),central=1-Math.abs(side);
    const rear=clamp((bounds.max.z-root.z)/Math.max(.1,size.z));
    const tip=new Vector3(center.x,bounds.max.y+length*.12,bounds.min.z-length*.55);
    let reach=Math.min(1,.5+.3*central+.2*height),lift=.34,arch=.13,widthScale=1,widthPower=.72,widthPeak=.72;
    if(family==='graduated-fan'){
      // Short coverts at the forehead merge continuously into the long rear fan.
      tip.x+=side*(size.x*.36+length*.19)*spread;
      tip.y+=length*.12;tip.z-=length*.08;
      reach=Math.min(1,length*(.23+.77*Math.pow(.85*rear+.15*height,1.1))/root.distanceTo(tip));
      widthScale=1.1;widthPower=.66;
    }else if(family==='side-sweep'){
      tip.x+=Math.sin(sweep)*length*.8;tip.z=bounds.min.z-Math.cos(sweep)*length*.6;
      tip.y+=length*.1;
      reach=Math.min(1,length*(.28+.72*clamp(.45*height+.55*(1-handedness*side)/2))/root.distanceTo(tip));
      arch=.19;widthPeak=.78;
    }else if(family==='split-crest'){
      // A natural center part feeds two distinct, tapered rear crests.
      tip.x+=Math.sign(side||1)*(size.x*.35+length*.22)*spread;
      tip.y+=length*.13;tip.z-=length*.08;
      reach=.4+.6*clamp(.55*height+.25*rear+.2*central);
      lift=.38;arch=.19;widthScale=.94;
    }else if(family==='arched-fan'){
      tip.x+=side*(size.x*.45+length*.24)*spread;
      tip.y=bounds.max.y+length*(.48+.13*central)*arching;
      tip.z=bounds.min.z-length*.24;
      reach=.5+.5*clamp(.7*height+.3*central);
      lift=.65;arch=.32;widthScale=1.15;widthPower=.62;
    }else if(family==='cascade'){
      tip.x+=side*size.x*.18;
      tip.y=bounds.max.y-length*.12;tip.z-=length*.28;
      reach=.26+.74*Math.pow(clamp(.65*height+.35*central),1.45);
      arch=.19;widthScale=.92;widthPower=.85;
    }
    const end=root.clone().lerp(tip,reach);
    const n=sample.normal.clone(),toward=tip.clone().sub(root).normalize();
    const flow=family==='swept'?back:new Vector3(toward.x,0,toward.z).normalize();
    const tangent=flow.clone().addScaledVector(n,-flow.dot(n));
    if(tangent.lengthSq()<.05)tangent.copy(toward);
    tangent.normalize().lerp(toward,.22).addScaledVector(n,lift).normalize();
    const distance=root.distanceTo(end),p1=root.clone().addScaledVector(tangent,Math.min(distance*.3,size.y*.42));
    const p2=root.clone().lerp(end,.62);p2.y=Math.max(p1.y,bounds.max.y,family==='arched-fan'?end.y-length*.16:-Infinity)+length*arch+.08*(root.z-bounds.min.z)/size.z;
    // Feather width lies across the scalp, with the vane's normal facing out.
    const y=tangent,x=new Vector3().crossVectors(y,n).normalize();
    if(x.lengthSq()<.5)x.set(1,0,0);
    const z=new Vector3().crossVectors(x,y).normalize();
    const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)),inverse=rotation.clone().invert();
    const local=p=>p.clone().sub(root).applyQuaternion(inverse);
    const width=settings.feather.width*widthScale*(.9+.35*(1-central))*(.93+random()*.14);
    return {attachment,sample,rotation,length:distance,width,reach,
      profile:{p1:local(p1),p2:local(p2),p3:local(end),asymmetry:.12+(random()-.5)*.1,widthPower,widthPeak},
      hue:(.48+generation*.17+(1-height)*.035+random()*.025)%1,style:generation%3,plumageStyle:family};
  });
}
