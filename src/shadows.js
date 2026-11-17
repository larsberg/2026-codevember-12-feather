import { Color, Mesh, PlaneGeometry, ShaderLib, ShaderMaterial, UniformsUtils, Vector3 } from 'three';

export function createStageFloor() {
  const shader = ShaderLib.shadow, uniforms = UniformsUtils.clone(shader.uniforms);
  uniforms.opacity.value = .24;
  Object.assign(uniforms,{
    stageSpotPosition:{value:new Vector3()},stageSpotDirection:{value:new Vector3(0,-1,0)},
    stageSpotCone:{value:.8},stageSpotPenumbra:{value:.95},stageSpotPower:{value:1},stageSpotEnabled:{value:0},
    stageSpotColor:{value:new Color('#fff1dc')},
  });
  // No ambient contribution: the unlit stage is black. Shadows multiply
  // the spotlight pool, so they cannot brighten the floor beyond its cone.
  const material = new ShaderMaterial({ name:'Spotlit black stage floor', uniforms, lights: true,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    vertexShader: `varying vec3 stageWorldPosition;\n${shader.vertexShader}`.replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nstageWorldPosition=(modelMatrix*vec4(transformed,1.)).xyz;'),
    fragmentShader: `uniform vec3 stageSpotPosition,stageSpotDirection,stageSpotColor;
      uniform float stageSpotCone,stageSpotPenumbra,stageSpotPower,stageSpotEnabled;
      varying vec3 stageWorldPosition;\n${shader.fragmentShader}`.replace(
      'vec4( color, opacity * ( 1.0 - getShadowMask() ) )',
      `vec4(stageSpotColor*.8*stageSpotEnabled*stageSpotPower*
        smoothstep(stageSpotCone,max(stageSpotCone+.00001,stageSpotPenumbra),
          dot(normalize(stageWorldPosition-stageSpotPosition),stageSpotDirection))*
        (1.-opacity*(1.-getShadowMask())),1.)`),
  });
  const floor = new Mesh(new PlaneGeometry(20000, 20000), material);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.05; floor.receiveShadow = true;
  return floor;
}

const spotPosition=new Vector3(),spotTarget=new Vector3();
export function updateFloorSpotlight(floor,spotlight){
  const uniforms=floor.material.uniforms;
  spotlight.getWorldPosition(spotPosition);spotlight.target.getWorldPosition(spotTarget);
  uniforms.stageSpotPosition.value.copy(spotPosition);
  uniforms.stageSpotDirection.value.copy(spotTarget).sub(spotPosition).normalize();
  uniforms.stageSpotCone.value=Math.cos(spotlight.angle);
  uniforms.stageSpotPenumbra.value=Math.cos(spotlight.angle*(1-spotlight.penumbra));
  uniforms.stageSpotEnabled.value=spotlight.visible&&spotlight.intensity>0?1:0;
  uniforms.stageSpotPower.value=spotlight.intensity/9000;
  uniforms.stageSpotColor.value.copy(spotlight.color);
}

export function createShadowFollow(light, getOffset = () => new Vector3(-8, 24, 12)) {
  const offset = new Vector3(-8, 24, 12), forward = offset.clone().normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize();
  const up = new Vector3().crossVectors(forward, right), anchor = new Vector3();
  return position => {
    offset.copy(getOffset()); forward.copy(offset).normalize();
    right.crossVectors(new Vector3(0, 1, 0), forward);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
    up.crossVectors(forward, right); anchor.copy(position);
    const { camera, mapSize } = light.shadow;
    const dx = (camera.right - camera.left) / (camera.zoom * mapSize.x);
    const dy = (camera.top - camera.bottom) / (camera.zoom * mapSize.y);
    // Keep the shadow texel grid fixed in world space as the camera follows.
    // Otherwise every tiny camera movement resamples the cast silhouette.
    light.target.position.copy(right).multiplyScalar(Math.round(anchor.dot(right) / dx) * dx)
      .addScaledVector(up, Math.round(anchor.dot(up) / dy) * dy)
      .addScaledVector(forward, anchor.dot(forward));
    light.position.copy(light.target.position).add(offset);
  };
}
