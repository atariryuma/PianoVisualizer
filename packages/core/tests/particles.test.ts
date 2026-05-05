import { describe, it, expect, beforeEach } from 'vitest';
import {
  project3D,
  Particle,
  drawStar,
  drawFlower,
  getNoteColor,
  spawnBurst,
  spawnStream,
  FOCAL_LENGTH,
  NEAR_CLIPPING,
  type SpawnOptions,
} from '../src/render/particles';
import { makeCanvasStub } from './_fixtures/canvas-stub';

const SCREEN = { screenW: 800, screenH: 600 };

const SPAWN: SpawnOptions = {
  screenW: 800,
  screenH: 600,
  themeColors: ['#aaa', '#bbb', '#ccc'],
  flow: 30,
  maxParticles: 100,
};

// =====================================================================
// project3D
// =====================================================================

describe('project3D', () => {
  it('returns null for points behind the camera (z < NEAR_CLIPPING)', () => {
    expect(project3D(0, 0, NEAR_CLIPPING - 1, 10, SCREEN)).toBeNull();
  });

  it('z=0 yields scale=1 (full size, projected at center)', () => {
    const p = project3D(0, 0, 0, 10, SCREEN)!;
    expect(p.scale).toBe(1);
    expect(p.size).toBe(10);
    expect(p.x).toBe(400); // screen center
    expect(p.y).toBe(300);
  });

  it('positive z shrinks size and pulls toward center', () => {
    const at0 = project3D(100, 50, 0, 10, SCREEN)!;
    const farther = project3D(100, 50, 800, 10, SCREEN)!;
    expect(farther.scale).toBeLessThan(at0.scale);
    expect(farther.size).toBeLessThan(at0.size);
    // x at 100 logical → 400+100*scale on screen → smaller scale = closer to 400
    expect(Math.abs(farther.x - 400)).toBeLessThan(Math.abs(at0.x - 400));
  });

  it('negative z (between NEAR_CLIPPING and 0) yields scale > 1', () => {
    const p = project3D(0, 0, -50, 10, SCREEN)!;
    expect(p.scale).toBeGreaterThan(1);
    expect(p.size).toBeGreaterThan(10);
  });

  it('respects custom focal length and near clipping', () => {
    const tight = project3D(0, 0, -200, 10, { ...SCREEN, nearClipping: -100 });
    expect(tight).toBeNull(); // stricter clipping rejects it
    const loose = project3D(0, 0, -200, 10, { ...SCREEN, nearClipping: -300 });
    expect(loose).not.toBeNull();
  });

  it('FOCAL_LENGTH = 800 is the documented default', () => {
    expect(FOCAL_LENGTH).toBe(800);
  });
});

// =====================================================================
// Particle physics
// =====================================================================

describe('Particle.update', () => {
  it('advances position by velocity', () => {
    const p = new Particle(0, 0, 0, '#fff', 10, 1, 2, 3, 100, 'circle');
    p.update();
    expect(p.x).toBeCloseTo(1, 5);
    // gravity bumps vy by 0.15 BEFORE drag is applied, so y advances by 2 only this frame
    expect(p.y).toBeCloseTo(2, 5);
    expect(p.z).toBeCloseTo(3, 5);
  });

  it('applies gravity to non-star non-note particles', () => {
    const circle = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, 'circle');
    const initialVy = circle.vy;
    circle.update();
    // gravity adds 0.15 then drag (0.99) is applied
    expect(circle.vy).toBeCloseTo((initialVy + 0.15) * 0.99, 5);
  });

  it('does NOT apply gravity to stars or notes', () => {
    const star = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, 'star');
    star.update();
    expect(star.vy).toBeCloseTo(0, 5); // 0 * 0.99 = 0
    const note = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, 'note');
    note.update();
    expect(note.vy).toBeCloseTo(0, 5);
  });

  it('decrements life by 1 each tick', () => {
    const p = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, 'circle');
    p.update();
    expect(p.life).toBe(99);
    expect(p.maxLife).toBe(100); // unchanged
  });

  it('applies drag (0.99) to all 3 velocity components', () => {
    const p = new Particle(0, 0, 0, '#fff', 10, 10, 10, 10, 100, 'star');
    p.update();
    expect(p.vx).toBeCloseTo(9.9, 5);
    expect(p.vy).toBeCloseTo(9.9, 5);
    expect(p.vz).toBeCloseTo(9.9, 5);
  });

  it('rotates angle by spin', () => {
    const p = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, 'circle');
    p.spin = 0.1;
    const initialAngle = p.angle;
    p.update();
    expect(p.angle).toBeCloseTo(initialAngle + 0.1, 5);
  });
});

