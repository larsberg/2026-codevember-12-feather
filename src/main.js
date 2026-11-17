import { attachPlayerBridge } from './player-bridge.js';
// Studio shell inherited from 11-rust; Feather replaces the subject.
import './style.css';
import './mesh-style.css';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PCFShadowMap,
  MOUSE, TOUCH, PerspectiveCamera, PMREMGenerator, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyCameraView, captureCameraView, configureOrbitInputs, createCameraFollow } from './camera.js';
import { initPhysics, FeatherSimulation } from './feather-simulation.js';
import { createFeatherView } from './feather-view.js';
import { createControls } from './controls.js';
import { defaultSetup, validateSetup, DEFAULT_CAMERA } from './settings.js';
import { requestSetup } from './persistence.js';
import { libraryPalettes } from './palette-library.js';

import { createStageFloor, createShadowFollow, updateFloorSpotlight } from './shadows.js';
import { bindLightingControls } from './lighting-controls.js';
import { bindMaterialControls } from './material-controls.js';
import { materialGroups } from './material-settings.js';
import { createSceneEffects } from './scene-effects.js';
import { createAudio } from './score.js';
import { featherBeatEvents } from './feather-score.js';
import { GenerationScore } from './generation-score.js';



let settings = defaultSetup(), setupLoadError;
try { settings = await requestSetup(); } catch (error) { setupLoadError = error.message; console.warn(error.message); }
await initPhysics();
const canvas = document.querySelector('canvas');
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene(); scene.background = new Color(settings.studio.background);
// Preserve the studio camera range.
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, .1, 900);
const orbit = new OrbitControls(camera, canvas);
configureOrbitInputs(orbit);
orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
orbit.enablePan = true; orbit.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
orbit.minDistance = 5; orbit.maxDistance = 600; orbit.minPolarAngle = .09; orbit.maxPolarAngle = Math.PI - .09;
orbit.enableDamping = true; orbit.dampingFactor = .07;
const focus = new Vector3(), follow = createCameraFollow();
const pmrem = new PMREMGenerator(renderer), room = new RoomEnvironment();
let environmentBlur = settings.lighting.environment.blur;
let environment = pmrem.fromScene(room, environmentBlur); scene.environment = environment.texture;
function configureEnvironment() {
  const blur = settings.lighting.environment.blur;
  if (blur === environmentBlur) return;
  const previous = environment;
  environment = pmrem.fromScene(room, blur); environmentBlur = blur;
  scene.environment = environment.texture;
  for (const material of Object.values(surface.materials)) material.envMap = environment.texture;
  previous.dispose();
}
const hemisphere = new HemisphereLight('#fff8ed', '#7e8b9d', 1.4); scene.add(hemisphere);
const light = new DirectionalLight('#fff5df', 3.1);
light.position.set(-8, 18, 10); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: .5, far: 900 });
light.shadow.camera.updateProjectionMatrix();
light.shadow.bias = -.00015; light.shadow.normalBias = .04; light.shadow.radius = 3;
scene.add(light, light.target);
const lightOffset = new Vector3();
const followShadow = createShadowFollow(light, () => { const l = settings.lighting.directional; return lightOffset.set(l.offsetX, l.height, l.offsetZ); });
const fill = new DirectionalLight('#c0e4ff', 1.1); fill.position.set(12, 8, -10);
fill.shadow.mapSize.set(2048, 2048); Object.assign(fill.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: .5, far: 900 });
fill.shadow.camera.updateProjectionMatrix();
scene.add(fill, fill.target);
const spotlight = new SpotLight(); spotlight.shadow.mapSize.set(2048, 2048);
spotlight.shadow.camera.near = 1; spotlight.shadow.camera.far = 240; scene.add(spotlight, spotlight.target);
const effects = createSceneEffects(renderer, scene, camera, { clampBeauty: false });
const floor = createStageFloor();scene.add(floor); floor.layers.enable(1);
const palette = () => libraryPalettes(settings.paletteLibrary).find(p => p.id === settings.paletteId);
const generationScore=new GenerationScore(settings.cadence,settings.audio.tempo);

const audio = createAudio({synthLevel:.25,synthMaxVoices:6,modulationHz:25,
  onError: message => console.warn(message), onStatus: state => controls?.audioStatus(state) });
