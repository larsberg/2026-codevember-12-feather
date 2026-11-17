const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const speed = v => Math.hypot(v.x, v.y, v.z);

// Simulation-time events: no audible metronome, timers, or collider-per-click audio.
export class CreatureFoley {
  constructor(simulation) {
    this.simulation = simulation; this.time = 0; this.queue = []; this.pending = [];
    this.last = new Map(); this.counts = {}; this.recent = []; this.serial = 0;
    this.randomState = simulation.seed ^ 0x9e3779b9;
    this.shapes = new Map(); this.grounded = new Set(); this.velocity = new Map(); this.arms = new Map();
    const tag = (entry, value) => entry.shapes.forEach(shape => {
      if (value.kind === 'body' || value.kind === 'floor') shape.enableContactEvents(true);
      this.shapes.set(shape.getUserData(), { ...value, entry });
    });
    tag(simulation.floorBody, { kind: 'floor' });
    simulation.furnitureBodies.forEach(({ entry, kind }) => tag(entry, { kind }));
    simulation.meshRig.entries.forEach(entry => tag(entry, { kind: 'body' }));
    simulation.rig.forEach(entry => tag(entry, { kind: 'feather' }));
    this.footIds = new Map(simulation.motion.feet.map(link => [link, link.entry.shapes[0].getUserData()]));
    const mean = key => simulation.rig.reduce((n, f) => n + f[key], 0) / simulation.rig.length;
    this.identity = { size: simulation.settings.mesh.size, length: mean('length'), width: mean('width') || simulation.settings.feather.width,
      rate: clamp((7.2 / simulation.settings.mesh.size) ** .22 * (.94 + this.random() * .12), .75, 1.2) };
  }
  random() { this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0; return this.randomState / 4294967296; }
  emit(effect, power, position, cooldown = 0, extra = {}) {
    if (!(power > .015) || this.time - (this.last.get(effect) ?? -Infinity) < cooldown) return;
    this.last.set(effect, this.time);
    const feather = ['air', 'brush', 'flutter', 'body'].includes(effect);
    const event = { effect, power: clamp(power), voice: feather ? 1 : 0, serial: this.serial++, time: this.time,
      generation: this.simulation.generation, variant: Math.floor(this.random() * 6),
      rate: this.identity.rate * (feather ? clamp((8 / this.identity.length) ** .15, .8, 1.2) : 1) * (.96 + this.random() * .08),
      brightness: feather ? clamp((.7 / this.identity.width) ** .3, .7, 1.3) : 1,
      position: [position?.x ?? 0, position?.y ?? 4, position?.z ?? 0], ...extra };
    this.queue.push(event); this.counts[effect] = (this.counts[effect] ?? 0) + 1;
    this.recent.push(event); if (this.recent.length > 32) this.recent.shift();
  }
  beforeStep(dt, bottom) {
    this.time += dt;
    const s = this.simulation, m = s.motion;
    for (const entry of s.meshRig.entries) this.velocity.set(entry, entry.body.getLinearVelocity());
    if (!this.landed && !this.air) {
      const fall = Math.max(0, ...[...this.velocity.values()].map(v => -v.y)), g = Math.max(.001, s.settings.physics.gravity);
      const remaining = (Math.sqrt(fall * fall + 2 * g * Math.max(0, bottom)) - fall) / g;
      if (fall > 2 && remaining < .32) { this.air = true; this.emit('air', clamp(fall / 20, .15, .45)); }
    }
    if (this.landed && m.swing !== this.swing) {
      this.swing = m.swing;
      if (this.swing) {
        const id=this.footIds.get(this.swing.link);
        this.arms.set(id,{ id, link:this.swing.link, airborne:false, played:false, started:this.time, wasGrounded:this.grounded.has(id) });
      }
    }
    const headSpeed = Math.abs(m.headYaw - (this.headYaw ?? m.headYaw)) / dt;
    const turnSpeed = Math.abs(m.pose.yaw - (this.yaw ?? m.pose.yaw)) / dt;
    const gesture = headSpeed > .55 || turnSpeed > .25;
    if (gesture && !this.gesture && this.landed) {
      this.emit('brush', clamp(.18 + headSpeed * .08 + turnSpeed * .12, .18, .62), null, .16);
    }
    if (!gesture && this.gesture && this.landed) this.pending.push({ at: this.time + .035, effect: 'flutter', power: .13 });
    this.gesture = gesture; this.headYaw = m.headYaw; this.yaw = m.pose.yaw;
    for (const event of this.pending.filter(e => e.at <= this.time)) this.emit(event.effect, event.power, null, .1);
    this.pending = this.pending.filter(e => e.at > this.time);
  }
  afterStep(dt, contacts) {
    const s = this.simulation, m = s.motion;
    let featherContacts = 0;
    for (const contact of contacts.end) {
      const a = this.shapes.get(contact.shapeUserDataA), b = this.shapes.get(contact.shapeUserDataB);
      if (a?.kind === 'floor') this.grounded.delete(contact.shapeUserDataB);
      if (b?.kind === 'floor') this.grounded.delete(contact.shapeUserDataA);
    }
    for (const contact of contacts.begin) {
      const a = this.shapes.get(contact.shapeUserDataA), b = this.shapes.get(contact.shapeUserDataB);
      if (!a || !b) continue;
      const groundId = a.kind === 'floor' ? contact.shapeUserDataB : b.kind === 'floor' ? contact.shapeUserDataA : null;
      const ground = a.kind === 'floor' ? b : b.kind === 'floor' ? a : null;
      if (groundId !== null) this.grounded.add(groundId);
      if (ground?.kind === 'body' && !this.landed) {
        this.landed = this.time;
        const impact = Math.max(0, -(this.velocity.get(ground.entry)?.y ?? 0));
        this.emit('landing', clamp(.35 + impact / 25, .35, 1), ground.entry.body.getPosition());
        this.pending.push({ at: this.time + .055, effect: 'flutter', power: .35 },
          { at: this.time + .22, effect: 'flutter', power: .17 }, { at: this.time + .13, effect: 'body', power: .25 });
      }
      if (a.kind === 'feather' && b.kind === 'feather') featherContacts++;
      const furniture = ['glass', 'wood'].includes(a.kind) ? a : ['glass', 'wood'].includes(b.kind) ? b : null;
      const moving = furniture === a ? b : a;
      if (furniture && ['body', 'feather'].includes(moving.kind)) {
        const v = speed(this.velocity.get(moving.entry) ?? moving.entry.body.getLinearVelocity());
        if (v > .7) this.emit(furniture.kind, clamp(v / 22, .04, moving.kind === 'body' ? .4 : .12), moving.entry.body.getPosition(), .3);
      }
    }
    for (const arm of this.arms.values()) if (!arm.played) {
      if (!this.grounded.has(arm.id) && this.time - arm.started > .015 && !arm.airborne) {
        arm.airborne = true;
        if(arm.wasGrounded)this.emit('lift', .09, arm.link.entry.body.getPosition(), .06);
      }
      if (arm.airborne && this.grounded.has(arm.id) && this.time - arm.started > .045) {
        const entry = arm.link.entry, v = this.velocity.get(entry);
        this.emit('foot', clamp(.35 + speed(v) * .08, .35, .8), entry.body.getPosition(), .045);
        arm.played = true;
      }
    }
    if (m.phase === 'stepping' && this.landed && this.time - this.landed > .5) {
      const sliding = m.feet.filter(link => this.grounded.has(this.footIds.get(link)) && link !== this.swing?.link);
      const frictionSpeed = Math.max(0, ...sliding.map(link => { const v = this.velocity.get(link.entry); return Math.hypot(v.x, v.z); }));
      this.slip = (this.slip ?? 0) + (frictionSpeed > .25 ? frictionSpeed * dt : 0);
      if (this.slip > .22) { this.emit('pivot', clamp(frictionSpeed * .08, .08, .3), null, .22); this.slip = 0; }
    } else this.slip = 0;
    // Hundreds of vane contacts resolve into one quiet texture during movement.
    if (featherContacts > 2 && this.gesture && this.landed)
      this.emit('brush', clamp(featherContacts / 100, .04, .2), null, .24);
  }
  drain() { const events = this.queue; this.queue = []; return events; }
  get diagnostics() { return { counts: { ...this.counts }, recent: this.recent, identity: this.identity, pending: this.pending.length }; }
}