// =====================================================================
// Particle.draw
// =====================================================================

describe('Particle.draw', () => {
  it('skips drawing when projected behind camera', () => {
    const stub = makeCanvasStub();
    const p = new Particle(0, 0, NEAR_CLIPPING - 100, '#fff', 10, 0, 0, 0, 100, 'circle');
    p.draw(stub.ctx, { ...SCREEN, useShadow: false });
    expect(stub.calls).toHaveLength(0);
  });

  it('skips when projected size shrinks below 0.5', () => {
    const stub = makeCanvasStub();
    // Tiny particle far away → projected size << 0.5
    const p = new Particle(0, 0, 100000, '#fff', 1, 0, 0, 0, 100, 'circle');
    p.draw(stub.ctx, { ...SCREEN, useShadow: false });
    expect(stub.calls).toHaveLength(0);
  });

  it('saves/restores ctx state and translates to projected position', () => {
    const stub = makeCanvasStub();
    const p = new Particle(0, 0, 0, '#abc', 10, 0, 0, 0, 100, 'circle');
    p.draw(stub.ctx, { ...SCREEN, useShadow: false });
    expect(stub.countCalls('save')).toBe(1);
    expect(stub.countCalls('restore')).toBe(1);
    expect(stub.countCalls('translate')).toBe(1);
    expect(stub.countCalls('arc')).toBe(1);
    expect(stub.countCalls('fill')).toBe(1);
    expect(stub.props.fillStyle).toBe('#abc');
  });

  it('applies shadowBlur only when useShadow=true', () => {
    const stubOff = makeCanvasStub();
    new Particle(0, 0, 0, '#abc', 10, 0, 0, 0, 100, 'circle').draw(stubOff.ctx, {
      ...SCREEN,
      useShadow: false,
    });
    expect(stubOff.props.shadowBlur).toBeUndefined();

    const stubOn = makeCanvasStub();
    new Particle(0, 0, 0, '#abc', 10, 0, 0, 0, 100, 'circle').draw(stubOn.ctx, {
      ...SCREEN,
      useShadow: true,
    });
    expect(stubOn.props.shadowBlur).toBeGreaterThan(0);
    expect(stubOn.props.shadowColor).toBe('#abc');
  });

  it('renders different shapes per type', () => {
    const types = ['circle', 'ring', 'star', 'note', 'flower'] as const;
    for (const t of types) {
      const stub = makeCanvasStub();
      const p = new Particle(0, 0, 0, '#fff', 10, 0, 0, 0, 100, t);
      p.draw(stub.ctx, { ...SCREEN, useShadow: false });
      expect(stub.calls.length, `type ${t} should draw`).toBeGreaterThan(0);
    }
  });
});

// =====================================================================
// drawStar / drawFlower
// =====================================================================

describe('drawStar', () => {
  it('draws an N-pointed star (N moveTo + 2N-1 lineTo + closePath)', () => {
    const stub = makeCanvasStub();
    drawStar(stub.ctx, 0, 0, 5, 10, 5, '#fff', false);
    expect(stub.countCalls('beginPath')).toBe(1);
    // 1 moveTo + 9 lineTo for a 5-pointed star (10 points total)
    expect(stub.countCalls('moveTo')).toBe(1);
    expect(stub.countCalls('lineTo')).toBe(9);
    expect(stub.countCalls('closePath')).toBe(1);
    expect(stub.countCalls('fill')).toBe(1);
  });

  it('honors useShadow', () => {
    const stub = makeCanvasStub();
    drawStar(stub.ctx, 0, 0, 5, 10, 5, '#abc', true);
    expect(stub.props.shadowBlur).toBe(15); // outerR * 1.5
    expect(stub.props.shadowColor).toBe('#abc');
  });
});

describe('drawFlower', () => {
  it('draws 5 petals + a center disc', () => {
    const stub = makeCanvasStub();
    drawFlower(stub.ctx, 0, 0, 10, '#abc', 0.8, false);
    // 5 ellipses for petals + 1 arc for center
    expect(stub.countCalls('ellipse')).toBe(5);
    expect(stub.countCalls('arc')).toBe(1);
    // Center fillStyle should switch to the cream color with the alpha.
    expect(stub.props.fillStyle).toMatch(/^rgba\(255,255,200,0\.8\)/);
  });
});