let simulation, surface, controls, materialControls, lightingControls, rigKey, revision = 0, simulationMilliseconds = 0, generation = 0;
const keyForRig = () => JSON.stringify([settings.feather,settings.mesh,settings.pipeline]);
function rebuild({resetScore=true}={}) {
  const next = new FeatherSimulation(settings,generation);
  surface?.dispose(); simulation?.dispose();
  simulation = next; surface = createFeatherView(scene, simulation);
  if(resetScore)generationScore.reset();
  rigKey = keyForRig(); revision++;
  floor.position.y = simulation.floor;
  simulation.getCenter(focus); follow.reset(focus);
  applyCameraView(settings.camera, camera, orbit, follow.position);
  surface.configure(settings, palette()); surface.update(camera);
}
function configure(restoreCamera = false) {
  if (rigKey !== keyForRig()) rebuild(); else simulation.configure(settings);
  generationScore.configure(settings.cadence,settings.audio.tempo);
  scene.background.set(settings.studio.background);floor.material.uniforms.opacity.value=settings.studio.shadowOpacity;
  materialControls?.set(settings.materials);
  configureEnvironment();
  surface.configure(settings, palette());
  audio.update(0, settings.motion.playing && !document.hidden, simulation.position.subarray(0, 48), simulation.floor); audio.configure(settings.audio);
  lightingControls?.set(settings.lighting);
  renderer.toneMappingExposure = settings.studio.exposure;
  for(const source of [light,fill,spotlight])source.shadow.intensity=Math.min(1,settings.studio.shadowOpacity/.24);
  effects.configure(settings.lighting.occlusion); effects.configureBloom(settings.bloom); effects.configureFocus(settings.focus);
  if (restoreCamera) applyCameraView(settings.camera, camera, orbit, follow.position);
  controls?.set(settings);
}
function render() {
  surface.update(camera,0,settings.motion.playing && !document.hidden);
  lightingControls?.updatePosition(follow.position);
  spotlight.target.position.y=2;
  updateFloorSpotlight(floor,spotlight);
  followShadow(follow.position); effects.render(follow.position);
}
function togglePlaying() {
  settings.motion.playing = !settings.motion.playing;

  simulation.configure(settings); controls.set(settings);
}
function setSoundEnabled(enabled) {
  settings.audio.enabled = enabled; audio.configure(settings.audio); controls.set(settings); controls.status('Unsaved changes');
  if (enabled) void audio.unlock();
}
function toggleSound() { setSoundEnabled(!settings.audio.enabled); }
function change(group, key, value) {
  const previous = structuredClone(settings);
  settings[group][key] = value;
  try {
    settings = validateSetup(settings);
    configure(group === 'camera'); controls.status('Unsaved changes');
    if (group === 'audio' && key === 'enabled' && value) audio.unlock().catch(error => controls.status(error.message, true));
  } catch (error) { settings = previous; configure(); controls.status(error.message, true); }
}
const controlActions = { settings, change,
  async save() {
    settings.camera = captureCameraView(camera, orbit, follow.position);
    const saved = await requestSetup('PUT', settings);
    controls.status(`${import.meta.env.PROD ? 'Saved on this device.' : 'Saved to public/settings.json.'} Sound ${saved.audio.enabled ? 'on' : 'off'}.`);
  },
  async reload() {
    const next = await requestSetup(); document.activeElement?.blur(); settings = next; rebuild(); configure(true); controls.syncPalette(); controls.status('Settings reloaded.');
  },
  reset() { generation=0; settings = defaultSetup(); rebuild(); configure(true); controls.syncPalette(); controls.status('Default settings restored.'); },
  regenerate() { generation++; rebuild(); configure(true); },
  resetView() { settings.camera = { ...DEFAULT_CAMERA }; configure(true); },
  selectPalette(id) { settings.paletteId = id; configure(); },
  changeLibrary(library) { settings.paletteLibrary = library; configure(); },
  exportDrawing() {
    render();
    canvas.toBlob(blob => {
      if (!blob) { controls.status('Could not export the image.', true); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = '12-feather.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  },
  togglePlaying, toggleSound, setSoundEnabled,
};
controls = createControls(controlActions);
configure(true);
// Editors retain live references across creature generations.
const editableMaterials = Object.fromEntries(materialGroups.map(([key]) => [key, null]));
for (const [key] of materialGroups) Object.defineProperty(editableMaterials, key, { enumerable: true, get: () => surface.materials[key] });
materialControls = bindMaterialControls(controls.element, editableMaterials, () => {
  settings.materials = materialControls.get(); settings = validateSetup(settings); configure(); controls.status('Unsaved changes');
});
lightingControls = bindLightingControls(controls.element, light, hemisphere, editableMaterials, () => settings.materials,
  () => { settings.lighting = lightingControls.get(); settings = validateSetup(settings); configure(); controls.status('Unsaved changes'); },
  effects.configure, () => {}, settings.lighting, spotlight, fill);
configure(true);
if (setupLoadError) controls.status(setupLoadError, true);
// Pointer gestures belong entirely to OrbitControls. A gesture may unlock audio.
canvas.addEventListener('pointerdown', () => {
  if(settings.audio.enabled) void audio.unlock().catch(error=>controls.status(error.message,true));
});
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); effects.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 50 : 42;
  camera.zoom = Math.min(1, innerWidth / innerHeight); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
orbit.addEventListener('end', () => { settings.camera = captureCameraView(camera, orbit, follow.position); controls.set(settings); });
let previous = performance.now(), wasRunning = false;
function advanceScene(dt){
  const phrase=generationScore.advance(dt);
  let elapsed=0;
  for(const event of phrase.events){
    simulation.update(event.offset-elapsed);
    generation++;rebuild({resetScore:false});configure();
    elapsed=event.offset;
  }
  simulation.update(dt-elapsed);
  return featherBeatEvents(phrase.from*4,phrase.to*4,settings.audio.tempo);
}
renderer.setAnimationLoop(now => {
  const running = settings.motion.playing && !document.hidden, dt = wasRunning ? Math.min((now - previous) / 1000, 1 / 15) : 0;
  let events=[];
  if (running) {
    const start = performance.now(); events=advanceScene(dt); simulationMilliseconds = performance.now() - start;
  }
  surface.update(camera,dt,running);
  audio.update(dt,running,simulation.position,simulation.floor,events);
  wasRunning = running; previous = now;
  simulation.getCenter(focus);
  if (running) follow.update(camera, orbit, focus, true, false, dt, .45);
  orbit.update(); render(); controls.frame(simulation.stats, audio.modulation);
});
document.addEventListener('visibilitychange', () => {
  previous = performance.now(); wasRunning = false;
  audio.update(0, false);
});
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null); audio.dispose(); lightingControls.dispose(); effects.dispose(); surface.dispose(); simulation.dispose(); orbit.dispose();
  floor.geometry.dispose(); floor.material.dispose();
  for(const source of [light,fill,spotlight])source.shadow.dispose();
  environment.dispose(); room.dispose(); pmrem.dispose(); renderer.dispose();
  window.removeEventListener('resize',resize);
}, { once: true });
window.__featherSketch = {
  getSetup: () => structuredClone(settings),
  getState: () => ({ ...simulation.stats, playing: settings.motion.playing, feather: surface.diagnostics,
    audioEngine: 'Strudel', audioUnlocked: audio.unlocked, audio: audio.diagnostics, cadence:generationScore.diagnostics, simulationMilliseconds, revision }),
  renderer, scene, camera, orbit, effects, lights: { directional: light, hemisphere, spotlight, fill }, get simulation() { return simulation; }, get view() { return surface; },
  get audioAnalysis() { return audio.analysis; }, render, change, rebuild() { rebuild(); configure(true); },
  advance(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) { advanceScene(1 / 60); surface.update(camera,1/60,true); } render(); },
  regenerate() { controlActions.regenerate(); },
  pause() { if (settings.motion.playing) togglePlaying(); },
  play() { if (!settings.motion.playing) togglePlaying(); },
};

// Reuse the existing drawer actions for the gallery's sketch-player:v1 contract.
Object.assign(window.__featherSketch, {
  reset() {
    controlActions.reset();
  },
  setup(value) {
    settings = validateSetup(value); rebuild(); configure(true); controls.syncPalette();
    return window.__featherSketch.getSetup();
  },
  async saveSetup() { await controlActions.save(); return window.__featherSketch.getSetup(); },
  async loadSetup() { await controlActions.reload(); return window.__featherSketch.getSetup(); },
});
const detachPlayerBridge = attachPlayerBridge(window.__featherSketch);
window.addEventListener('pagehide', detachPlayerBridge, { once: true });
