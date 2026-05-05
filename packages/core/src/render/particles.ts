// Particle system — 3D-projected canvas particles for the visualizer.
//
// What lives here (pure / testable):
//   - project3D() — perspective math (no canvas dependency)
//   - Particle class — physics (update) + rendering (draw)
//   - drawStar / drawFlower — pure shape primitives
//   - spawnBurst / spawnStream — mutate an injected particles[] array
//   - getNoteColor — synesthesia color lookup
//
// What stays in the shell:
//   - The `particles[]` allocation + per-frame draw loop (caller owns it)
//   - W / H derivation (caller passes them per-spawn)
//   - shadowBlur gating policy (caller decides via shouldUseShadow callback)

// =====================================================================
// 3D projection
// =====================================================================

export const FOCAL_LENGTH = 800;
export const NEAR_CLIPPING = -100;

export interface ProjectedPoint {
  /** Projected screen x (px). */
  x: number;
  /** Projected screen y (px). */
  y: number;
  /** Perspective scale factor (1 at z=0, smaller as z grows). */
  scale: number;
  /** Original size scaled by perspective. */
  size: number;
  /** Always true when returned (null is the not-visible signal). */
  visible: true;
}

export interface Project3DOptions {
  /** Screen width (logical px). */
  screenW: number;
  /** Screen height (logical px). */
  screenH: number;
  /** Override the focal length (defaults to FOCAL_LENGTH). */
  focalLength?: number;
  /** Override the near-clipping plane. */
  nearClipping?: number;
}

/**
 * Project a 3D logical point (origin = screen center) to screen coords.
 *
 * Returns null if the point is behind the camera (z < nearClipping). Otherwise
 * a `ProjectedPoint` with the screen position + perspective-scaled size.
 */
export function project3D(
  x: number,
  y: number,
  z: number,
  size: number,
  opts: Project3DOptions
): ProjectedPoint | null {
  const near = opts.nearClipping ?? NEAR_CLIPPING;
  if (z < near) return null;
  const focal = opts.focalLength ?? FOCAL_LENGTH;
  const scale = focal / (focal + z);
  return {
    x: opts.screenW / 2 + x * scale,
    y: opts.screenH / 2 + y * scale,
    scale,
    size: size * scale,
    visible: true,
  };
}

// =====================================================================
// Particle class
// =====================================================================

export type ParticleType = 'circle' | 'ring' | 'star' | 'note' | 'flower';

export interface ParticleDrawOptions {
  /** Canvas width — passed to project3D each draw call. */
  screenW: number;
  /** Canvas height. */
  screenH: number;
  /** Whether to apply ctx.shadowColor/shadowBlur. Caller decides per frame
   *  (typically: SHADOW_BLUR_ENABLED && particles.length < 300). */
  useShadow: boolean;
}

/**
 * A single 3D particle. Owns its own physics (update) and rendering (draw).
 *
 * Rendering reads only from the injected ctx + opts — no globals. Physics
 * is pure with respect to globals (it mutates only `this`).
 */
export class Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: string;
  baseSize: number;
  life: number;
  maxLife: number;
  type: ParticleType;
  angle: number;
  spin: number;
  /** Caller can override per-particle gravity. Defaults to 0; the type-based
   *  gravity bump in update() applies regardless. */
  gravity: number;

  constructor(
    x: number,
    y: number,
    z: number,
    color: string,
    size: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    type: ParticleType = 'circle'
  ) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.color = color;
    this.baseSize = size;
    this.vx = vx;
    this.vy = vy;
    this.vz = vz;
    this.life = life;
    this.maxLife = life;
    this.type = type;
    this.angle = Math.random() * Math.PI * 2;
    this.spin = (Math.random() - 0.5) * 0.04;
    this.gravity = 0;
  }

  /** One physics tick. Mutates self only. */
  update(): void {
    this.x += this.vx;
    this.y += this.vy;
    this.z += this.vz;
    // Type-based gravity bump — stars and notes float, others fall.
    if (this.type !== 'star' && this.type !== 'note') {
      this.vy += 0.15;
    }
    this.vx *= 0.99;
    this.vy *= 0.99;
    this.vz *= 0.99;
    this.life--;
    this.angle += this.spin;
  }

  /**
   * Draw self into the provided 2D context. No-op if the particle has
   * projected behind the camera or has shrunk below the visibility threshold.
   */
  draw(ctx: CanvasRenderingContext2D, opts: ParticleDrawOptions): void {
    const p = project3D(this.x, this.y, this.z, this.baseSize, opts);
    if (!p) return;
    const a = Math.max(0, this.life / this.maxLife);
    const size = p.size * (0.4 + 0.6 * a);
    if (size < 0.5) return;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(this.angle);

    switch (this.type) {
      case 'circle': {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        if (opts.useShadow) {
          ctx.shadowColor = this.color;
          ctx.shadowBlur = size * 2;
        }
        ctx.fill();
        break;
      }
      case 'ring': {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5 * p.scale;
        if (opts.useShadow) {
          ctx.shadowColor = this.color;
          ctx.shadowBlur = size;
        }
        ctx.stroke();
        break;
      }
      case 'star': {
        drawStar(ctx, 0, 0, 5, size, size * 0.45, this.color, opts.useShadow);
        break;
      }
      case 'note': {
        ctx.font = size * 2.5 + 'px serif';
        ctx.fillStyle = this.color;
        if (opts.useShadow) {
          ctx.shadowColor = this.color;
          ctx.shadowBlur = 10 * p.scale;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('♪', 0, 0);
        break;
      }
      case 'flower': {
        drawFlower(ctx, 0, 0, size, this.color, a, opts.useShadow);
        break;
      }
    }
    ctx.restore();
  }
}