// =====================================================================
// getNoteColor
// =====================================================================

describe('getNoteColor', () => {
  const COLOR_MAP = {
    C: '#ff0000',
    D: '#00ff00',
    'F#': '#0000ff',
  };

  it('returns the mapped color for a bare name', () => {
    expect(getNoteColor('C', COLOR_MAP)).toBe('#ff0000');
  });

  it('strips octave digits before lookup', () => {
    expect(getNoteColor('C4', COLOR_MAP)).toBe('#ff0000');
    expect(getNoteColor('D5', COLOR_MAP)).toBe('#00ff00');
    expect(getNoteColor('F#3', COLOR_MAP)).toBe('#0000ff');
  });

  it('returns null for missing names', () => {
    expect(getNoteColor('Z', COLOR_MAP)).toBeNull();
    expect(getNoteColor('', COLOR_MAP)).toBeNull();
    expect(getNoteColor(null, COLOR_MAP)).toBeNull();
    expect(getNoteColor(undefined, COLOR_MAP)).toBeNull();
  });
});

// =====================================================================
// spawnBurst / spawnStream
// =====================================================================

describe('spawnBurst', () => {
  let particles: Particle[];
  beforeEach(() => {
    particles = [];
  });

  it('pushes the requested count when under the cap', () => {
    const n = spawnBurst(particles, 100, 100, 5, 1.0, SPAWN);
    expect(n).toBe(5);
    expect(particles).toHaveLength(5);
  });

  it('respects the maxParticles cap', () => {
    const opts = { ...SPAWN, maxParticles: 3 };
    const n = spawnBurst(particles, 100, 100, 100, 1.0, opts);
    expect(n).toBe(3);
    expect(particles).toHaveLength(3);
  });

  it('returns 0 when already at cap', () => {
    for (let i = 0; i < SPAWN.maxParticles; i++) {
      particles.push(new Particle(0, 0, 0, '#fff', 1, 0, 0, 0, 1, 'circle'));
    }
    expect(spawnBurst(particles, 100, 100, 5, 1.0, SPAWN)).toBe(0);
  });

  it('uses overrideColor when provided', () => {
    spawnBurst(particles, 100, 100, 10, 1.0, { ...SPAWN, overrideColor: '#beef00' });
    for (const p of particles) {
      expect(p.color).toBe('#beef00');
    }
  });

  it('picks colors from themeColors when no override', () => {
    spawnBurst(particles, 100, 100, 50, 1.0, SPAWN);
    for (const p of particles) {
      expect(SPAWN.themeColors).toContain(p.color);
    }
  });

  it('positions particles in logical coords (screen center = 0,0)', () => {
    spawnBurst(particles, SPAWN.screenW / 2, SPAWN.screenH / 2, 5, 1.0, SPAWN);
    for (const p of particles) {
      expect(p.x).toBe(0);
      expect(p.y).toBe(0);
    }
  });

  it('flow > 35 adds flower to type pool', () => {
    spawnBurst(particles, 0, 0, 100, 1.0, { ...SPAWN, flow: 50, maxParticles: 100 });
    const types = new Set(particles.map((p) => p.type));
    // With 100 samples, the chance of NOT seeing a flower is vanishingly small.
    expect(types.has('flower')).toBe(true);
  });

  it('flow ≤ 35 has no flower', () => {
    spawnBurst(particles, 0, 0, 100, 1.0, { ...SPAWN, flow: 30, maxParticles: 100 });
    const types = new Set(particles.map((p) => p.type));
    expect(types.has('flower')).toBe(false);
  });
});

describe('spawnStream', () => {
  let particles: Particle[];
  beforeEach(() => {
    particles = [];
  });

  it('count grows with flow', () => {
    spawnStream(particles, 100, 100, 1.0, { ...SPAWN, flow: 0 });
    const lowFlow = particles.length;
    particles = [];
    spawnStream(particles, 100, 100, 1.0, { ...SPAWN, flow: 100 });
    const highFlow = particles.length;
    expect(highFlow).toBeGreaterThan(lowFlow);
  });

  it('respects cap', () => {
    const n = spawnStream(particles, 100, 100, 1.0, { ...SPAWN, flow: 100, maxParticles: 3 });
    expect(n).toBeLessThanOrEqual(3);
  });

  it('only spawns notes and circles', () => {
    spawnStream(particles, 100, 100, 1.0, { ...SPAWN, flow: 100 });
    for (const p of particles) {
      expect(['note', 'circle']).toContain(p.type);
    }
  });
});
