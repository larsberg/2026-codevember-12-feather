import { Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import { initCSG, createBoxUnion } from './caustic-mesh/box-union.js';
import { createMeshLayers } from './caustic-mesh/mesh-layers.js';
import { triangulateFace } from './caustic-mesh/mesh-operations.js';
export { initCSG };

// Caustic's actual October 29 source pipeline, generated afresh instead of
// substituting primitives or replaying its three baked meshes.
export function createCreatureMesh(settings, seed) {
  const source=createBoxUnion(seed,settings.mesh.spread);
  const layers=createMeshLayers(source.mesh,{...settings.pipeline,seed});
  const bounds=new Box3().setFromPoints(layers.mesh.vertices.map(v=>new Vector3(...v)));
  const size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());
  const scale=settings.mesh.size/Math.max(size.x,size.y,size.z);
  const convert=v=>new Vector3(...v).sub(center).multiplyScalar(scale).toArray();
  const topology={...layers.mesh,vertices:layers.mesh.vertices.map(convert)};
  const boxes=source.boxes.map(box=>({...box,position:convert(box.position),size:box.size.map(v=>v*scale)}));
  const binding={...source,boxes,overlaps:source.overlaps.map(edge=>({...edge,anchor:convert(edge.anchor),volume:edge.volume*scale**3}))};
  const triangles=topology.faces.flatMap(face=>triangulateFace(topology,face).flat());
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(topology.vertices.flat(),3));
  geometry.setIndex(triangles);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {source:binding,topology,geometry,layers:layers.stages,scale,
    provenance:'10-caustic / 2026-10-29 CSG + polygon layers + five fitted hulls'};
}
