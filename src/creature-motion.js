import { Quaternion, Vector3 } from 'three';

const up = new Vector3(0, 1, 0), right = new Vector3(1, 0, 0);
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const poses = [
  { x: .4, z: -.5, yaw: .72, hold: 1.1, look: -.32 },
  { x: .9, z: -1.1, yaw: 1.55, hold: .85, look: .38 },
  { x: .3, z: -1.65, yaw: 2.35, hold: 1.45, look: -.4 },
  { x: -.6, z: -1.4, yaw: 3.12, hold: .9, look: .3 },
  { x: -.9, z: -.6, yaw: 3.65, hold: 1.25, look: -.38 },
  { x: .15, z: -.8, yaw: 2.7, hold: 1.1, look: .42 },
  { x: .7, z: -.15, yaw: 1.7, hold: .8, look: -.3 },
  { x: 0, z: 0, yaw: 0, hold: 1.3, look: .28 },
];

// Actuate the original five dynamic hulls. Planted targets stay fixed in world
// space; only one lower lobe lifts at a time. The mesh and its joint chain still
// respond to Box3D contacts, rather than being rotated as a single scene object.
export class CreatureMotion {
  constructor(simulation) {
    this.simulation = simulation;
    this.size = simulation.settings.mesh.size;
    this.scale = this.size / 7.2;
    this.elapsed = 0; this.started = false; this.phase = 'falling'; this.steps = 0;
    this.pose = { x: 0, z: 0, yaw: 0 }; this.poseIndex = 0;
    this.headYaw = 0; this.headPitch = 0; this.swing = null;
    const entries = simulation.meshRig.entries;
    const bottoms = entries.map((entry, i) => Math.min(...simulation.meshRig.colliders[i].points.map(p => entry.body.getWorldPoint(p).y)) - simulation.object.position.y);
    const floor = Math.min(...bottoms);
    const candidates = entries.map((_, i) => i).sort((a, b) => bottoms[a] - bottoms[b]);
    // Two or three genuinely low source hulls become the feet. A flat seed can
    // have four low lobes; retain the most widely separated support triangle.
    const low = candidates.filter(i => bottoms[i] < floor + this.size * .16);
    const feet = candidates.slice(0, 2);
    if (low.length > 2) feet.push(low.slice(2).sort((a, b) => {
      const spread = i => Math.min(...feet.map(j => new Vector3(...simulation.source.boxes[i].position).distanceToSquared(new Vector3(...simulation.source.boxes[j].position))));
      return spread(b) - spread(a);
    })[0]);
    const heights = simulation.source.boxes.map(b => b.position[1]);
    const minHeight = Math.min(...heights), height = Math.max(...heights) - minHeight;
    this.links = entries.map((entry, i) => {
      const rest = new Vector3(...simulation.source.boxes[i].position);
      rest.y -= floor;
      const foot = feet.includes(i), head = foot ? 0 : Math.max(0, (heights[i] - minHeight) / Math.max(.1, height) - .35) / .65;
      if (foot) rest.y -= bottoms[i] - floor;
      else rest.y += .16 * this.scale * head;
      const rotation = new Quaternion(...simulation.source.boxes[i].quaternion);
      const anchor = simulation.physics.addBody({ body: { type: 'kinematic', ...entry.body.getTransform() } });
      const motor = simulation.physics.addMotorJoint(anchor, entry, {
        linearHertz: foot ? 15 : 7, linearDampingRatio: .88,
        angularHertz: foot ? 11 : 7, angularDampingRatio: .85,
        maxSpringForce: 0, maxSpringTorque: 0, maxVelocityForce: 0, maxVelocityTorque: 0,
        collideConnected: false,
      });
      return { entry, anchor, motor, rest, rotation, foot, head,
        planted: rest.clone(), plantedYaw: 0, target: rest.clone(), targetRotation: rotation.clone() };
    });
    this.feet = feet.map(i => this.links[i]).sort((a, b) => a.rest.x - b.rest.x);
    this.nextFoot = 0;
  }

  configure(settings) { this.settings = settings; }

  beginStanding() {
    this.started = true; this.phase = 'standing';
    for (const link of this.links) {
      link.arrival = new Vector3().copy(link.entry.body.getPosition());
      link.arrivalRotation = new Quaternion().copy(link.entry.body.getRotation());
    }
  }

  beginMove() {
    const goal = poses[this.poseIndex++ % poses.length];
    this.move = { ...goal, x: goal.x * this.scale, z: goal.z * this.scale };
    this.phase = 'stepping'; this.phaseTime = 0;
    this.beginStride();
  }

  beginStride() {
    this.from = { ...this.pose };
    const distance = Math.hypot(this.move.x - this.pose.x, this.move.z - this.pose.z);
    const fraction = Math.min(1, .55 / Math.max(.001, Math.abs(this.move.yaw - this.pose.yaw)), .65 * this.scale / Math.max(.001, distance));
    this.to = { x: mix(this.pose.x, this.move.x, fraction), z: mix(this.pose.z, this.move.z, fraction), yaw: mix(this.pose.yaw, this.move.yaw, fraction) };
    this.strideTime = 0; this.strideFoot = 0;
    this.stepDuration = .16 + (Math.floor(this.steps / this.feet.length) % 3) * .015;
    this.stepGap = .035;
    this.beginStep();
  }

