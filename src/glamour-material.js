import {
  Color, DataTexture, Euler, LinearFilter, LinearMipmapLinearFilter, Matrix3, Matrix4,
  MeshPhysicalMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector3,
} from 'three';
import { randomFor } from './feather-geometry.js';
import { applyMaterialSettings } from './material-settings.js';

// Seven finishes run against six crest families so the combinations keep changing.
export const GLAMOUR_FINISHES = [
  { name: 'nacre', roughness: 1.05, metalness: .55, iridescence: .95, coat: 1, coatRoughness: .24, sheen: .22, normalMix: .4 },
  { name: 'ribbon-lacquer', roughness: .75, metalness: 1.5, iridescence: .45, coat: 1, coatRoughness: .1, sheen: .14, normalMix: .24 },
  { name: 'petrol-pearl', roughness: .65, metalness: 3.5, iridescence: 1, coat: 1, coatRoughness: .08, sheen: .12, normalMix: .34 },
  { name: 'opal-marble', roughness: .9, metalness: .6, iridescence: .85, coat: .95, coatRoughness: .16, sheen: .24, normalMix: .42 },
  { name: 'gilt-pinstripe', roughness: .8, metalness: 3, iridescence: .4, coat: 1, coatRoughness: .12, sheen: .16, normalMix: .2 },
  { name: 'confetti-enamel', roughness: .8, metalness: 1.6, iridescence: .65, coat: 1, coatRoughness: .11, sheen: .18, normalMix: .28 },
  { name: 'holographic-satin', roughness: 1.1, metalness: 1.3, iridescence: 1, coat: .75, coatRoughness: .2, sheen: .5, normalMix: .36 },
];
const TAU = Math.PI * 2, clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const blend = (a, b, t) => a.map((v, i) => mix(v, b[i], clamp(t)));
function hsl(h, s, l) {
  const color = new Color().setHSL((h % 1 + 1) % 1, s, l, SRGBColorSpace), rgb = {};
  color.getRGB(rgb, SRGBColorSpace); return [rgb.r, rgb.g, rgb.b];
}

function makeTexture(pixels, size, name, color = false) {
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.name = name; texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4;
  if (color) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function paintTextures(recipe) {
  const size = 256, color = new Uint8Array(size * size * 4), finish = new Uint8Array(size * size * 4);
  const { family, hue, phases, bands, seed } = recipe;
  const jewel = hsl(hue, .82, .43), accent = hsl(hue + .3, .86, .58), pale = hsl(hue + .12, .34, .86);
  const ivory = [.98, .94, .86], gold = [1, .72, .31], violet = hsl(hue + .46, .62, .73), deep = hsl(hue + .1, .8, .22);
  const pearl = [.8, .76, .7], pearlBlue = hsl(hue + .12, .5, .64), pearlRose = hsl(hue + .46, .45, .71);
  const hash = (x, y) => { let n = Math.imul(x + seed, 374761393) ^ Math.imul(y, 668265263); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    // Integer-frequency waves tile cleanly in each triplanar projection.
    const flow = .5 * Math.sin(TAU * (u + v) + phases[0]) + .25 * Math.sin(TAU * (3 * u - 2 * v) + phases[1]) + .125 * Math.cos(TAU * (5 * u + 3 * v) + phases[2]);
    const phase = TAU * (bands * u + 2 * v + .3 * flow) + phases[3];
    const wave = .5 + .5 * Math.sin(phase), cloud = .5 + .5 * Math.sin(TAU * (u - v) + flow * 2 + phases[1]);
    const line = Math.exp(-(Math.sin(phase) ** 2) * 130);
    let rgb, gloss = .5, foil = .08, film = clamp(.5 + flow * .45);
    if (family === 'nacre') {
      rgb = blend(pearl, blend(pearlBlue, pearlRose, cloud), .4 + .5 * wave);
      gloss = .35 + wave * .3; film = .15 + .8 * cloud;
    } else if (family === 'ribbon-lacquer') {
      const ribbon = clamp((wave - .28) / .44);
      rgb = blend(jewel, accent, ribbon); rgb = blend(rgb, gold, line * .8);
      foil = line; gloss = .22 + .52 * ribbon; film = .15 + .7 * cloud;
    } else if (family === 'petrol-pearl') {
      rgb = blend(deep, jewel, cloud); rgb = blend(rgb, accent, wave * .22);
      gloss = .25 + .3 * wave; foil = .45 + cloud * .5; film = wave;
    } else if (family === 'opal-marble') {
      const marble = .5 + .5 * Math.sin(TAU * (2 * u + v) + flow * 7);
      const vein = Math.exp(-(((marble - .5) / .045) ** 2));
      rgb = blend(ivory, blend(accent, pale, cloud), .22 + .55 * marble); rgb = blend(rgb, jewel, vein * .7);
      gloss = .35 + .4 * marble; foil = vein * .45; film = marble;
    } else if (family === 'gilt-pinstripe') {
      const stripe = Math.exp(-(Math.sin(phase + .23) ** 2) * 180), silk = .5 + .5 * Math.sin(phase * 2);
      rgb = blend(jewel, violet, silk * .3); rgb = blend(rgb, gold, Math.max(line, stripe) * .95);
      foil = Math.max(line, stripe); gloss = .6 - foil * .45; film = .2 + .6 * cloud;
    } else if (family === 'confetti-enamel') {
      const cells = 28, cx = Math.floor(u * cells), cy = Math.floor(v * cells), fleck = hash(cx, cy);
      const dx = u * cells - cx - .5, dy = v * cells - cy - .5;
      const dot = Math.exp(-(dx * dx + dy * dy) * 38) * (fleck > .56 ? 1 : 0);
      rgb = blend(jewel, accent, cloud * .65); rgb = blend(rgb, fleck > .8 ? gold : ivory, dot * .9);
      foil = dot; gloss = .38 - dot * .2; film = .2 + wave * .65;
    } else {
      const weave = .5 + .5 * Math.sin(TAU * (5 * u - 4 * v) + flow * 2);
      rgb = blend(pale, blend(jewel, accent, wave), .42 + .28 * weave);
      gloss = .45 + .25 * weave; foil = .25; film = .15 + .85 * wave;
    }
    const i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) color[i + c] = Math.round(clamp(rgb[c]) * 255);
    color[i + 3] = 255;
    finish[i] = Math.round(clamp(film) * 255);
    finish[i + 1] = Math.round(clamp(gloss) * 255);
    finish[i + 2] = Math.round(clamp(foil) * 255);
    finish[i + 3] = Math.round((.55 + .45 * cloud) * 255);
  }
  return [makeTexture(color, size, `${family} color / ${seed}`, true), makeTexture(finish, size, `${family} surface / ${seed}`)];
}

