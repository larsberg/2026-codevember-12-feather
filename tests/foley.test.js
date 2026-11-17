import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSetup, validateSetup } from '../src/settings.js';
import { FeatherSimulation, initPhysics } from '../src/feather-simulation.js';
import { FOLEY_DURATIONS, FOLEY_LIMITS, foleySamples, loadFeatherSounds } from '../src/feather-sounds.js';
await initPhysics();

test('foley follows real landings and foot contacts, leaving inspection holds quiet', () => {
  const simulation = new FeatherSimulation(defaultSetup()), events = [];
  const checkContacts = simulation.physics.onAfterStep(() => {
    for (const event of simulation.foley.queue.filter(e => e.effect === 'foot' && e.time === simulation.foley.time)) {
      assert.ok([...simulation.foley.arms.values()].some(a => a.played && simulation.foley.grounded.has(a.id)));
    }
  });
  try {
    for (let frame = 0; frame < 12 * 60; frame++) { simulation.update(1 / 60); events.push(...simulation.foley.drain()); }
    const landings = events.filter(e => e.effect === 'landing');
    assert.equal(landings.length, 1);
    assert.ok(Math.abs(landings[0].time - simulation.landedAt) < .03);
    assert.equal(events.filter(e => e.effect === 'air').length, 1);
    assert.ok(events.filter(e => e.effect === 'foot').length >= 12);
    assert.ok(events.some(e => e.effect === 'pivot'));
    assert.ok(events.some(e => e.effect === 'brush'));
    assert.ok(events.every(e => e.effect && !('voices' in e)), 'no old beat-note events');
    assert.equal(events.filter(e => e.time > 1 && e.time < 1.5).length, 0, 'a settled hold adds no background hiss');
    assert.ok(events.filter(e => ['glass', 'wood'].includes(e.effect)).length === 0, 'looking at the mirror makes no contact sound');
    for (let frame = 0; frame < 60; frame++) simulation.update(0);
    assert.deepEqual(simulation.foley.drain(), [], 'pause does not generate or replay gestures');
    assert.ok(events.every(e => e.power > 0 && e.power <= 1 && Number.isFinite(e.rate)));
  } finally { checkContacts(); simulation.dispose(); }
});

test('foley textures are deterministic, distinct, bounded, and have silent sample edges', () => {
  const roughness = data => {
    let energy = 0, difference = 0;
    for (let i = 1; i < data.length; i++) { energy += data[i] ** 2; difference += (data[i] - data[i - 1]) ** 2; }
    return difference / energy;
  };
  for (const kind of Object.keys(FOLEY_DURATIONS)) {
    const a = foleySamples(kind), b = foleySamples(kind), c = foleySamples(kind, 1);
    assert.deepEqual(a, b); assert.notDeepEqual(a, c);
    assert.equal(Math.abs(a[0]), 0); assert.equal(Math.abs(a.at(-1)), 0);
    assert.ok(a.every(x => Number.isFinite(x) && Math.abs(x) < .651));
    assert.ok(a.some(x => Math.abs(x) > .2));
  }
  assert.ok(roughness(foleySamples('brush')) > roughness(foleySamples('landing')) * 3,
    'fine feather friction is spectrally distinct from a cushioned body impact');
});

function fakeAudio() {
  const registered = new Map(), calls = [], sources = [];
  const context = { sampleRate: 16000, currentTime: 0, state: 'running',
    createBuffer(channels, length, sampleRate) { return { length, duration: length / sampleRate, copyToChannel() {} }; },
    createGain() { return { gain: { value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; },
    createBufferSource() { const s = { playbackRate: {}, connect() {}, disconnect() {}, start() {}, stop(at) { if(at<=context.currentTime)this.onended?.(); } }; sources.push(s); return s; },
  };
  const api = { registerSound(name, callback) { registered.set(name, callback); },
    async superdough(value, time, duration) { calls.push({ value, time, duration }); registered.get(value.s)(time, value, () => {}); },
  };
  return { context, api, calls, sources };
}

test('native Strudel sample voices respect mute, event masks, gain, concurrency and disposal', async () => {
  const { context, api, calls, sources } = fakeAudio(), sounds = await loadFeatherSounds(api, context);
  const setup = defaultSetup().audio, positions = new Float64Array(48);
  sounds.configure(setup);
  const play = event => sounds.play({ effect:'brush', voice:1, power:.5, ...event }, setup.volume, setup.voices, positions, 0);
  try {
    for (let i = 0; i < 30; i++) await play({});
    assert.equal(sounds.diagnostics.voices, FOLEY_LIMITS.voices - 1, 'reserve one voice for a physical impact');
    assert.equal(await play({ effect:'landing', voice:0 }), true);
    assert.equal(sounds.diagnostics.voices, FOLEY_LIMITS.voices);
    assert.ok(calls.every(c => c.value.s.startsWith('feather_') && !('note' in c.value)));
    setup.volume = 0; sounds.configure(setup);
    assert.equal(await play({}), false);
    sounds.stop(); assert.equal(sounds.diagnostics.voices, 0);
    setup.volume = .7; setup.voices[1].enabled = false; sounds.configure(setup);
    assert.equal(await play({}), false);
    setup.voices[1].enabled = true; setup.voices[1].rhythm = '.'; sounds.configure(setup);
    assert.equal(await play({}), false);
    setup.voices[1].rhythm = 'x'; context.currentTime = 1;
    assert.equal(await play({}), true);
    sounds.dispose(); assert.equal(sounds.diagnostics.voices, 0); assert.equal(sounds.diagnostics.bufferBytes, 0);
    assert.equal(await play({}), false); assert.ok(sources.length > 0);
  } finally { sounds.dispose(); }
});

test('foley migration preserves saved sound preferences and unrelated scene settings', () => {
  const old = defaultSetup(); old.version = 10;
  old.audio.volume = .77; old.audio.enabled = false; old.audio.tempo = 96;
  old.audio.voices[0].level = .38; old.audio.voices[0].attack = .02;
  old.audio.voices[1].level = .18; old.audio.voices[1].lowpass = 1200; old.audio.voices[1].attack = .04;
  old.lighting.spotlight.height = 59.9;
  const next = validateSetup(old);
  assert.equal(next.audio.enabled, false); assert.equal(next.audio.volume, .77); assert.equal(next.audio.tempo, 96);
  assert.deepEqual(next.audio.voices, defaultSetup().audio.voices);
  assert.deepEqual(next.lighting, old.lighting); assert.deepEqual(next.camera, old.camera);
  assert.equal(old.audio.voices[1].lowpass, 1200, 'the saved input is not mutated');
  old.audio.voices[1].lowpass = 4200; old.audio.voices[0].level = .23;
  const custom = validateSetup(old);
  assert.equal(custom.audio.voices[1].lowpass, 4200); assert.equal(custom.audio.voices[0].level, .23);
  assert.deepEqual(validateSetup(custom), custom);
});
