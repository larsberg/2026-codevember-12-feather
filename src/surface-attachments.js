import { Matrix4, Quaternion, Triangle, Vector3 } from 'three';
import { randomFor } from './feather-geometry.js';

// Every follicle stores a real triangle and barycentric weights, not a point
// on a proxy sphere. The same vertex skinning that renders the body moves it.
export function sampleFollicles(geometry,count,seed) {
  const p=geometry.attributes.position,index=geometry.index.array,bounds=geometry.boundingBox;
  const cutoff=bounds.min.y+(bounds.max.y-bounds.min.y)*.48,triangles=[];
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
  let area=0;
  for(let i=0;i<index.length;i+=3){
    const ids=Array.from(index.slice(i,i+3));a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
    normal.crossVectors(b.clone().sub(a),c.clone().sub(a));const weight=normal.length()/2;
    if(weight<1e-8||(a.y+b.y+c.y)/3<cutoff||normal.normalize().y<.15)continue;
    area+=weight;triangles.push({ids,total:area});
  }
  if(!triangles.length)throw Error('The generated mesh has no upper surface for plumage.');
  const random=randomFor(seed),candidates=[];
  for(let i=0;i<count*12;i++){
    const select=random()*area,triangle=triangles.find(t=>t.total>=select),u=Math.sqrt(random()),v=random();
    const barycentric=new Vector3(1-u,u*(1-v),u*v),point=new Vector3();
    triangle.ids.forEach((id,k)=>point.addScaledVector(a.fromBufferAttribute(p,id),barycentric.getComponent(k)));
    if(point.y>=cutoff)candidates.push({ids:triangle.ids,barycentric,point,distance:Infinity});
  }
  // Farthest-point sampling distributes follicles across the shoulders and
  // crown, rather than stacking wide colliders on nearly coincident roots.
  const chosen=[];let next=candidates.reduce((best,c)=>c.point.y>best.point.y?c:best,candidates[0]);
  for(let i=0;i<count;i++){
    if(!next)throw Error('Could not distribute the requested follicles.');
    chosen.push(next);next.distance=-1;
    let farthest;
    for(const candidate of candidates){if(candidate.distance<0)continue;candidate.distance=Math.min(candidate.distance,candidate.point.distanceToSquared(next.point));if(!farthest||candidate.distance>farthest.distance)farthest=candidate;}
    next=farthest;
  }
  return chosen.map(({ids,barycentric,point})=>({ids,barycentric,point}));
}

export function createAttachmentSampler(positions,matrixWorld) {
  const a=new Vector3(),b=new Vector3(),c=new Vector3(),x=new Vector3(),y=new Vector3(),z=new Vector3(),basis=new Matrix4();
  return function sample(attachment,target={position:new Vector3(),rotation:new Quaternion(),normal:new Vector3()}) {
    const {ids,barycentric}=attachment;
    a.fromArray(positions,ids[0]*3).applyMatrix4(matrixWorld);b.fromArray(positions,ids[1]*3).applyMatrix4(matrixWorld);c.fromArray(positions,ids[2]*3).applyMatrix4(matrixWorld);
    target.position.copy(a).multiplyScalar(barycentric.x).addScaledVector(b,barycentric.y).addScaledVector(c,barycentric.z);
    x.copy(b).sub(a).normalize();y.crossVectors(x,c.clone().sub(a)).normalize();z.crossVectors(x,y).normalize();x.crossVectors(y,z).normalize();
    target.normal.copy(y);target.rotation.setFromRotationMatrix(basis.makeBasis(x,y,z));
    return target;
  };
}

export function attachmentAtHit(geometry,hit) {
  const p=geometry.attributes.position,{a,b,c}=hit.face;
  const barycentric=Triangle.getBarycoord(hit.point,new Vector3().fromBufferAttribute(p,a),new Vector3().fromBufferAttribute(p,b),new Vector3().fromBufferAttribute(p,c),new Vector3());
  return {ids:[a,b,c],barycentric,point:hit.point.clone()};
}