export function createGlamourMaterial(seed, generation, size) {
  const random = randomFor(seed ^ 0x69c8b57d), family = GLAMOUR_FINISHES[generation % GLAMOUR_FINISHES.length];
  const recipe = { seed, family: family.name, hue: (.53 + generation * .137 + random() * .1) % 1,
    bands: 3 + Math.floor(random() * 4), phases: Array.from({ length: 4 }, () => random() * TAU) };
  const textures = paintTextures(recipe);
  const material = new MeshPhysicalMaterial({ name: `${family.name} / creature ${seed}`, clearcoat: family.coat,
    clearcoatRoughness: family.coatRoughness, iridescence: family.iridescence, iridescenceIOR: 1.3 + random() * .12,
    iridescenceThicknessRange: [160 + random() * 70, 480 + random() * 220],
    sheen: family.sheen, sheenRoughness: .35, sheenColor: new Color().setHSL((recipe.hue + .2) % 1, .35, .78),
    ior: 1.48, specularIntensity: .85 });
  material.userData.normalMix = family.normalMix;
  const projection = new Matrix3().setFromMatrix4(new Matrix4().makeRotationFromEuler(new Euler(random() * .6, random() * .8, random() * .9)));
  const uniforms = {
    glamourColorMap: { value: textures[0] }, glamourFinishMap: { value: textures[1] },
    glamourProjection: { value: projection }, glamourScale: { value: (1.1 + random() * .35) / size },
    glamourOffset: { value: new Vector3(random(), random(), random()) },
    glamourRoughness: { value: family.roughness }, glamourMetalness: { value: family.metalness },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform mat3 glamourProjection; uniform float glamourScale; uniform vec3 glamourOffset;
      varying vec3 vGlamourPosition; varying vec3 vGlamourNormal;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      // Sample the bind pose, before skinning: paint stays on its vertices.
      vGlamourPosition=glamourProjection*position*glamourScale+glamourOffset;
      vGlamourNormal=glamourProjection*normal;`);
    shader.fragmentShader = `uniform sampler2D glamourColorMap,glamourFinishMap;
      uniform float glamourRoughness,glamourMetalness;
      varying vec3 vGlamourPosition; varying vec3 vGlamourNormal;
      vec4 glamourTriplanar(sampler2D map,vec3 p,vec3 weights){
        return texture2D(map,p.yz)*weights.x+texture2D(map,p.zx)*weights.y+texture2D(map,p.xy)*weights.z;
      }\n` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 glamourWeights=pow(abs(normalize(vGlamourNormal)),vec3(5.));
      glamourWeights/=max(dot(glamourWeights,vec3(1.)),.0001);
      vec4 glamourSurface=glamourTriplanar(glamourFinishMap,vGlamourPosition,glamourWeights);
      diffuseColor.rgb*=glamourTriplanar(glamourColorMap,vGlamourPosition,glamourWeights).rgb;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor*glamourRoughness*mix(.65,1.3,glamourSurface.g),.045,1.);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor=clamp(metalnessFactor*glamourMetalness*mix(.8,1.65,glamourSurface.b),0.,1.);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_IRIDESCENCE
        material.iridescence*=mix(.65,1.,glamourSurface.a);
        material.iridescenceThickness=mix(iridescenceThicknessMinimum,iridescenceThicknessMaximum,glamourSurface.r);
      #endif
      #ifdef USE_CLEARCOAT
        material.clearcoatRoughness=clamp(material.clearcoatRoughness*mix(.75,1.2,glamourSurface.g),.0525,1.);
      #endif`);
  };
  // Uniforms and textures differ per creature; the GPU program can be reused.
  material.customProgramCacheKey = () => 'glamour-skin-triplanar-v1';
  let disposed = false;
  return { material, textures, recipe,
    configure(values) {
      applyMaterialSettings(material,values,'panels');
      material.clearcoatRoughness = Math.max(.055, Math.min(.9, family.coatRoughness + (values.roughness - .3) * .7));
    },
    get diagnostics() { return { family: family.name, seed, materialId: material.uuid, textureIds: textures.map(t => t.uuid), clearcoat: material.clearcoat, iridescence: material.iridescence, disposed }; },
    dispose() {
      if (disposed) return; disposed = true;
      uniforms.glamourColorMap.value = uniforms.glamourFinishMap.value = null;
      textures.forEach(texture => texture.dispose()); material.dispose();
    },
  };
}