// =====================================================================
// Pure shape primitives (callable independently of Particle)
// =====================================================================

/**
 * Draw an N-pointed star centered at (cx, cy) with outer radius oR and inner
 * radius iR. Mutates ctx state (caller should save/restore around).
 */
export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  points: number,
  outerR: number,
  innerR: number,
  color: string,
  useShadow: boolean
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / points - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  if (useShadow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = outerR * 1.5;
  }
  ctx.fill();
}

/**
 * Draw a 5-petal flower centered at (cx, cy) with petal radius `s` and a
 * cream-colored center disc whose alpha tracks `a` (the particle's lifetime).
 */
export function drawFlower(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
  a: number,
  useShadow: boolean
): void {
  ctx.fillStyle = color;
  if (useShadow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = s;
  }
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5;
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(angle) * s * 0.5,
      cy + Math.sin(angle) * s * 0.5,
      s * 0.5,
      s * 0.25,
      angle,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,200,' + a + ')';
  ctx.fill();
}

// =====================================================================
// Synesthesia color lookup
// =====================================================================

/**
 * Resolve a note name to a synesthesia color from a given color map.
 * Strips octave digits (e.g. "C4" → "C") before lookup.
 */
export function getNoteColor(
  noteName: string | null | undefined,
  colorMap: Record<string, string>
): string | null {
  if (!noteName) return null;
  const name = noteName.replace(/[0-9]/g, '');
  return colorMap[name] || null;
}

// =====================================================================
// Spawn helpers — push particles into an injected array
// =====================================================================

export interface SpawnOptions {
  /** Screen width (px). Used to convert screenX → logical 3D x. */
  screenW: number;
  /** Screen height (px). */
  screenH: number;
  /** Theme color palette. Picked from at random when overrideColor is null. */
  themeColors: readonly string[];
  /** Current flow value (0..100). Drives type-pool richness in spawnBurst,
   *  and stream count in spawnStream. */
  flow: number;
  /** Hard ceiling on the particles array. Spawning stops here. */
  maxParticles: number;
  /** Optional explicit color override (e.g. synesthesia note color). */
  overrideColor?: string | null;
}

/**
 * Burst of particles from (screenX, screenY). Type pool grows as flow
 * climbs — flowers above flow 35, extra stars above 60. Push into the
 * caller's `particles` array; stops when the cap is hit.
 *
 * Returns the number of particles actually pushed.
 */
export function spawnBurst(
  particles: Particle[],
  screenX: number,
  screenY: number,
  count: number,
  energy: number,
  opts: SpawnOptions
): number {
  const lx = screenX - opts.screenW / 2;
  const ly = screenY - opts.screenH / 2;
  const lz = 0;

  const typePool: ParticleType[] = ['circle', 'circle', 'ring', 'star', 'note'];
  if (opts.flow > 35) typePool.push('flower');
  if (opts.flow > 60) typePool.push('star', 'star');

  const actualCount = Math.min(count, opts.maxParticles - particles.length);
  if (actualCount <= 0) return 0;

  for (let i = 0; i < actualCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1 + Math.random() * 3.5 * energy;
    const zSpd = (Math.random() - 0.5) * 10 * energy;
    const color =
      opts.overrideColor || opts.themeColors[Math.floor(Math.random() * opts.themeColors.length)];
    particles.push(
      new Particle(
        lx,
        ly,
        lz,
        color,
        3 + Math.random() * 9 * energy,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd - 1.2,
        zSpd,
        70 + Math.random() * 90,
        typePool[Math.floor(Math.random() * typePool.length)]
      )
    );
  }
  return actualCount;
}

/**
 * Continuous-feel particle stream rising from (screenX, screenY). Stream
 * count grows linearly with flow. Used for sustained note visuals.
 *
 * Returns the number of particles actually pushed.
 */
export function spawnStream(
  particles: Particle[],
  screenX: number,
  screenY: number,
  energy: number,
  opts: SpawnOptions
): number {
  const lx = screenX - opts.screenW / 2;
  const ly = screenY - opts.screenH / 2;
  const targetCount = 2 + Math.floor(opts.flow / 25);
  let pushed = 0;
  for (let i = 0; i < targetCount; i++) {
    if (particles.length >= opts.maxParticles) break;
    const z = (Math.random() - 0.5) * 50;
    const color =
      opts.overrideColor || opts.themeColors[Math.floor(Math.random() * opts.themeColors.length)];
    particles.push(
      new Particle(
        lx + (Math.random() - 0.5) * 40,
        ly,
        z,
        color,
        2 + Math.random() * 5 * energy,
        (Math.random() - 0.5) * 1.2,
        -1.5 - Math.random() * 2.5 * energy,
        (Math.random() - 0.5) * 2,
        90 + Math.random() * 70,
        Math.random() > 0.6 ? 'note' : 'circle'
      )
    );
    pushed++;
  }
  return pushed;
}
