import {
  BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshPhysicalMaterial,
  BoxGeometry, PlaneGeometry, CylinderGeometry, LatheGeometry, TubeGeometry,
  CatmullRomCurve3, Vector2, Vector3, Quaternion, DoubleSide,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const MIRROR = { centerY: 12, z: -12, halfWidth: 4, halfHeight: 9, footHeight: 2.85 };
// The original narrow stage spotlight. All receivers use this same real
// light; cloth outside its cone is unlit rather than assigned a separate pool.
export const STAGE_SPOT_TARGET = new Vector3(0, 2, 0);
const up = new Vector3(0, 1, 0);

export function mirrorPanelPose(index, degrees) {
  const angle = degrees * Math.PI / 180;
  return { position: new Vector3(index * (4 + 4 * Math.cos(angle)), MIRROR.centerY, MIRROR.z + Math.abs(index) * 4 * Math.sin(angle)),
    rotation: new Quaternion().setFromAxisAngle(up, -index * angle) };
}

// Share the raised panel and support positions with Box3D. The space beneath
// the glass remains open; the old invisible wall no longer reaches the floor.
export function mirrorColliders(degrees) {
  return [-1, 0, 1].flatMap(index => {
    const pose = mirrorPanelPose(index, degrees);
    const at = p => p.applyQuaternion(pose.rotation).add(pose.position);
    const boxes = [{ position: pose.position, rotation: pose.rotation, halfExtents: { x: 4.17, y: 9.15, z: .22 } }];
    for (const x of [-3.15, 3.15]) {
      boxes.push({ position: at(new Vector3(x, -MIRROR.centerY + 1.48, 0)), rotation: pose.rotation, halfExtents: { x: .28, y: 1.38, z: .28 } });
      boxes.push({ position: at(new Vector3(x, -MIRROR.centerY + .22, 0)), rotation: pose.rotation, halfExtents: { x: .65, y: .22, z: 1.7 } });
    }
    return boxes;
  });
}

function clothGeometry(sample, columns, rows) {
  const vertices = [], uv = [], indices = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns, v = j / rows;
    vertices.push(...sample(u, v)); uv.push(u, v);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeTangents();
  return geometry;
}

function sideDrape(side, u, v) {
  const gather = Math.exp(-(((v - .43) / .15) ** 2));
  const width = 6.1 - 3.2 * gather + .65 * (1 - v) ** 3;
  const x = side * (16 + .85 * gather + (u - .5) * width);
  const phase = u * Math.PI * 12 + .5 * Math.sin(v * Math.PI);
  const fold = (Math.cos(phase) + .16 * Math.cos(phase * 2)) * (.5 - .24 * gather);
  return [x, .12 + v * 25.8 + .055 * (1 - v) ** 12 * Math.cos(phase), -12.9 + 4.2 * (1 - v) ** 2 + fold];
}

export function createDressingRoom(materials) {
  const group = new Group(); group.name = 'Dressing room furniture and satin';
  const mirrors = [], panels = [], feet = [], curtains = [];
  const walnut = new MeshPhysicalMaterial({ color: '#321c16', roughness: .32, metalness: 0, clearcoat: .24, clearcoatRoughness: .3 });
  const satin = new MeshPhysicalMaterial({ color: '#a70b25', roughness: .34, metalness: 0, side: DoubleSide,
    sheen: .7, sheenColor: '#e4374c', sheenRoughness: .32, anisotropy: .7, anisotropyRotation: Math.PI / 2,
    specularIntensity: .65 });
  satin.name = 'Crimson satin'; walnut.name = 'Polished walnut supports';
  function solid(parent, geometry, material, name, position) {
    const mesh = new Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.enable(1);
    if (position) mesh.position.copy(position); parent.add(mesh); return mesh;
  }
  const tube = (parent, points, radius, material, name) => solid(parent,
    new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), 32, radius, 10, false), material, name);

  for (let index = -1; index <= 1; index++) {
    const panel = new Group(); panel.name = `Raised mirror panel ${index + 2}`;
    panel.userData.index = index; group.add(panel); panels.push(panel);
    const mirror = new Reflector(new PlaneGeometry(7.8, 18), { color: 0xc4d0d0,
      textureWidth: 768, textureHeight: 1024, clipBias: .003, multisample: 0 });
    mirror.name = 'Folding mirror reflection'; panel.add(mirror); mirrors.push(mirror);
    const rail = (x, y, w, h, depth = .34) => solid(panel, new BoxGeometry(w, h, depth), materials.pistons, 'Gilt mirror moulding', new Vector3(x, y, .015));
    rail(-4, 0, .3, 18.35); rail(4, 0, .3, 18.35);
    rail(0, 9.15, 8.3, .3); rail(0, -9.15, 8.3, .3);
    // Narrow raised beads give the frame an actual moulded edge.
    for (const x of [-4.08, 4.08]) solid(panel, new CylinderGeometry(.055, .055, 18.4, 10), materials.joints, 'Frame bead', new Vector3(x, 0, .23));
    solid(panel, new BoxGeometry(8.1, 18.3, .18), walnut, 'Mirror backing', new Vector3(0, 0, -.25));
    if (index !== 0) for (const y of [-6, 6]) solid(panel, new CylinderGeometry(.18, .18, .8, 16), materials.joints, 'Folding hinge', new Vector3(index < 0 ? 4 : -4, y, .13));

    for (const x of [-3.15, 3.15]) {
      const foot = new Group(); foot.name = 'Turned furniture leg with splayed feet';
      foot.position.set(x, -MIRROR.centerY, 0); panel.add(foot); feet.push(foot);
      const profile = [[.19, .22], [.27, .38], [.25, .57], [.16, .78], [.15, 1.85], [.22, 2.04], [.28, 2.15], [.26, 2.38], [.21, 2.55], [.23, 2.98]];
      solid(foot, new LatheGeometry(profile.map(p => new Vector2(...p)), 24), walnut, 'Turned walnut spindle');
      for (const y of [.6, 2.12, 2.48]) solid(foot, new CylinderGeometry(.265, .265, .08, 24), materials.joints, 'Brass leg collar', new Vector3(0, y, 0));
      for (const direction of [-1, 1]) {
        tube(foot, [[0, .57, 0], [.12 * Math.sign(x), .44, .48 * direction], [.3 * Math.sign(x), .23, 1.05 * direction], [.34 * Math.sign(x), .18, 1.36 * direction]], .17, walnut, 'Curved splayed shoe');
        const cap = solid(foot, new CylinderGeometry(.24, .27, .14, 24), materials.pistons, 'Brass foot pad', new Vector3(.34 * Math.sign(x), .07, 1.36 * direction));
        cap.scale.z = 1.25;
      }
    }
    solid(panel, new BoxGeometry(6.5, .24, .27), walnut, 'Lower furniture stretcher', new Vector3(0, -MIRROR.centerY + .9, 0));
  }

  const drapery = new Group(); drapery.name = 'Draped red satin curtains'; group.add(drapery);
  function cloth(name, sample, columns, rows) {
    const mesh = solid(drapery, clothGeometry(sample, columns, rows), satin, name); curtains.push(mesh); return mesh;
  }
  cloth('Pleated satin backdrop', (u, v) => {
    const phase = u * Math.PI * 36 + .15 * Math.sin(v * Math.PI * 2 + u * 5);
    return [-19 + u * 38, .08 + v * 25.9, -17.4 + (.42 + .12 * (1 - v) ** 3) * (Math.cos(phase) + .15 * Math.cos(phase * 2))];
  }, 288, 64);
  for (const side of [-1, 1]) {
    const mesh = cloth(`${side < 0 ? 'Left' : 'Right'} gathered satin curtain`, (u, v) => sideDrape(side, u, v), 112, 112);
    // Both orientations face into the room, preserving physically lit folds.
    if (side < 0) { const index = mesh.geometry.index; for (let i = 0; i < index.count; i += 3) { const a = index.getX(i); index.setX(i, index.getX(i + 1)); index.setX(i + 1, a); } mesh.geometry.computeVertexNormals(); mesh.geometry.computeTangents(); }
    const cord = [];
    for (let i = 0; i <= 20; i++) { const u = i / 20, p = sideDrape(side, u, .43); p[1] -= Math.sin(Math.PI * u) * .35; p[2] += .7 + Math.sin(Math.PI * u) * .24; cord.push(p); }
    tube(drapery, cord, .075, materials.joints, 'Curtain tieback cord');
  }
  for (let i = 0; i < 3; i++) {
    cloth('Scalloped satin swag', (u, v) => {
      const belly = Math.sin(Math.PI * u) ** .65;
      return [-19 + (i + u) * 38 / 3, 26 - v * (.65 + 3.25 * belly),
        -15.5 + v * .75 + .19 * Math.cos(u * Math.PI * 20 + v * 4) * (.3 + .7 * belly)];
    }, 128, 28);
  }
  // A sewn heading covers the gathered cut edges and the small openings
  // above the swags when the camera looks up from creature height.
  cloth('Pleated satin heading', (u, v) => [-19.1 + u * 38.2, 25.2 + v * 1.1,
    -12.15 + .09 * Math.cos(u * Math.PI * 72)], 288, 8);
  const rod = solid(drapery, new CylinderGeometry(.13, .13, 39.1, 16), materials.pistons, 'Curtain pole', new Vector3(0, 26.15, -15.7)); rod.rotation.z = Math.PI / 2;

  // Preserve planar reflections without recursive mirror renders.
  let reflecting = false;
  for (const mirror of mirrors) {
    const draw = mirror.onBeforeRender;
    mirror.onBeforeRender = function (...args) {
      if (reflecting) return;
      reflecting = true; const visible = mirrors.map(m => m.visible); mirrors.forEach(m => m.visible = false);
      try { draw.apply(this, args); } finally { mirrors.forEach((m, i) => m.visible = visible[i]); reflecting = false; }
    };
  }
  return { group, mirrors, feet, curtains,
    configure(settings, scene) {
      for (const panel of panels) { const pose = mirrorPanelPose(panel.userData.index, settings.feather.mirrorAngle); panel.position.copy(pose.position); panel.quaternion.copy(pose.rotation); }
      for (const material of [satin, walnut]) {
        material.envMap = scene.environment;
        // Cloth shading comes from the scene lights and their shadow maps.
        // The studio reflection environment remains available to polished wood.
        material.envMapIntensity = material===satin?0:settings.lighting.environment.enabled ? settings.lighting.environment.intensity * .65 : 0;
        material.envMapRotation.y = settings.lighting.environment.rotation * Math.PI / 180;
      }
    },
  };
}
