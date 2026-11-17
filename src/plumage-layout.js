import { Matrix4, Quaternion, Vector3 } from 'three';
import { randomFor } from './feather-geometry.js';
const back=new Vector3(0,0,-1);
export const PLUMAGE_STYLES=['swept','graduated-fan','side-sweep','split-crest','arched-fan','cascade','velvet-cap','royal-fan','ribbon-train','flame-crest'];
export const FEATHER_TYPES={
  lance:{widthPower:.88,widthPeak:.58,widthScale:.88,asymmetry:.12},
  rounded:{widthPower:.42,widthPeak:1.2,widthScale:1.25,asymmetry:.06},
  paddle:{widthPower:.6,widthPeak:1.65,widthScale:1.32,asymmetry:.1},
  sabre:{widthPower:.78,widthPeak:.82,widthScale:.92,asymmetry:.32},
  ribbon:{widthPower:.3,widthPeak:.9,widthScale:.6,asymmetry:.09},
  scalloped:{widthPower:.56,widthPeak:.9,widthScale:1.15,asymmetry:.12,scallop:.16},
};
export const FEATHER_PATTERNS=['gradient','barred','jewel-spots','edged','speckled','ombre'];
const wardrobes=[
  {types:['lance','sabre'],scale:[.8,1.12],pattern:3},
  {types:['paddle','rounded'],scale:[.85,1.12],pattern:1},
  {types:['sabre','lance'],scale:[.75,1.1],pattern:5},
  {types:['scalloped','lance'],scale:[.8,1.1],pattern:3},
  {types:['rounded','paddle'],scale:[.9,1.13],pattern:2},
  {types:['ribbon','sabre'],scale:[1,1.24],pattern:1},
  {types:['rounded','scalloped'],scale:[.48,.64],pattern:4},
  {types:['paddle','scalloped'],scale:[1.05,1.28],pattern:2},
  {types:['ribbon','sabre'],scale:[1.05,1.28],pattern:5},
  {types:['lance','scalloped'],scale:[.85,1.08],pattern:3},
];
const clamp=value=>Math.max(0,Math.min(1,value));

