import { BufferGeometry, Float32BufferAttribute, Color, SRGBColorSpace, Vector3 } from 'three';
export function randomFor(seed) {
  let state=seed>>>0;
  return ()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
}
export function featherCenter(t,length,profile){
  if(!profile)return new Vector3(0,t*length,.65*t*t);
  const u=1-t;
  return new Vector3().addScaledVector(profile.p1,3*u*u*t).addScaledVector(profile.p2,3*u*t*t).addScaledVector(profile.p3,t*t*t);
}
export function featherWidth(t,width,profile){
  // Broad pointed, rounded, paddle and ribbon outlines share the same
  // continuous surface used by the collider. Scallops alter the actual edge.
  t=Math.max(0,Math.min(1,t));
  if(t===0||t===1)return 0;
  const scallop=1-(profile?.scallop??0)*(.5+.5*Math.cos(t*Math.PI*2*(profile?.scallopCount??6)))*Math.sin(Math.PI*t);
  return width*Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(t,profile?.widthPeak??.72))),profile?.widthPower??.72)*scallop;
}
export function featherPoint(t,length,width,side=0,profile){
  const center=featherCenter(t,length,profile),tangent=featherCenter(Math.min(1,t+.001),length,profile).sub(featherCenter(Math.max(0,t-.001),length,profile)).normalize();
  const across=new Vector3(1,0,0).addScaledVector(tangent,-tangent.x).normalize();
  across.applyAxisAngle(tangent,(profile?.twist??0)*t*t);
  const normal=new Vector3().crossVectors(across,tangent).normalize();
  const extent=featherWidth(t,width,profile),asym=1+Math.sign(side)*(profile?.asymmetry??.1);
  return center.addScaledVector(across,side*extent*asym).addScaledVector(normal,-side*side*extent*(profile?.camber??.17));
}
function featherColor(t,side,hue,style){
  // One coherent palette per crest, with dark tips and subtle transverse bars.
  const color=new Color();
  const h=style===1?.105-.055*t:hue+.09*t;
  const bars=.94+.06*Math.cos(t*96+Math.abs(side)*3);
  color.setHSL(h%1,.86,(.46-.22*Math.pow(t,4)+.045*Math.abs(side))*bars,SRGBColorSpace);
  if(style===2){const spot=Math.exp(-(((t-.72)/.12)**2+((Math.abs(side)-.35)/.35)**2));color.lerp(new Color('#10275c'),spot*.75);}
  return color;
}
export function createFeatherGeometry(length,width,hue,style,profile){
  const vanePositions=[],vaneColors=[],vaneUvs=[],vaneNormals=[],paintData=[],accentData=[];
  const paint=profile?.paint??{pattern:0,phase:0,strength:1,accentHue:(hue+.18)%1};
  const accent=new Color().setHSL(paint.accentHue,.8,.54,SRGBColorSpace);
  const segments=80,across=[-1,-.55,0,.55,1];
  // A curved, cambered vane with a continuous silhouette; its fine barb
  // lines sit on the surface rather than floating as a wire fan.
  for(let i=0;i<segments;i++)for(let j=0;j<across.length-1;j++){
    const t0=i/segments,t1=(i+1)/segments;
    const corners=[[t0,across[j]],[t0,across[j+1]],[t1,across[j]],[t0,across[j+1]],[t1,across[j+1]],[t1,across[j]]];
    for(const [t,s]of corners){
      const p=featherPoint(t,length,width,s,profile),color=featherColor(t,s,hue,style);
      const at=Math.max(.001,Math.min(.999,t)),along=featherPoint(at+.0005,length,width,s,profile).sub(featherPoint(at-.0005,length,width,s,profile));
      const across=featherPoint(at,length,width,s+.001,profile).sub(featherPoint(at,length,width,s-.001,profile));
      const normal=across.cross(along).normalize();
      vanePositions.push(...p.toArray());vaneColors.push(color.r,color.g,color.b);vaneUvs.push((s+1)/2,t);vaneNormals.push(...normal.toArray());
      paintData.push(paint.pattern,paint.phase,paint.strength);accentData.push(accent.r,accent.g,accent.b);
    }
  }
  const vane=new BufferGeometry();vane.setAttribute('position',new Float32BufferAttribute(vanePositions,3));vane.setAttribute('color',new Float32BufferAttribute(vaneColors,3));vane.setAttribute('uv',new Float32BufferAttribute(vaneUvs,2));vane.setAttribute('normal',new Float32BufferAttribute(vaneNormals,3));
  vane.setAttribute('featherPaint',new Float32BufferAttribute(paintData,3));vane.setAttribute('featherAccent',new Float32BufferAttribute(accentData,3));
  return {vane};
}