  beginStep() {
    const link = this.feet[this.nextFoot++ % this.feet.length];
    const rotation = new Quaternion().setFromAxisAngle(up, this.to.yaw);
    const end = link.rest.clone().applyQuaternion(rotation).add(new Vector3(this.to.x, 0, this.to.z));
    this.swing = { link, from: link.planted.clone(), to: end, yaw: link.plantedYaw, time: 0 };
  }

  update(dt, grounded) {
    if (!this.started) { if (!grounded) return; this.beginStanding(); }
    this.elapsed += dt;
    const standing = smooth(this.elapsed / .42);
    if (this.phase === 'standing' && this.ready) {
      this.phase = 'looking'; this.phaseTime = 0; this.hold = .75; this.look = .25;
    }
    if (this.phase === 'looking') {
      this.phaseTime += dt;
      // A fast glance, a held inspection, then a second quick head adjustment.
      const t = this.phaseTime;
      this.headYaw = this.look * smooth((t - .12) / .13) * (1 - 1.55 * smooth((t - this.hold * .62) / .12));
      this.headPitch = -.1 * smooth((t - .12) / .14) * (1 - smooth((t - this.hold * .75) / .15));
      if (t > this.hold) this.beginMove();
    }
    if (this.phase === 'stepping') {
      this.headYaw *= Math.exp(-dt * 24); this.headPitch *= Math.exp(-dt * 24);
      this.strideTime += dt;
      const strideDuration = this.feet.length * (this.stepDuration + this.stepGap);
      const travel = smooth(this.strideTime / strideDuration);
      this.pose = { x: mix(this.from.x, this.to.x, travel), z: mix(this.from.z, this.to.z, travel), yaw: mix(this.from.yaw, this.to.yaw, travel) };
      const swing = this.swing;
      swing.time += dt;
      const t = Math.min(1, swing.time / this.stepDuration);
      swing.link.planted.lerpVectors(swing.from, swing.to, smooth(t));
      // A low, sharp lift with zero velocity at touch-down, not a slow hover.
      swing.link.planted.y += Math.sin(Math.PI * t) ** 2 * .52 * this.scale;
      swing.link.plantedYaw = mix(swing.yaw, this.to.yaw, smooth(t));
      if (swing.time >= this.stepDuration + this.stepGap) {
        this.steps++; this.strideFoot++;
        if (this.strideFoot < this.feet.length) this.beginStep();
        else {
          this.pose = { ...this.to };
          if (Math.abs(this.pose.yaw - this.move.yaw) > .001 || Math.hypot(this.pose.x - this.move.x, this.pose.z - this.move.z) > .001) this.beginStride();
          else { this.phase = 'looking'; this.phaseTime = 0; this.hold = this.move.hold; this.look = this.move.look; this.swing = null; }
        }
      }
    }
    const turn = new Quaternion().setFromAxisAngle(up, this.pose.yaw);
    for (const link of this.links) {
      if (link.foot) {
        link.target.copy(link.planted);
        link.targetRotation.setFromAxisAngle(up, link.plantedYaw).multiply(link.rotation);
      } else {
        link.target.copy(link.rest).applyQuaternion(turn).add(new Vector3(this.pose.x, 0, this.pose.z));
        // Upper lobes turn at the neck while the planted lower hulls hold still.
        link.targetRotation.copy(turn).multiply(new Quaternion().setFromAxisAngle(up, this.headYaw * link.head))
          .multiply(new Quaternion().setFromAxisAngle(right, this.headPitch * link.head)).multiply(link.rotation);
      }
      link.target.lerpVectors(link.arrival, link.target, standing);
      if (standing < 1) link.targetRotation.copy(link.arrivalRotation.clone().slerp(link.targetRotation, standing));
      link.anchor.body.setTargetTransform({ position: link.target, rotation: link.targetRotation }, dt, true);
      const mass = link.entry.body.getMass(), gravity = this.settings.physics.gravity;
      link.motor.joint.setMaxSpringForce(mass * Math.max(gravity * 7, this.size * 110) * standing);
      link.motor.joint.setMaxSpringTorque(mass * this.size ** 2 * 45 * standing);
      for (const shape of link.entry.shapes) shape.setFriction(link === this.swing?.link ? .18 : this.settings.physics.friction);
    }
  }

  get ready() { return this.started && this.elapsed > .9; }
  get diagnostics() {
    return { phase: this.phase, steps: this.steps, feet: this.feet.length, heading: this.pose.yaw, headTurn: this.headYaw,
      swingFoot: this.swing ? this.links.indexOf(this.swing.link) : null, stepDuration: this.stepDuration ?? .16 };
  }
}