// Each creature gets one coherent flow field, with seeded variations inside
// ten families. +Z is the face. Even an open fan follows the scalp first, with
// broad coverts blending into longer flight feathers rather than radial rods.
export function createPlumageLayout(follicles,sampleAttachment,bounds,settings,seed,generation){
  const random=randomFor(seed),size=bounds.getSize(new Vector3()),index=generation%PLUMAGE_STYLES.length;
  const family=PLUMAGE_STYLES[index],wardrobe=wardrobes[index],center=bounds.getCenter(new Vector3());
  const handedness=random()<.5?-1:1,length=settings.feather.length*(wardrobe.scale[0]+random()*(wardrobe.scale[1]-wardrobe.scale[0])),spread=.75+random()*.5;
  const sweep=handedness*(.52+random()*.25),arching=.85+random()*.3;
  const cycle=Math.floor(generation/PLUMAGE_STYLES.length),type=wardrobe.types[cycle%wardrobe.types.length];
  const pattern=(wardrobe.pattern+cycle)%FEATHER_PATTERNS.length,hue=(.47+generation*.137+random()*.12)%1;
  const fullness=.82+random()*.35,twist=(random()-.5)*.65,phase=random()*Math.PI*2;
  const crownLeft=Math.min(...follicles.map(a=>a.point.x)),crownRight=Math.max(...follicles.map(a=>a.point.x));
  const crownCenter=(crownLeft+crownRight)/2,crownRadius=Math.max(.1,(crownRight-crownLeft)/2);
  // Order the layers by actual scalp position; short forehead/shoulder coverts
  // lead into longer crown feathers, without increasing the collider budget.
  const ranks=follicles.map((a,i)=>({i,score:.55*(a.point.y-bounds.min.y)/size.y+.45*(bounds.max.z-a.point.z)/size.z})).sort((a,b)=>a.score-b.score);
  const rankByIndex=new Map(ranks.map((r,i)=>[r.i,i/Math.max(1,ranks.length-1)]));
  return follicles.map((attachment,i)=>{
    const sample=sampleAttachment(attachment),root=attachment.point;
    const height=clamp((root.y-bounds.min.y)/size.y);
    const side=Math.max(-1,Math.min(1,family==='swept'?(root.x-center.x)/Math.max(.1,size.x*.5):(root.x-crownCenter)/crownRadius)),central=1-Math.abs(side);
    const rear=clamp((bounds.max.z-root.z)/Math.max(.1,size.z));
    const tip=new Vector3(center.x,bounds.max.y+length*.12,bounds.min.z-length*.55);
    const rank=rankByIndex.get(i),role=rank<.24?'covert':rank<.52?'secondary':'display';
    const featherType=role==='covert'?'rounded':role==='secondary'&&type==='ribbon'?'lance':type,morph=FEATHER_TYPES[featherType];
    let reach=Math.min(1,.5+.3*central+.2*height),lift=.34,arch=.13,widthScale=1;
    if(family==='graduated-fan'){
      // Short coverts at the forehead merge continuously into the long rear fan.
      tip.x+=side*(size.x*.36+length*.19)*spread;
      tip.y+=length*.12;tip.z-=length*.08;
      reach=Math.min(1,length*(.23+.77*Math.pow(.85*rear+.15*height,1.1))/root.distanceTo(tip));
      widthScale=1.1;
    }else if(family==='side-sweep'){
      tip.x+=Math.sin(sweep)*length*.8;tip.z=bounds.min.z-Math.cos(sweep)*length*.6;
      tip.y+=length*.1;
      reach=Math.min(1,length*(.28+.72*clamp(.45*height+.55*(1-handedness*side)/2))/root.distanceTo(tip));
      arch=.19;
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
      lift=.65;arch=.32;widthScale=1.05;
    }else if(family==='cascade'){
      tip.x+=side*size.x*.18;
      tip.y=bounds.max.y-length*.12;tip.z-=length*.28;
      reach=.26+.74*Math.pow(clamp(.65*height+.35*central),1.45);
      arch=.19;widthScale=.92;
    }else if(family==='velvet-cap'){
      tip.x+=side*size.x*.3;tip.y=bounds.max.y+length*.05;tip.z=bounds.min.z-length*.16;
      reach=Math.min(1,length*(.4+.6*rank)/root.distanceTo(tip));
      arch=.08;lift=.28;widthScale=1.08;
    }else if(family==='royal-fan'){
      tip.x+=side*(size.x*.35+length*.48)*spread;
      tip.y=bounds.max.y+length*(.55-.18*Math.abs(side));tip.z=bounds.min.z-length*.4;
      reach=.55+.45*rank;arch=.28;lift=.62;widthScale=1.08;
    }else if(family==='ribbon-train'){
      tip.x+=side*(size.x*.28+length*.13)+handedness*length*.14;
      tip.y=bounds.max.y-length*.16;tip.z=Math.max(-8.6,bounds.min.z-length*.85);
      reach=.38+.62*rank;arch=.21;lift=.4;
    }else if(family==='flame-crest'){
      tip.x+=side*size.x*.5;tip.y=bounds.max.y+length*(.2+.42*central);
      tip.z=bounds.min.z-length*.38;reach=.4+.6*rank;
      arch=.17;lift=.5;widthScale=.92;
    }
    // Layer sizes differ substantially. Keep full vanes even on the shorter
    // coverts, with the largest display feathers setting the outer silhouette.
    reach*=role==='covert'?.54:role==='secondary'?.78:1;
    reach*=.94+random()*.12;
    reach=Math.min(reach,settings.feather.length*1.95/root.distanceTo(tip));
    const end=root.clone().lerp(tip,reach);
    const n=sample.normal.clone(),toward=tip.clone().sub(root).normalize();
    const flow=family==='swept'?back:new Vector3(toward.x,0,toward.z).normalize();
    const tangent=flow.clone().addScaledVector(n,-flow.dot(n));
    if(tangent.lengthSq()<.05)tangent.copy(toward);
    tangent.normalize().lerp(toward,.22).addScaledVector(n,lift).normalize();
    const distance=root.distanceTo(end),p1=root.clone().addScaledVector(tangent,Math.min(distance*.3,size.y*.42));
    const p2=root.clone().lerp(end,.62),layerArch=role==='covert'?.42:role==='secondary'?.7:1;
    p2.y=Math.max(p1.y,root.y+(bounds.max.y-root.y)*layerArch,end.y-length*.16)+length*arch*layerArch;
    if(featherType==='sabre'||featherType==='ribbon')p2.x+=handedness*distance*.12*layerArch;
    // Feather width lies across the scalp, with the vane's normal facing out.
    const y=tangent,x=new Vector3().crossVectors(y,n).normalize();
    if(x.lengthSq()<.5)x.set(1,0,0);
    const z=new Vector3().crossVectors(x,y).normalize();
    const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x,y,z)),inverse=rotation.clone().invert();
    const local=p=>p.clone().sub(root).applyQuaternion(inverse);
    const width=settings.feather.width*widthScale*morph.widthScale*fullness*(role==='covert'?.62:role==='secondary'?.82:1)*(.9+.22*(1-central))*(.9+random()*.2);
    return {attachment,sample,rotation,length:distance,width,reach,role,featherType,pattern:FEATHER_PATTERNS[role==='covert'?0:pattern],
      profile:{p1:local(p1),p2:local(p2),p3:local(end),asymmetry:morph.asymmetry+(random()-.5)*.06,
        widthPower:morph.widthPower,widthPeak:morph.widthPeak,scallop:morph.scallop??0,scallopCount:5+Math.floor(random()*4),
        twist:twist*layerArch+(random()-.5)*.16,camber:.1+random()*.16,
        paint:{pattern:role==='covert'?0:pattern,phase:phase+random()*.3,strength:role==='secondary'?.65:1,accentHue:(hue+.14+random()*.06)%1}},
      hue:(hue+(1-height)*.06+random()*.025)%1,style:0,plumageStyle:family};
  });
}