// Three thin convex vane sections permit shingled overlap while separating
// neighboring surfaces. Round capsules inflated the fan into separated rods.
export function featherColliders(length,width,profile,mass){
  const center=new Vector3(0,length/2,0),shapes=[];
  for(const [a,b]of [[.08,.36],[.36,.67],[.67,.96]]){
    const points=[];
    for(const t of [a,(a+b)/2,b])for(const side of [-.45,.45])for(const dz of [-.012,.012]){
      const p=featherPoint(t,length,width,side,profile).sub(center);p.z+=dz;points.push(p);
    }
    shapes.push({type:'hull',points,maxVertices:13,density:mass*.08,restitution:0,enableContactEvents:true,filter:{categoryBits:2,maskBits:3}});
  }
  return shapes;
}

export function bindFeatherBarbs(material){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec3 featherPaint,featherAccent; varying vec2 featherUv; varying vec3 plumePaint,plumeAccent;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfeatherUv=uv;plumePaint=featherPaint;plumeAccent=featherAccent;');
    shader.fragmentShader='varying vec2 featherUv; varying vec3 plumePaint,plumeAccent;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float lateral=abs(featherUv.x*2.-1.);
      float along=featherUv.y;
      vec3 ink=diffuseColor.rgb*.12;
      vec3 accent=plumeAccent*diffuse;
      vec3 painted=diffuseColor.rgb;
      if(plumePaint.x>.5&&plumePaint.x<1.5){
        float stripe=.5+.5*sin((along-lateral*.07)*62.+plumePaint.y);
        painted=mix(painted,ink,smoothstep(.5,.66,stripe)*.8);
        painted=mix(painted,accent,smoothstep(.9,.98,stripe)*.65);
      }else if(plumePaint.x<2.5&&plumePaint.x>1.5){
        float r=length(vec2((featherUv.x-.5)/.39,(along-.73)/.16));
        float rim=1.-smoothstep(1.02,1.12,r);
        painted=mix(painted,ink,rim);
        painted=mix(painted,vec3(.75,.42,.08)*diffuse,(1.-smoothstep(.88,.98,r))*rim);
        painted=mix(painted,accent,1.-smoothstep(.6,.72,r));
        painted=mix(painted,ink,1.-smoothstep(.28,.42,r));
      }else if(plumePaint.x<3.5&&plumePaint.x>2.5){
        float edging=smoothstep(.76,.9,lateral);
        painted=mix(painted,accent,edging*.85);
        painted=mix(painted,ink,smoothstep(.86,.91,along)*.82);
      }else if(plumePaint.x<4.5&&plumePaint.x>3.5){
        vec2 cell=vec2(featherUv.x*7.,along*24.);
        float grain=fract(sin(dot(floor(cell),vec2(127.1,311.7))+plumePaint.y)*43758.5453);
        float spot=1.-smoothstep(.16,.28,length(fract(cell)-.5));
        painted=mix(painted,mix(ink,vec3(.8,.68,.43)*diffuse,step(.85,grain)),spot*step(.55,grain)*.9);
      }else if(plumePaint.x>4.5){
        painted=mix(painted,accent,smoothstep(.2,.85,along)*.85);
        painted*=.72+.28*sin(along*16.+plumePaint.y)*sin(along*16.+plumePaint.y);
      }
      diffuseColor.rgb=mix(diffuseColor.rgb,painted,plumePaint.z);
      float barb=(featherUv.y-lateral*.055)*92.;
      float aa=max(fwidth(barb),.04);
      float filament=1.-smoothstep(.12-aa,.12+aa,abs(fract(barb)-.5));
      float rachis=1.-smoothstep(.008,.024,lateral);
      diffuseColor.rgb*=.88+.12*filament;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.58,rachis);
    `);
  };
  material.customProgramCacheKey=()=> 'plumage-patterns-and-barbs-v2';
}
