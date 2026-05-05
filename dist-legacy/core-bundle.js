"use strict";
var PianoCore = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    AUDIO_SAMPLE_RATE: () => AUDIO_SAMPLE_RATE,
    CHORD_MATE_TOLERANCE_MS: () => CHORD_MATE_TOLERANCE_MS,
    CONFIG: () => CONFIG,
    DEFAULT_ENCOURAGEMENT_TIERS: () => DEFAULT_ENCOURAGEMENT_TIERS,
    DURATION_MIN_TOL_MS: () => DURATION_MIN_TOL_MS,
    DURATION_TOL_FRACTION: () => DURATION_TOL_FRACTION,
    FOCAL_LENGTH: () => FOCAL_LENGTH,
    HIT_WINDOW_EARLY_MS: () => HIT_WINDOW_EARLY_MS,
    HIT_WINDOW_MS: () => HIT_WINDOW_MS,
    KB_BLACK: () => KB_BLACK,
    KB_BLACK_LEFT_WHITE_IDX: () => KB_BLACK_LEFT_WHITE_IDX,
    KB_WHITE: () => KB_WHITE,
    NEAR_CLIPPING: () => NEAR_CLIPPING,
    NOTE_NAMES_EN: () => NOTE_NAMES_EN,
    NOTE_NAMES_JP: () => NOTE_NAMES_JP,
    PERFECT_MS: () => PERFECT_MS,
    PERF_PROFILES: () => PERF_PROFILES,
    Particle: () => Particle,
    QUESTS: () => QUESTS,
    RESULT_TIER_KEYS: () => RESULT_TIER_KEYS,
    Ripple: () => Ripple,
    SESSION_RING_CAP: () => SESSION_RING_CAP,
    STAGES: () => STAGES,
    STAR_TIERS: () => STAR_TIERS,
    TEMPO_TIERS: () => TEMPO_TIERS,
    THEMES: () => THEMES,
    T_STRINGS: () => T_STRINGS,
    USER_DB_NAME: () => USER_DB_NAME,
    USER_DB_STORE: () => USER_DB_STORE,
    applyEncouragementEvent: () => applyEncouragementEvent,
    applyFlowEvent: () => applyFlowEvent,
    applyMidiCC: () => applyMidiCC,
    applyMidiNoteOff: () => applyMidiNoteOff,
    applyMidiNoteOn: () => applyMidiNoteOn,
    applyQuestTick: () => applyQuestTick,
    autoSectionDefs: () => autoSectionDefs,
    buildAudioGraph: () => buildAudioGraph,
    buildCoachingFeedback: () => buildCoachingFeedback,
    buildSectionNotes: () => buildSectionNotes,
    clamp01: () => clamp01,
    classifyStageTransition: () => classifyStageTransition,
    coefficientOfVariation: () => coefficientOfVariation,
    collectSectionCandidates: () => collectSectionCandidates,
    composeQualityScore: () => composeQualityScore,
    computeDynamicsScore: () => computeDynamicsScore,
    computeHandRanges: () => computeHandRanges,
    computeHarmonicity: () => computeHarmonicity,
    computeRhythmScore: () => computeRhythmScore,
    computeSpectralCentroid: () => computeSpectralCentroid,
    computeSpectralCrest: () => computeSpectralCrest,
    computeSpectralFlatness: () => computeSpectralFlatness,
    computeStabilityScore: () => computeStabilityScore,
    computeStars: () => computeStars,
    computeUnlocks: () => computeUnlocks,
    createAudioContext: () => createAudioContext,
    createT: () => createT,
    deriveSessionUIHint: () => deriveSessionUIHint,
    detectChord: () => detectChord,
    detectPerfTier: () => detectPerfTier,
    detectPitchYIN: () => detectPitchYIN,
    dispatchMidiBytes: () => dispatchMidiBytes,
    drawAurora: () => drawAurora,
    drawBackgroundFade: () => drawBackgroundFade,
    drawBgStars: () => drawBgStars,
    drawCenterGlow: () => drawCenterGlow,
    drawFlower: () => drawFlower,
    drawGroundFlowers: () => drawGroundFlowers,
    drawMidiKeyboard: () => drawMidiKeyboard,
    drawPracticeLane: () => drawPracticeLane,
    drawSpectrumBars: () => drawSpectrumBars,
    drawStar: () => drawStar,
    effectColorWave: () => effectColorWave,
    effectFlowerBurst: () => effectFlowerBurst,
    effectGlowParticles: () => effectGlowParticles,
    effectGlowPulse: () => effectGlowPulse,
    effectGoldenBurst: () => effectGoldenBurst,
    effectRadiance: () => effectRadiance,
    effectShimmer: () => effectShimmer,
    effectStarShower: () => effectStarShower,
    finalizeNoteHold: () => finalizeNoteHold,
    freqToNote: () => freqToNote,
    getNoteColor: () => getNoteColor,
    initAgcState: () => initAgcState,
    initBackground: () => initBackground,
    initEncouragementState: () => initEncouragementState,
    initFlowState: () => initFlowState,
    initMidiState: () => initMidiState,
    initOnsetState: () => initOnsetState,
    initPracticeState: () => initPracticeState,
    initQuestTrackerState: () => initQuestTrackerState,
    initSessionConfidenceState: () => initSessionConfidenceState,
    keyboardKeyCenterX: () => keyboardKeyCenterX,
    makeUserSong: () => makeUserSong,
    matchNoteOnset: () => matchNoteOnset,
    noteNamesFor: () => noteNamesFor,
    noteThemeColor: () => noteThemeColor,
    openUserDb: () => openUserDb,
    parseMusicXmlMetadata: () => parseMusicXmlMetadata,
    parseUserSongFromBlob: () => parseUserSongFromBlob,
    pickTier: () => pickTier,
    practiceElapsedMs: () => practiceElapsedMs,
    project3D: () => project3D,
    recoverAudioContext: () => recoverAudioContext,
    resetEncouragementState: () => resetEncouragementState,
    resetFlowState: () => resetFlowState,
    resetMidiState: () => resetMidiState,
    resetPracticeState: () => resetPracticeState,
    resetQuestTrackerState: () => resetQuestTrackerState,
    resetSessionConfidence: () => resetSessionConfidence,
    resolveResultTier: () => resolveResultTier,
    smoothQualityScore: () => smoothQualityScore,
    spawnBurst: () => spawnBurst,
    spawnStream: () => spawnStream,
    stageForFlow: () => stageForFlow,
    stageLabel: () => stageLabel,
    stepAgc: () => stepAgc,
    stepOnset: () => stepOnset,
    stepSessionConfidence: () => stepSessionConfidence,
    suppressVoice: () => suppressVoice,
    synColorFor: () => synColorFor,
    translate: () => translate,
    triggerEffect: () => triggerEffect,
    updateGrowthTrend: () => updateGrowthTrend,
    userDbAll: () => userDbAll,
    userDbDelete: () => userDbDelete,
    userDbPut: () => userDbPut
  });

  // src/render/perf-tier.ts
  var PERF_PROFILES = {
    low: { maxParticles3D: 400, shadowBlur: false, ambientChance: 0.015, bgStarCount: 50 },
    mid: { maxParticles3D: 600, shadowBlur: true, ambientChance: 0.03, bgStarCount: 80 },
    high: { maxParticles3D: 1200, shadowBlur: true, ambientChance: 0.045, bgStarCount: 120 }
  };
  function detectPerfTier() {
    if (typeof navigator === "undefined") return "mid";
    try {
      const override = typeof localStorage !== "undefined" ? localStorage.getItem("pianoViz_perfTier") : null;
      if (override === "low" || override === "mid" || override === "high") return override;
    } catch (_) {
    }
    const mem = navigator.deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    const ua = navigator.userAgent || "";
    const isAppleSilicon = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    const isOlderIPad = /iPad/.test(ua) && !/iPad.*Pro/.test(ua) && cores <= 4;
    if (isAppleSilicon || cores >= 8 || mem >= 8) return "high";
    if (isOlderIPad || mem <= 2 || cores <= 2) return "low";
    return "mid";
  }

  // src/render/particles.ts
  var FOCAL_LENGTH = 800;
  var NEAR_CLIPPING = -100;
  function project3D(x, y, z, size, opts) {
    const near = opts.nearClipping ?? NEAR_CLIPPING;
    if (z < near) return null;
    const focal = opts.focalLength ?? FOCAL_LENGTH;
    const scale = focal / (focal + z);
    return {
      x: opts.screenW / 2 + x * scale,
      y: opts.screenH / 2 + y * scale,
      scale,
      size: size * scale,
      visible: true
    };
  }
  var Particle = class {
    constructor(x, y, z, color, size, vx, vy, vz, life, type = "circle") {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "z");
      __publicField(this, "vx");
      __publicField(this, "vy");
      __publicField(this, "vz");
      __publicField(this, "color");
      __publicField(this, "baseSize");
      __publicField(this, "life");
      __publicField(this, "maxLife");
      __publicField(this, "type");
      __publicField(this, "angle");
      __publicField(this, "spin");
      /** Caller can override per-particle gravity. Defaults to 0; the type-based
       *  gravity bump in update() applies regardless. */
      __publicField(this, "gravity");
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
    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.z += this.vz;
      if (this.type !== "star" && this.type !== "note") {
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
    draw(ctx, opts) {
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
        case "circle": {
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
        case "ring": {
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
        case "star": {
          drawStar(ctx, 0, 0, 5, size, size * 0.45, this.color, opts.useShadow);
          break;
        }
        case "note": {
          ctx.font = size * 2.5 + "px serif";
          ctx.fillStyle = this.color;
          if (opts.useShadow) {
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 10 * p.scale;
          }
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("\u266A", 0, 0);
          break;
        }
        case "flower": {
          drawFlower(ctx, 0, 0, size, this.color, a, opts.useShadow);
          break;
        }
      }
      ctx.restore();
    }
  };
  function drawStar(ctx, cx, cy, points, outerR, innerR, color, useShadow) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = Math.PI * i / points - Math.PI / 2;
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
  function drawFlower(ctx, cx, cy, s, color, a, useShadow) {
    ctx.fillStyle = color;
    if (useShadow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = s;
    }
    for (let i = 0; i < 5; i++) {
      const angle = Math.PI * 2 * i / 5;
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
    ctx.fillStyle = "rgba(255,255,200," + a + ")";
    ctx.fill();
  }
  function getNoteColor(noteName, colorMap) {
    if (!noteName) return null;
    const name = noteName.replace(/[0-9]/g, "");
    return colorMap[name] || null;
  }
  function spawnBurst(particles, screenX, screenY, count, energy, opts) {
    const lx = screenX - opts.screenW / 2;
    const ly = screenY - opts.screenH / 2;
    const lz = 0;
    const typePool = ["circle", "circle", "ring", "star", "note"];
    if (opts.flow > 35) typePool.push("flower");
    if (opts.flow > 60) typePool.push("star", "star");
    const actualCount = Math.min(count, opts.maxParticles - particles.length);
    if (actualCount <= 0) return 0;
    for (let i = 0; i < actualCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3.5 * energy;
      const zSpd = (Math.random() - 0.5) * 10 * energy;
      const color = opts.overrideColor || opts.themeColors[Math.floor(Math.random() * opts.themeColors.length)];
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
  function spawnStream(particles, screenX, screenY, energy, opts) {
    const lx = screenX - opts.screenW / 2;
    const ly = screenY - opts.screenH / 2;
    const targetCount = 2 + Math.floor(opts.flow / 25);
    let pushed = 0;
    for (let i = 0; i < targetCount; i++) {
      if (particles.length >= opts.maxParticles) break;
      const z = (Math.random() - 0.5) * 50;
      const color = opts.overrideColor || opts.themeColors[Math.floor(Math.random() * opts.themeColors.length)];
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
          Math.random() > 0.6 ? "note" : "circle"
        )
      );
      pushed++;
    }
    return pushed;
  }

  // src/render/ripples.ts
  var Ripple = class {
    constructor(x, y, color, size) {
      __publicField(this, "x");
      __publicField(this, "y");
      __publicField(this, "radius");
      __publicField(this, "maxRadius");
      __publicField(this, "color");
      __publicField(this, "life");
      this.x = x;
      this.y = y;
      this.radius = 0;
      this.maxRadius = size ?? 200;
      this.color = color;
      this.life = 1;
    }
    /** One physics tick. Mutates self only. */
    update(opts) {
      this.radius += 2.5 + opts.flow * 0.03;
      this.life = 1 - this.radius / this.maxRadius;
    }
    /** Render into the provided context. No-op when life has expired. */
    draw(ctx, opts) {
      if (this.life <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.life * 0.3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5 + opts.flow * 0.02;
      if (opts.useShadow) {
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10 + opts.flow * 0.15;
      }
      ctx.stroke();
      ctx.restore();
    }
  };

  // src/render/effects.ts
  var GOLDEN_BURST_COLORS = ["#ffd700", "#ffec8b", "#fff8dc", "#ffe4b5", "#ffc125", "#eec900"];
  var DEFAULT_STAR_SHOWER_COUNT = 12;
  function spawnOpts(deps, overrideColor) {
    return {
      screenW: deps.screenW,
      screenH: deps.screenH,
      themeColors: deps.themeColors,
      flow: deps.state.flow,
      maxParticles: deps.maxParticles,
      overrideColor: overrideColor ?? null
    };
  }
  function effectGlowPulse(deps) {
    deps.state.glowPulseIntensity = 0.4;
  }
  function effectGlowParticles(deps) {
    deps.state.glowPulseIntensity = 0.5;
    spawnBurst(deps.particles, deps.screenW / 2, deps.screenH * 0.3, 5, 0.6, spawnOpts(deps));
  }
  function effectColorWave(deps) {
    deps.state.glowPulseIntensity = 0.6;
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI * 2 * i / 8;
      const dist = 80;
      deps.ripples.push(
        new Ripple(
          deps.screenW / 2 + Math.cos(ang) * dist,
          deps.screenH * 0.4 + Math.sin(ang) * dist,
          deps.themeColors[i % deps.themeColors.length],
          250 + deps.state.flow * 2
        )
      );
    }
  }
  function effectStarShower(deps, count = DEFAULT_STAR_SHOWER_COUNT) {
    const n = count;
    for (let i = 0; i < n; i++) {
      if (deps.particles.length >= deps.maxParticles) break;
      const startX = (Math.random() - 0.5) * deps.screenW * 1.5;
      const startY = -deps.screenH / 2 - 50;
      const startZ = 200 + Math.random() * 400;
      const color = deps.themeColors[Math.floor(Math.random() * deps.themeColors.length)];
      deps.particles.push(
        new Particle(
          startX,
          startY,
          startZ,
          color,
          4 + Math.random() * 8,
          (Math.random() - 0.5) * 1.5,
          1 + Math.random() * 2,
          -4 - Math.random() * 2,
          // negative Z = forward
          180 + Math.random() * 80,
          "star"
        )
      );
    }
  }
  function effectFlowerBurst(deps) {
    deps.state.glowPulseIntensity = 0.7;
    for (let i = 0; i < 15; i++) {
      if (deps.particles.length >= deps.maxParticles) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 3;
      const zSpd = (Math.random() - 0.5) * 10;
      const color = deps.themeColors[Math.floor(Math.random() * deps.themeColors.length)];
      deps.particles.push(
        new Particle(
          0,
          -deps.screenH * 0.1,
          0,
          color,
          5 + Math.random() * 10,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd - 1.5,
          zSpd,
          100 + Math.random() * 80,
          "flower"
        )
      );
    }
  }
  function effectShimmer(deps) {
    const now = deps.now ?? (() => performance.now());
    deps.state.shimmerPhase = 0;
    deps.state.shimmerStartMs = now();
    deps.state.glowPulseIntensity = 0.8;
    spawnBurst(deps.particles, deps.screenW / 2, deps.screenH * 0.4, 20, 1, spawnOpts(deps));
    effectStarShower(deps, 8);
  }
  function effectRadiance(deps) {
    deps.state.glowPulseIntensity = 1;
    effectStarShower(deps, 15);
    for (let i = 0; i < 12; i++) {
      if (deps.particles.length >= deps.maxParticles) break;
      deps.ripples.push(
        new Ripple(
          deps.screenW / 2,
          deps.screenH * 0.4,
          deps.themeColors[i % deps.themeColors.length],
          300 + i * 30
        )
      );
    }
  }
  function effectGoldenBurst(deps) {
    const now = deps.now ?? (() => performance.now());
    deps.state.glowPulseIntensity = 1;
    deps.state.shimmerPhase = 0;
    deps.state.shimmerStartMs = now();
    for (let i = 0; i < 30; i++) {
      if (deps.particles.length >= deps.maxParticles) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      const zSpd = (Math.random() - 0.5) * 15;
      const color = GOLDEN_BURST_COLORS[Math.floor(Math.random() * GOLDEN_BURST_COLORS.length)];
      const type = Math.random() > 0.5 ? "star" : "circle";
      deps.particles.push(
        new Particle(
          0,
          -deps.screenH * 0.15,
          0,
          color,
          4 + Math.random() * 12,
          Math.cos(ang) * spd,
          Math.sin(ang) * spd - 2,
          zSpd,
          100 + Math.random() * 100,
          type
        )
      );
    }
    effectStarShower(deps, 10);
  }
  var EFFECT_REGISTRY = {
    glowPulse: effectGlowPulse,
    glowParticles: effectGlowParticles,
    colorWave: effectColorWave,
    starShower: (d) => effectStarShower(d),
    flowerBurst: effectFlowerBurst,
    shimmer: effectShimmer,
    radiance: effectRadiance,
    goldenBurst: effectGoldenBurst
  };
  function triggerEffect(name, deps) {
    const fn = EFFECT_REGISTRY[name];
    if (!fn) return false;
    fn(deps);
    return true;
  }

  // src/render/keyboard.ts
  var KB_WHITE = (() => {
    const out = [];
    for (let m = 21; m <= 108; m++) {
      const pc = m % 12;
      if (pc !== 1 && pc !== 3 && pc !== 6 && pc !== 8 && pc !== 10) out.push(m);
    }
    return out;
  })();
  var KB_BLACK = (() => {
    const out = [];
    for (let m = 21; m <= 108; m++) {
      const pc = m % 12;
      if (pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10) out.push(m);
    }
    return out;
  })();
  var KB_BLACK_LEFT_WHITE_IDX = (() => {
    const out = {};
    for (const bm of KB_BLACK) {
      const wi = KB_WHITE.indexOf(bm - 1);
      if (wi >= 0) out[bm] = wi;
    }
    return out;
  })();
  var WHITE_KEY_IDX = (() => {
    const m = /* @__PURE__ */ new Map();
    for (let i = 0; i < KB_WHITE.length; i++) m.set(KB_WHITE[i], i);
    return m;
  })();
  var KB_PADDING = 8;
  var HINT_TINT_LH = "120, 180, 255";
  var HINT_TINT_RH = "255, 150, 200";
  var HINT_STROKE_LH_PRIMARY = `rgba(${HINT_TINT_LH}, 0.95)`;
  var HINT_STROKE_LH_MATE = `rgba(${HINT_TINT_LH}, 0.55)`;
  var HINT_STROKE_RH_PRIMARY = `rgba(${HINT_TINT_RH}, 0.95)`;
  var HINT_STROKE_RH_MATE = `rgba(${HINT_TINT_RH}, 0.55)`;
  var HINT_BREATHING_HZ = 1.4;
  function keyboardKeyCenterX(midi, screenW) {
    const kbW = screenW - KB_PADDING * 2;
    const wKeyW = kbW / KB_WHITE.length;
    const wi = WHITE_KEY_IDX.get(midi);
    if (wi !== void 0) return KB_PADDING + (wi + 0.5) * wKeyW;
    const lwi = KB_BLACK_LEFT_WHITE_IDX[midi];
    if (lwi !== void 0) return KB_PADDING + (lwi + 1) * wKeyW;
    return NaN;
  }
  function hintTintFor(hand) {
    return hand === "L" ? HINT_TINT_LH : HINT_TINT_RH;
  }
  function drawMidiKeyboard(ctx, midi, opts) {
    const kbH = opts.kbHeight;
    const kbY = opts.screenH - kbH - opts.kbSafeBottom;
    const kbX = KB_PADDING;
    const kbW = opts.screenW - KB_PADDING * 2;
    const wKeyW = kbW / KB_WHITE.length;
    const hints = opts.hintNotes && opts.hintNotes.size > 0 ? opts.hintNotes : null;
    const breathe = hints ? 0.5 + 0.5 * Math.sin((opts.nowMs ?? 0) / 1e3 * Math.PI * 2 * HINT_BREATHING_HZ) : 0;
    ctx.save();
    ctx.fillStyle = "rgba(20, 20, 35, 0.55)";
    ctx.fillRect(kbX, kbY, kbW, kbH);
    const paintKey = (m, x, w, h, restingFill) => {
      const note = midi.activeNotes.get(m);
      const lit = !!note;
      const sustained = midi.sustainedNotes.has(m);
      const hint = lit || sustained ? null : hints?.get(m) ?? null;
      if (lit || sustained) {
        ctx.fillStyle = note && note.synColor || opts.noteThemeColor(m);
      } else {
        ctx.fillStyle = restingFill;
      }
      ctx.fillRect(x, kbY, w, h);
      if (hint) {
        const tint = hintTintFor(hint.hand);
        const baseA = hint.primary ? 0.4 : 0.22;
        const swingA = hint.primary ? 0.3 : 0.12;
        const a = baseA + swingA * breathe;
        ctx.fillStyle = `rgba(${tint}, ${a.toFixed(3)})`;
        ctx.fillRect(x, kbY, w, h);
      }
      if (lit) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      } else if (sustained) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      } else if (hint && hint.primary) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = hint.hand === "L" ? HINT_STROKE_LH_PRIMARY : HINT_STROKE_RH_PRIMARY;
      } else if (hint) {
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = hint.hand === "L" ? HINT_STROKE_LH_MATE : HINT_STROKE_RH_MATE;
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      }
      ctx.strokeRect(x, kbY, w, h);
    };
    for (let i = 0; i < KB_WHITE.length; i++) {
      paintKey(KB_WHITE[i], kbX + i * wKeyW + 0.5, wKeyW - 1, kbH, "rgba(245, 245, 250, 0.85)");
    }
    const bKeyW = wKeyW * 0.65;
    const bKeyH = kbH * 0.6;
    for (const m of KB_BLACK) {
      const wi = KB_BLACK_LEFT_WHITE_IDX[m];
      const x = kbX + (wi + 1) * wKeyW - bKeyW / 2;
      paintKey(m, x, bKeyW, bKeyH, "rgba(15, 15, 25, 0.95)");
    }
    if (hints) {
      const sz = Math.max(4, Math.min(7, wKeyW * 0.45));
      const tipY = kbY - 3;
      const baseY = tipY - sz * 1.2;
      const a = (0.7 + 0.25 * breathe).toFixed(3);
      for (const [m, hint] of hints) {
        if (!hint.primary) continue;
        if (midi.activeNotes.has(m) || midi.sustainedNotes.has(m)) continue;
        const wi = WHITE_KEY_IDX.get(m);
        const cx = wi !== void 0 ? kbX + (wi + 0.5) * wKeyW : kbX + (KB_BLACK_LEFT_WHITE_IDX[m] + 1) * wKeyW;
        ctx.fillStyle = `rgba(${hintTintFor(hint.hand)}, ${a})`;
        ctx.beginPath();
        ctx.moveTo(cx - sz, baseY);
        ctx.lineTo(cx + sz, baseY);
        ctx.lineTo(cx, tipY);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (midi.sustainOn) {
      ctx.fillStyle = "rgba(255, 200, 100, 0.85)";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(opts.sustainLabel, kbX + 6, kbY - 5);
    }
    ctx.restore();
  }

  // src/render/lane.ts
  function drawPracticeLane(ctx, view, timing, opts) {
    if (!view.enabled) return;
    const W = opts.screenW;
    const H = opts.screenH;
    const laneTop = opts.laneTopOverride ?? (opts.osmdVisible ? 332 : 50);
    const laneHeight = Math.max(280, H - laneTop - opts.kbReserve);
    const hitLineY = laneTop + laneHeight - 60;
    const pxPerMs = (laneHeight - 40) / opts.laneLookaheadMs;
    const padX = 24;
    const usableW = W - padX * 2;
    const halfW = usableW / 2;
    const midX = padX + halfW;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(40, 60, 110, 0.55)";
    ctx.fillRect(padX, laneTop, halfW, laneHeight);
    ctx.fillStyle = "rgba(110, 50, 90, 0.55)";
    ctx.fillRect(midX, laneTop, halfW, laneHeight);
    ctx.strokeStyle = "rgba(255, 220, 230, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, laneTop, usableW, laneHeight);
    ctx.fillStyle = "rgba(180, 200, 255, 0.7)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.laneLabelL, padX + halfW / 2, laneTop + 14);
    ctx.fillStyle = "rgba(255, 200, 220, 0.7)";
    ctx.fillText(opts.laneLabelR, midX + halfW / 2, laneTop + 14);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, laneTop);
    ctx.lineTo(midX, hitLineY + 50);
    ctx.stroke();
    const earlyPx = opts.hitWindowEarlyMs * pxPerMs;
    const latePx = opts.hitWindowMs * pxPerMs;
    const perfectPx = opts.perfectMs * pxPerMs;
    ctx.fillStyle = "rgba(255, 200, 230, 0.20)";
    ctx.fillRect(padX, hitLineY - earlyPx, usableW, earlyPx + latePx);
    ctx.fillStyle = "rgba(170, 255, 200, 0.30)";
    ctx.fillRect(padX, hitLineY - perfectPx, usableW, perfectPx * 2);
    ctx.save();
    ctx.shadowColor = "rgba(255, 220, 230, 0.8)";
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "rgba(255, 240, 245, 0.95)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(padX, hitLineY);
    ctx.lineTo(W - padX, hitLineY);
    ctx.stroke();
    ctx.restore();
    const winPx = earlyPx;
    const { lhMin, lhMax, rhMin, rhMax } = view.handRanges;
    const noteX = (n) => {
      if (n.hand === "L") {
        const r2 = (n.midi - lhMin) / (lhMax - lhMin);
        return padX + r2 * (halfW - 20) + 10;
      }
      const r = (n.midi - rhMin) / (rhMax - rhMin);
      return midX + r * (halfW - 20) + 10;
    };
    const elapsed = timing.elapsedMs;
    const notes = view.sectionNotes;
    const visibleMinTimeMs = elapsed - 80 / pxPerMs;
    const visibleMaxTimeMs = elapsed + laneHeight / pxPerMs;
    while (view.laneDrawFromIdx < notes.length && notes[view.laneDrawFromIdx].timeMs < visibleMinTimeMs) {
      view.laneDrawFromIdx++;
    }
    let drawnCount = 0;
    for (let i = view.laneDrawFromIdx; i < notes.length; i++) {
      if (drawnCount >= 25) break;
      const n = notes[i];
      if (n.timeMs > visibleMaxTimeMs) break;
      if (n._filtered) continue;
      drawnCount++;
      const dy = (n.timeMs - elapsed) * pxPerMs;
      const y = hitLineY - dy;
      const x = noteX(n);
      const noteH = Math.max(14, n.durMs * pxPerMs * 0.9);
      const noteW = Math.min(70, halfW / 6);
      let fill;
      if (n.hit) fill = "rgba(120, 255, 160, 0.9)";
      else if (n.missed) fill = "rgba(255, 90, 120, 0.5)";
      else fill = opts.noteRestingColor(n.midi);
      ctx.fillStyle = fill;
      ctx.shadowBlur = n.hit ? 18 : 8;
      ctx.shadowColor = fill;
      roundRect(ctx, x - noteW / 2, y - noteH, noteW, noteH, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = n.hand === "L" ? "rgba(180, 220, 255, 0.95)" : "rgba(255, 200, 220, 0.95)";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(n.hand, x, y - noteH - 4);
      if (!n.hit && !n.missed && noteH > 18) {
        ctx.fillStyle = "rgba(0,0,0,0.9)";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(opts.midiToPitchName(n.midi), x, y - noteH / 2 + 4);
      }
    }
    const cur = notes[view.currentNoteIdx];
    if (cur && !cur.hit && !cur.missed) {
      const x = noteX(cur);
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("\u25BC", x, hitLineY - winPx - 4);
      ctx.font = "bold 18px sans-serif";
      ctx.fillStyle = cur.hand === "L" ? "rgba(180,220,255,1)" : "rgba(255,200,220,1)";
      ctx.fillText(cur.hand + " \xB7 " + opts.midiToPitchName(cur.midi), x, hitLineY + 32);
    }
    if (view.isBoss) {
      ctx.fillStyle = "rgba(255, 100, 150, " + (0.05 + 0.05 * Math.sin(timing.nowMs * 5e-3)) + ")";
      ctx.fillRect(padX, laneTop, usableW, laneHeight);
    }
    const ctElapsed = timing.realElapsedMs;
    if (ctElapsed < opts.countInMs + 400) {
      const totalBeats = 4;
      const beatMs = opts.countInMs / totalBeats;
      const beatIdx = Math.min(totalBeats - 1, Math.max(0, Math.floor(ctElapsed / beatMs)));
      const remaining = totalBeats - beatIdx;
      const slotMs = ctElapsed - beatIdx * beatMs;
      const slotProgress = 1 - Math.min(1, slotMs / beatMs);
      const isGo = ctElapsed >= opts.countInMs;
      const text = isGo ? opts.countInGoLabel : String(remaining);
      const pop = isGo ? Math.max(0, 1 + 0.4 * Math.sin((ctElapsed - opts.countInMs) / 400 * Math.PI)) : 0.7 + 0.6 * slotProgress;
      const alpha = isGo ? Math.max(0, 1 - (ctElapsed - opts.countInMs) / 400) : 0.95;
      ctx.save();
      ctx.translate(W / 2, hitLineY - 60);
      ctx.scale(pop, pop);
      ctx.textAlign = "center";
      ctx.font = "bold " + (isGo ? "72" : "120") + "px sans-serif";
      ctx.shadowBlur = 30;
      ctx.shadowColor = isGo ? "rgba(255, 220, 130, .9)" : "rgba(255, 180, 220, .9)";
      ctx.fillStyle = isGo ? "rgba(255, 230, 130, " + alpha + ")" : "rgba(255, 230, 240, " + alpha + ")";
      ctx.fillText(text, 0, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // src/render/background.ts
  function initBackground(opts) {
    const rng = opts.rng ?? Math.random;
    const stars = [];
    for (let i = 0; i < opts.starCount; i++) {
      stars.push({
        x: rng() * opts.screenW,
        y: rng() * opts.screenH,
        size: rng() * 2 + 0.5,
        twinkle: rng() * Math.PI * 2,
        speed: 0.01 + rng() * 0.02
      });
    }
    return { stars };
  }
  function drawBgStars(ctx, bg, opts) {
    const visibility = Math.min(1, opts.flow / 30);
    if (visibility < 0.01) return;
    const cols = opts.themeColors;
    ctx.save();
    for (const s of bg.stars) {
      s.twinkle += s.speed;
      const a = visibility * (0.3 + 0.7 * (Math.sin(s.twinkle) * 0.5 + 0.5));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 + opts.flow * 0.01), 0, Math.PI * 2);
      ctx.fillStyle = cols[Math.floor(s.twinkle) % cols.length] || "#fff";
      ctx.fill();
    }
    ctx.restore();
  }
  function drawAurora(ctx, opts) {
    const intensity = Math.max(0, (opts.flow - 40) / 60);
    if (intensity < 0.01) return;
    const W = opts.screenW;
    const H = opts.screenH;
    const cols = opts.themeColors;
    ctx.save();
    ctx.globalAlpha = intensity * 0.15;
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      ctx.moveTo(0, H * 0.3 + band * 40);
      for (let x = 0; x <= W; x += 20) {
        const y = H * 0.3 + band * 40 + Math.sin(x * 5e-3 + opts.timeMs * 8e-4 + band) * 50 * intensity + Math.sin(x * 0.01 + opts.timeMs * 1e-3) * 25 * intensity;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.7);
      grad.addColorStop(0, cols[band % cols.length] ?? "#fff");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }
  function drawGroundFlowers(ctx, opts) {
    const intensity = Math.max(0, (opts.flow - 55) / 45);
    if (intensity < 0.01) return;
    const W = opts.screenW;
    const H = opts.screenH;
    const cols = opts.themeColors;
    ctx.save();
    ctx.globalAlpha = intensity * 0.5;
    const count = Math.floor(intensity * 12);
    for (let i = 0; i < count; i++) {
      const x = i / (count - 1 || 1) * W;
      const baseY = H - 20;
      const sway = Math.sin(opts.timeMs * 1e-3 + i * 0.7) * 5;
      const s = 4 + intensity * 6;
      ctx.strokeStyle = "rgba(100,180,100," + intensity * 0.4 + ")";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + sway, baseY - 20 - s * 2);
      ctx.stroke();
      drawFlower(
        ctx,
        x + sway,
        baseY - 20 - s * 2,
        s,
        cols[i % cols.length] ?? "#fff",
        intensity,
        false
      );
    }
    ctx.restore();
  }

  // src/render/theme.ts
  var THEMES = Object.freeze([
    {
      bg: [10, 10, 20],
      colors: ["#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#6366f1", "#818cf8"],
      glow: "rgba(139,92,246,"
    },
    {
      bg: [8, 18, 20],
      colors: ["#06b6d4", "#22d3ee", "#34d399", "#10b981", "#14b8a6", "#67e8f9"],
      glow: "rgba(6,182,212,"
    },
    {
      bg: [20, 12, 8],
      colors: ["#f97316", "#fb923c", "#ef4444", "#f43f5e", "#eab308", "#fbbf24"],
      glow: "rgba(249,115,22,"
    },
    {
      bg: [12, 12, 18],
      colors: ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#ddd6fe", "#f0f0ff", "#ffffff"],
      glow: "rgba(200,200,255,"
    }
  ]);
  function noteThemeColor(midi, theme) {
    const cols = theme.colors;
    return cols[(midi % cols.length + cols.length) % cols.length];
  }
  var DEFAULT_NOTE_NAMES = Object.freeze([
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B"
  ]);
  function synColorFor(midi, opts) {
    if (!opts.enabled) return null;
    const names = opts.noteNames ?? DEFAULT_NOTE_NAMES;
    const pc = (midi % 12 + 12) % 12;
    return getNoteColor(names[pc], opts.colorMap);
  }
  function drawBackgroundFade(ctx, opts) {
    const [r, g, b] = opts.theme.bg;
    const fadeRate = 0.08 + 0.06 * (1 - opts.flow / 100);
    ctx.fillStyle = "rgba(" + r + "," + g + "," + b + "," + fadeRate + ")";
    ctx.fillRect(0, 0, opts.screenW, opts.screenH);
  }

  // src/render/spectrum.ts
  function drawSpectrumBars(ctx, freqData, opts) {
    if (opts.barCount <= 0) return;
    if (opts.themeColors.length === 0) return;
    const sliceLen = opts.endBin - opts.startBin;
    if (sliceLen <= 0) return;
    const step = Math.floor(sliceLen / opts.barCount);
    if (step <= 0) return;
    const W = opts.screenW;
    const H = opts.screenH;
    const barW = W / opts.barCount;
    const barAlphaScale = 0.15 + opts.flow * 3e-3;
    const heightScale = H * (0.1 + opts.flow * 1e-3);
    const cols = opts.themeColors;
    for (let i = 0; i < opts.barCount; i++) {
      const idx = opts.startBin + i * step;
      if (idx >= freqData.length) break;
      const val = freqData[idx] / 255;
      const barH = val * heightScale;
      ctx.fillStyle = cols[Math.floor(i / opts.barCount * cols.length) % cols.length];
      ctx.globalAlpha = val * barAlphaScale;
      ctx.fillRect(i * barW, H - barH, barW - 1, barH);
    }
    ctx.globalAlpha = 1;
  }

  // src/render/center-glow.ts
  function drawCenterGlow(ctx, opts) {
    if (opts.smoothEnergy <= 0.04 && opts.glowExtra <= 0.02) return;
    const W = opts.screenW;
    const H = opts.screenH;
    const baseGlow = W * 0.3 * opts.smoothEnergy + 100 + opts.flow * 3;
    const glowSize = baseGlow + opts.glowExtra * W * 0.2;
    const glowAlpha = Math.min(0.4, 0.08 + opts.flow * 2e-3 + opts.glowExtra * 0.15);
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, glowSize);
    grad.addColorStop(0, opts.glowPrefix + glowAlpha + ")");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // src/render/stage.ts
  var STAGES = Object.freeze([
    { nameKey: null, prefix: "", minFlow: 0 },
    { nameKey: "stage1", prefix: "\u2726 ", minFlow: 15 },
    { nameKey: "stage2", prefix: "\u2726\u2726 ", minFlow: 35 },
    { nameKey: "stage3", prefix: "\u2726\u2726\u2726 ", minFlow: 55 },
    { nameKey: "stage4", prefix: "\u2726\u2726\u2726\u2726 ", minFlow: 75 },
    { nameKey: "stage5", prefix: "\u2726\u2726\u2726\u2726\u2726 ", minFlow: 90 },
    { nameKey: "stage6", prefix: "\u2726\u2726\u2726\u2726\u2726\u2726 ", minFlow: 98 }
  ]);
  function stageForFlow(flow, stages = STAGES) {
    for (let i = stages.length - 1; i >= 0; i--) {
      if (flow >= stages[i].minFlow) return i;
    }
    return 0;
  }
  function stageLabel(stage, t) {
    if (!stage || !stage.nameKey) return "";
    return stage.prefix + t(stage.nameKey);
  }
  function classifyStageTransition(prev, next) {
    if (next > prev) return "up";
    if (next < prev) return "down";
    return "none";
  }

  // src/state/flow-meter.ts
  function initFlowState() {
    return {
      flow: 0,
      combo: 0,
      bestCombo: 0,
      peakFlow: 0,
      lastGoodNoteTimeMs: 0,
      lastSilenceStartMs: -1,
      lastNoisePenaltyMs: 0,
      comboDecayAccum: 0
    };
  }
  function resetFlowState(state) {
    state.flow = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.peakFlow = 0;
    state.lastGoodNoteTimeMs = 0;
    state.lastSilenceStartMs = -1;
    state.lastNoisePenaltyMs = 0;
    state.comboDecayAccum = 0;
  }
  function applyFlowEvent(state, event, opts) {
    switch (event.type) {
      case "goodOnset": {
        if (event.isPerformingOrWarmup) {
          if (state.lastGoodNoteTimeMs > 0 && event.timeMs - state.lastGoodNoteTimeMs < opts.comboWindowMs) {
            state.combo++;
            if (state.combo > state.bestCombo) state.bestCombo = state.combo;
          } else {
            state.combo = Math.max(1, Math.floor(state.combo * 0.6));
            if (state.combo > state.bestCombo) state.bestCombo = state.combo;
          }
        }
        state.lastGoodNoteTimeMs = event.timeMs;
        state.lastSilenceStartMs = -1;
        state.comboDecayAccum = 0;
        return;
      }
      case "midiNote": {
        const v = Math.max(0, Math.min(127, event.velocity)) / 127;
        state.flow = Math.min(
          100,
          state.flow + opts.midiBaseFlowGain + v * opts.midiVelocityFlowGain
        );
        if (state.flow > state.peakFlow) state.peakFlow = state.flow;
        state.combo += 1;
        if (state.combo > state.bestCombo) state.bestCombo = state.combo;
        state.lastGoodNoteTimeMs = event.timeMs;
        state.lastSilenceStartMs = -1;
        return;
      }
      case "activeTick": {
        state.lastSilenceStartMs = -1;
        const comboFactor = Math.min(state.combo / 50, 1);
        let flowGain = (opts.flowGainBase + comboFactor * opts.flowGainComboMax + event.pitchStability * opts.flowGainStabilityMax + event.qualityScore * opts.flowGainQualityMax) * event.dtSec;
        if (!event.isPerforming) flowGain *= opts.flowGainNonPerformingMultiplier;
        state.flow = Math.min(100, state.flow + flowGain);
        if (state.flow > state.peakFlow) state.peakFlow = state.flow;
        return;
      }
      case "idleTick": {
        if (state.lastSilenceStartMs < 0) state.lastSilenceStartMs = event.timeMs;
        const silenceDuration = event.timeMs - state.lastSilenceStartMs;
        if (silenceDuration > opts.silenceDecayStartMs) {
          state.flow = Math.max(0, state.flow - opts.flowDecaySoft * event.dtSec);
          if (silenceDuration > opts.silenceHardDecayMs) {
            state.flow = Math.max(0, state.flow - opts.flowDecayHard * event.dtSec);
            state.comboDecayAccum += opts.comboDecayRate * 60 * event.dtSec;
            if (state.comboDecayAccum >= 1) {
              const drops = Math.floor(state.comboDecayAccum);
              state.combo = Math.max(0, state.combo - drops);
              state.comboDecayAccum -= drops;
            }
          }
        }
        return;
      }
      case "noiseTick": {
        if (event.timeMs - state.lastNoisePenaltyMs > opts.noisePenaltyCooldownMs) {
          state.flow = Math.max(0, state.flow - opts.flowNoisePenalty * event.dtSec);
          state.combo = Math.max(0, state.combo - opts.comboNoisePenalty);
          state.lastNoisePenaltyMs = event.timeMs;
        }
        return;
      }
    }
  }

  // src/state/encouragement.ts
  var DEFAULT_ENCOURAGEMENT_TIERS = Object.freeze([
    { minCombo: 3, messageKey: "enc1", effect: "glowPulse" },
    { minCombo: 8, messageKey: "enc2", effect: "glowParticles" },
    { minCombo: 15, messageKey: "enc3", effect: "colorWave" },
    { minCombo: 25, messageKey: "enc4", effect: "starShower" },
    { minCombo: 40, messageKey: "enc5", effect: "flowerBurst" },
    { minCombo: 60, messageKey: "enc6", effect: "shimmer" },
    { minCombo: 80, messageKey: "enc7", effect: "radiance" },
    { minCombo: 100, messageKey: "enc8", effect: "goldenBurst" }
  ]);
  function initEncouragementState() {
    return {
      currentTier: -1,
      lastShownTimeMs: 0,
      hideTimeMs: -1
    };
  }
  function resetEncouragementState(state) {
    state.currentTier = -1;
    state.lastShownTimeMs = 0;
    state.hideTimeMs = -1;
  }
  function pickTier(combo, tiers) {
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (combo >= tiers[i].minCombo) return i;
    }
    return -1;
  }
  function applyEncouragementEvent(state, event, opts) {
    const tiers = opts.tiers ?? DEFAULT_ENCOURAGEMENT_TIERS;
    if (event.type === "comboChanged") {
      const bestTier = pickTier(event.combo, tiers);
      if (bestTier > state.currentTier && bestTier >= 0) {
        const tier = tiers[bestTier];
        state.currentTier = bestTier;
        state.lastShownTimeMs = event.timeMs;
        state.hideTimeMs = event.timeMs + opts.displayMs;
        return {
          kind: "show",
          tier: bestTier,
          messageKey: tier.messageKey,
          effect: tier.effect
        };
      }
      if (bestTier < state.currentTier) {
        state.currentTier = bestTier;
      }
      return { kind: "none" };
    }
    if (state.hideTimeMs > 0 && event.timeMs >= state.hideTimeMs) {
      state.hideTimeMs = -1;
      return { kind: "hide" };
    }
    return { kind: "none" };
  }

  // src/state/quest-tracker.ts
  function initQuestTrackerState() {
    return {
      completedIds: [],
      lastCheckMs: -Infinity
    };
  }
  function resetQuestTrackerState(state) {
    state.completedIds.length = 0;
    state.lastCheckMs = -Infinity;
  }
  function applyQuestTick(state, observation, timeMs, quests, opts) {
    if (timeMs - state.lastCheckMs < opts.throttleMs) return null;
    state.lastCheckMs = timeMs;
    const completedSet = new Set(state.completedIds);
    let completedThisTick = null;
    for (const q of quests) {
      if (completedSet.has(q.id)) continue;
      if (q.condition(observation)) {
        state.completedIds.push(q.id);
        completedSet.add(q.id);
        completedThisTick = q.id;
        state.lastCheckMs = timeMs + opts.postCompletionDelayMs;
        break;
      }
    }
    let firstUndone = null;
    for (const q of quests) {
      if (!completedSet.has(q.id)) {
        firstUndone = q.id;
        break;
      }
    }
    const allDone = firstUndone === null && quests.length > 0;
    return { completedThisTick, firstUndone, allDone };
  }

  // src/audio/chord.ts
  var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var CHORD_DICT = {
    "0,4,7": "",
    "0,3,7": "m",
    "0,4,8": "aug",
    "0,3,6": "dim",
    "0,4,7,10": "7",
    "0,4,7,11": "maj7",
    "0,3,7,10": "m7",
    "0,3,6,9": "dim7",
    "0,5,7": "sus4",
    "0,2,7": "sus2"
  };
  var _pcBuckets = new Uint8Array(12);
  function detectChord(midis) {
    if (midis.length < 3) return null;
    let root = 128;
    for (let i = 0; i < midis.length; i++) {
      if (midis[i] < root) root = midis[i];
    }
    if (root > 127) return null;
    _pcBuckets.fill(0);
    for (let i = 0; i < midis.length; i++) {
      _pcBuckets[((midis[i] - root) % 12 + 12) % 12] = 1;
    }
    let sig = "";
    for (let pc = 0; pc < 12; pc++) {
      if (_pcBuckets[pc]) sig += (sig ? "," : "") + pc;
    }
    const quality = CHORD_DICT[sig];
    if (quality === void 0) return null;
    return NOTE_NAMES[(root % 12 + 12) % 12] + quality;
  }

  // src/audio/yin.ts
  var DEFAULTS = {
    threshold: 0.2,
    probabilityThreshold: 0.1,
    rmsSilenceThreshold: 8e-3,
    pitchMinHz: 25,
    pitchMaxHz: 5e3
  };
  var _diffBuf = null;
  var _cmndfBuf = null;
  function detectPitchYIN(buf, sampleRate, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const SIZE = buf.length;
    let rmsSum = 0;
    for (let i = 0; i < SIZE; i++) rmsSum += buf[i] * buf[i];
    const rms = Math.sqrt(rmsSum / SIZE);
    if (rms < o.rmsSilenceThreshold) return { pitch: -1, conf: 0, rms };
    const halfLen = Math.floor(SIZE / 2);
    const tauMin = Math.floor(sampleRate / o.pitchMaxHz);
    const tauMax = Math.min(halfLen, Math.floor(sampleRate / o.pitchMinHz));
    if (tauMax <= tauMin + 2) return { pitch: -1, conf: 0, rms };
    if (!_diffBuf || _diffBuf.length < tauMax + 1) {
      _diffBuf = new Float32Array(tauMax + 1);
      _cmndfBuf = new Float32Array(tauMax + 1);
    }
    const diff = _diffBuf;
    const cmndf = _cmndfBuf;
    diff[0] = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < halfLen; j++) {
        const delta = buf[j] - buf[j + tau];
        sum += delta * delta;
      }
      diff[tau] = sum;
    }
    cmndf[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      runningSum += diff[tau];
      cmndf[tau] = runningSum > 0 ? diff[tau] * tau / runningSum : 0;
    }
    let bestTau = -1;
    for (let tau = tauMin; tau < tauMax; tau++) {
      if (cmndf[tau] < o.threshold) {
        while (tau + 1 < tauMax && cmndf[tau + 1] < cmndf[tau]) tau++;
        bestTau = tau;
        break;
      }
    }
    if (bestTau < 0) {
      let minVal = Infinity;
      for (let tau = tauMin; tau <= tauMax; tau++) {
        if (cmndf[tau] < minVal) {
          minVal = cmndf[tau];
          bestTau = tau;
        }
      }
      if (minVal > 0.5) return { pitch: -1, conf: 0, rms };
    }
    let refinedTau = bestTau;
    if (bestTau > 0 && bestTau < tauMax) {
      const s0 = cmndf[bestTau - 1];
      const s1 = cmndf[bestTau];
      const s2 = cmndf[bestTau + 1];
      const denom = 2 * (2 * s1 - s0 - s2);
      if (Math.abs(denom) > 1e-10) {
        const corr = (s0 - s2) / denom;
        refinedTau = bestTau + Math.max(-1, Math.min(1, corr));
      }
    }
    if (refinedTau <= 0) return { pitch: -1, conf: 0, rms };
    const pitch = sampleRate / refinedTau;
    const conf = 1 - cmndf[bestTau];
    if (pitch < o.pitchMinHz || pitch > o.pitchMaxHz) {
      return { pitch: -1, conf, rms };
    }
    if (conf < o.probabilityThreshold) {
      return { pitch: -1, conf, rms };
    }
    return { pitch, conf, rms };
  }
  function freqToNote(f, pitchMinHz = DEFAULTS.pitchMinHz, pitchMaxHz = DEFAULTS.pitchMaxHz) {
    if (f < pitchMinHz || f > pitchMaxHz) return null;
    const NOTE_NAMES2 = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const n = 12 * Math.log2(f / 440) + 69;
    const r = Math.round(n);
    return {
      name: NOTE_NAMES2[(r % 12 + 12) % 12],
      octave: Math.floor(r / 12) - 1,
      noteNum: r,
      freq: f
    };
  }

  // src/audio/spectral.ts
  function computeSpectralFlatness(spectrum, startBin, endBin) {
    const n = endBin - startBin;
    if (n < 2) return 0;
    let logSum = 0;
    let arithSum = 0;
    let validBins = 0;
    for (let i = startBin; i < endBin; i++) {
      const val = spectrum[i] + 1e-10;
      logSum += Math.log(val);
      arithSum += val;
      validBins++;
    }
    if (validBins === 0 || arithSum < 1e-8) return 0;
    const geometricMean = Math.exp(logSum / validBins);
    const arithmeticMean = arithSum / validBins;
    return geometricMean / arithmeticMean;
  }
  function computeSpectralCrest(spectrum, startBin, endBin) {
    const n = endBin - startBin;
    if (n < 2) return 0;
    let maxVal = 0;
    let sum = 0;
    for (let i = startBin; i < endBin; i++) {
      if (spectrum[i] > maxVal) maxVal = spectrum[i];
      sum += spectrum[i];
    }
    const mean = sum / n;
    if (mean < 1e-8) return 0;
    return maxVal / mean;
  }
  function computeSpectralCentroid(spectrum, startBin, endBin, binHz) {
    let weightedSum = 0;
    let totalEnergy = 0;
    for (let i = startBin; i < endBin; i++) {
      const val = spectrum[i];
      weightedSum += val * (i * binHz);
      totalEnergy += val;
    }
    if (totalEnergy < 1e-8) return 0;
    return weightedSum / totalEnergy;
  }
  function coefficientOfVariation(arr) {
    if (arr.length < 3) return 0;
    let mean = 0;
    for (let i = 0; i < arr.length; i++) mean += arr[i];
    mean /= arr.length;
    if (Math.abs(mean) < 1e-10) return 0;
    let variance = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = arr[i] - mean;
      variance += d * d;
    }
    variance /= arr.length;
    return Math.sqrt(variance) / Math.abs(mean);
  }

  // src/audio/harmonicity.ts
  var DEFAULTS2 = {
    partials: 6,
    binTolerance: 2
  };
  function computeHarmonicity(spectrum, fundamentalBin, startBin, endBin, opts = {}) {
    if (fundamentalBin <= 0 || fundamentalBin >= endBin) return 0;
    const o = { ...DEFAULTS2, ...opts };
    const tol = o.binTolerance;
    let harmonicEnergy = 0;
    let totalEnergy = 0;
    for (let i = startBin; i < endBin; i++) {
      const val = spectrum[i] / 255;
      totalEnergy += val * val;
    }
    if (totalEnergy < 1e-6) return 0;
    for (let h = 1; h <= o.partials + 1; h++) {
      const harmonicBin = Math.round(fundamentalBin * h);
      if (harmonicBin >= endBin) break;
      const lo = Math.max(startBin, harmonicBin - tol);
      const hi = Math.min(endBin - 1, harmonicBin + tol);
      for (let i = lo; i <= hi; i++) {
        const val = spectrum[i] / 255;
        harmonicEnergy += val * val;
      }
    }
    return harmonicEnergy / totalEnergy;
  }

  // src/audio/agc.ts
  function initAgcState(initialGain = 1) {
    return {
      gain: initialGain,
      smoothedRms: 0,
      lastUpdateMs: 0,
      voiceSuppressUntilMs: 0
    };
  }
  function stepAgc(prev, timeMs, postGainRms, opts) {
    if (timeMs - prev.lastUpdateMs < opts.updateIntervalMs) {
      return { state: prev, gainOut: null };
    }
    const rmsCoeff = opts.rmsSmoothingCoeff ?? 0.15;
    const smoothedRms = prev.smoothedRms + (postGainRms - prev.smoothedRms) * rmsCoeff;
    const preGainRms = smoothedRms / Math.max(prev.gain, 1e-6);
    if (preGainRms < opts.silenceFloor) {
      return {
        state: { ...prev, smoothedRms, lastUpdateMs: timeMs },
        gainOut: null
      };
    }
    const effectiveMax = timeMs < prev.voiceSuppressUntilMs ? opts.voiceSuppressMax : opts.maxGain;
    const ratio = opts.targetRms / (smoothedRms + 1e-10);
    const targetGain = Math.max(opts.minGain, Math.min(effectiveMax, prev.gain * ratio));
    const alpha = targetGain > prev.gain ? opts.attackCoeff : opts.releaseCoeff;
    let newGain = prev.gain + (targetGain - prev.gain) * alpha;
    newGain = Math.max(opts.minGain, Math.min(effectiveMax, newGain));
    return {
      state: {
        gain: newGain,
        smoothedRms,
        lastUpdateMs: timeMs,
        voiceSuppressUntilMs: prev.voiceSuppressUntilMs
      },
      gainOut: newGain
    };
  }
  function suppressVoice(prev, nowMs, durationMs) {
    return { ...prev, voiceSuppressUntilMs: nowMs + durationMs };
  }

  // src/audio/onset.ts
  var EMPTY_DEBUG = {
    flux: 0,
    spread: 0,
    flatness: 0,
    crest: 0,
    centroid: 0,
    centroidCV: 0,
    harmonicity: 0,
    threshold: 0,
    onsetReason: ""
  };
  function initOnsetState() {
    return {
      prevSpectrum: null,
      fluxHistory: [],
      centroidHistory: [],
      consecutiveOnsetFrames: 0,
      agcVoiceRejectCount: 0,
      agcVoiceSuppressUntilMs: 0,
      lastOnsetTimeMs: -Infinity
    };
  }
  function stepOnset(prev, frame, opts) {
    const { spectrum, binHz, currentPitchHz, timeMs, rms } = frame;
    const startBin = Math.max(1, Math.floor(opts.fluxFreqMinHz / binHz));
    const endBin = Math.min(spectrum.length, Math.floor(opts.fluxFreqMaxHz / binHz));
    const numBins = endBin - startBin;
    const gateOpenStandard = timeMs - prev.lastOnsetTimeMs < opts.onsetGateDurationMs;
    if (numBins < 10) {
      return { state: prev, isOnset: false, gateOpen: gateOpenStandard, debug: EMPTY_DEBUG };
    }
    if (!prev.prevSpectrum) {
      const seeded = new Float32Array(spectrum.length);
      seeded.set(spectrum);
      return {
        state: { ...prev, prevSpectrum: seeded },
        isOnset: false,
        gateOpen: false,
        debug: EMPTY_DEBUG
      };
    }
    let flux = 0;
    let spreadCount = 0;
    for (let i = startBin; i < endBin; i++) {
      const diff = spectrum[i] - prev.prevSpectrum[i];
      if (diff > 0) {
        flux += diff;
        if (diff > opts.onsetSpreadMinChange) spreadCount++;
      }
    }
    const spread = spreadCount / numBins;
    const flatness = computeSpectralFlatness(spectrum, startBin, endBin);
    const crest = computeSpectralCrest(spectrum, startBin, endBin);
    const centroid = computeSpectralCentroid(spectrum, startBin, endBin, binHz);
    const centroidHistory = prev.centroidHistory;
    centroidHistory.push(centroid);
    while (centroidHistory.length > opts.centroidHistorySize) centroidHistory.shift();
    const centroidCV = coefficientOfVariation(centroidHistory);
    let harmonicity = 0;
    let harmonicityOk = true;
    if (currentPitchHz > opts.pitchMinHz) {
      const fundamentalBin = Math.round(currentPitchHz / binHz);
      harmonicity = computeHarmonicity(spectrum, fundamentalBin, startBin, endBin);
      harmonicityOk = harmonicity >= opts.harmonicityMin;
    }
    prev.prevSpectrum.set(spectrum);
    const fluxHistory = prev.fluxHistory;
    fluxHistory.push(flux);
    while (fluxHistory.length > opts.spectralFluxHistorySize) fluxHistory.shift();
    let isOnset = false;
    let onsetReason = "";
    let threshold = 0;
    let consecutiveOnsetFrames = prev.consecutiveOnsetFrames;
    let agcVoiceRejectCount = prev.agcVoiceRejectCount;
    let agcVoiceSuppressUntilMs = prev.agcVoiceSuppressUntilMs;
    let lastOnsetTimeMs = prev.lastOnsetTimeMs;
    if (fluxHistory.length >= 5) {
      let mean = 0;
      for (let i = 0; i < fluxHistory.length; i++) mean += fluxHistory[i];
      mean /= fluxHistory.length;
      let variance = 0;
      for (let i = 0; i < fluxHistory.length; i++) {
        const d = fluxHistory[i] - mean;
        variance += d * d;
      }
      variance /= fluxHistory.length;
      const stddev = Math.sqrt(variance);
      const adaptiveThreshold = mean + opts.spectralFluxAdaptiveK * stddev;
      threshold = Math.max(opts.spectralFluxThreshold, adaptiveThreshold);
      const fluxOk = flux > threshold;
      const spreadOk = spread > opts.onsetSpreadThreshold && spread < opts.onsetSpreadMax;
      const flatnessOk = flatness > opts.flatnessPianoMin;
      const crestOk = crest < opts.crestVoiceMax;
      const allConditionsMet = fluxOk && spreadOk && flatnessOk && crestOk && harmonicityOk;
      if (allConditionsMet) {
        consecutiveOnsetFrames++;
      } else {
        consecutiveOnsetFrames = 0;
      }
      if (allConditionsMet && consecutiveOnsetFrames >= opts.hysteresisFrames) {
        if (timeMs - lastOnsetTimeMs > opts.onsetCooldownMs) {
          lastOnsetTimeMs = timeMs;
          isOnset = true;
          onsetReason = "PIANO";
          consecutiveOnsetFrames = 0;
          agcVoiceRejectCount = 0;
        }
      } else if (fluxOk && spreadOk) {
        if (rms > opts.agcVoiceRmsMin) {
          agcVoiceRejectCount++;
          if (agcVoiceRejectCount >= opts.agcVoiceRejectCount) {
            agcVoiceSuppressUntilMs = timeMs + opts.agcVoiceSuppressMs;
          }
        }
        if (!harmonicityOk) onsetReason = "REJ:harm";
        else if (!flatnessOk) onsetReason = "REJ:flat";
        else if (!crestOk) onsetReason = "REJ:crest";
      }
    }
    const gateOpen = timeMs - lastOnsetTimeMs < opts.onsetGateDurationMs;
    return {
      state: {
        prevSpectrum: prev.prevSpectrum,
        fluxHistory,
        centroidHistory,
        consecutiveOnsetFrames,
        agcVoiceRejectCount,
        agcVoiceSuppressUntilMs,
        lastOnsetTimeMs
      },
      isOnset,
      gateOpen,
      debug: {
        flux,
        spread,
        flatness,
        crest,
        centroid,
        centroidCV,
        harmonicity,
        threshold,
        onsetReason
      }
    };
  }

  // src/audio/audio-context.ts
  var AUDIO_SAMPLE_RATE = 48e3;
  function createAudioContext(Ctor) {
    const Constructor = Ctor ?? globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Constructor) {
      throw new Error("AudioContext is not available in this environment");
    }
    try {
      return new Constructor({
        sampleRate: AUDIO_SAMPLE_RATE,
        latencyHint: "interactive"
      });
    } catch (_e) {
      return new Constructor();
    }
  }
  function buildAudioGraph(ctx, opts) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.initialGain ?? 1, ctx.currentTime);
    const mainAnalyser = ctx.createAnalyser();
    mainAnalyser.fftSize = opts.fftSize;
    mainAnalyser.smoothingTimeConstant = opts.smoothing;
    gain.connect(mainAnalyser);
    const onsetAnalyser = ctx.createAnalyser();
    onsetAnalyser.fftSize = opts.onsetFftSize;
    onsetAnalyser.smoothingTimeConstant = opts.onsetSmoothing;
    gain.connect(onsetAnalyser);
    const dataArray = new Uint8Array(mainAnalyser.frequencyBinCount);
    const freqArray = new Float32Array(mainAnalyser.fftSize);
    const onsetDataArray = new Uint8Array(onsetAnalyser.frequencyBinCount);
    let micSource = null;
    if (opts.micStream && opts.micStream.active) {
      try {
        micSource = ctx.createMediaStreamSource(opts.micStream);
        micSource.connect(gain);
      } catch (_e) {
        micSource = null;
      }
    }
    return {
      ctx,
      gain,
      mainAnalyser,
      onsetAnalyser,
      dataArray,
      freqArray,
      onsetDataArray,
      micSource
    };
  }
  async function recoverAudioContext(prev, opts, Ctor) {
    try {
      await prev.ctx.close();
    } catch (_e) {
    }
    const ctx = createAudioContext(Ctor);
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch (_e) {
      }
    }
    return buildAudioGraph(ctx, opts);
  }

  // src/library/musicxml-meta.ts
  function parseMusicXmlMetadata(xmlText, opts = {}) {
    const ParserCtor = opts.parser ?? (typeof DOMParser !== "undefined" ? new DOMParser() : null);
    if (!ParserCtor) {
      throw new Error("DOMParser not available; pass opts.parser");
    }
    const parser = "parseFromString" in ParserCtor ? ParserCtor : new ParserCtor();
    const dom = parser.parseFromString(xmlText, "text/xml");
    if (dom.querySelector("parsererror")) {
      throw new Error("MusicXML parse error");
    }
    const titleEl = dom.querySelector("work > work-title") ?? dom.querySelector("movement-title");
    const composerEl = dom.querySelector('identification > creator[type="composer"]') ?? dom.querySelector("identification > creator");
    const parts = dom.querySelectorAll("part");
    const measureCount = parts.length > 0 ? parts[0].querySelectorAll("measure").length : 0;
    return {
      title: (titleEl?.textContent ?? "").trim(),
      composer: (composerEl?.textContent ?? "").trim(),
      measureCount
    };
  }

  // src/library/auto-section.ts
  function collectSectionCandidates(xmlText, opts = {}) {
    const ParserCtor = opts.parser ?? (typeof DOMParser !== "undefined" ? new DOMParser() : null);
    if (!ParserCtor) throw new Error("DOMParser not available; pass opts.parser");
    const parser = "parseFromString" in ParserCtor ? ParserCtor : new ParserCtor();
    const dom = parser.parseFromString(xmlText, "text/xml");
    const out = {
      rehearsal: [],
      doubleBar: [],
      repeatFwd: [],
      keyChange: [],
      timeChange: [],
      total: 0
    };
    const partEls = dom.querySelectorAll("part");
    if (partEls.length === 0) return out;
    const measures = partEls[0].querySelectorAll("measure");
    out.total = measures.length;
    let prevKey = null;
    let prevTime = null;
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      if (m.querySelector("direction-type > rehearsal")) out.rehearsal.push(i);
      const barlines = m.querySelectorAll("barline");
      for (let bi = 0; bi < barlines.length; bi++) {
        const bl = barlines[bi];
        const style = bl.querySelector("bar-style")?.textContent ?? "";
        if (style === "light-light") {
          const loc = bl.getAttribute("location") ?? "right";
          const idx = loc === "right" ? i + 1 : i;
          if (idx > 0 && idx < measures.length) out.doubleBar.push(idx);
        }
        const repeats = bl.querySelectorAll("repeat");
        for (let ri = 0; ri < repeats.length; ri++) {
          if (repeats[ri].getAttribute("direction") === "forward") out.repeatFwd.push(i);
        }
      }
      const keyEl = m.querySelector("attributes > key > fifths");
      if (keyEl) {
        const k = keyEl.textContent ?? "";
        if (prevKey != null && k !== prevKey) out.keyChange.push(i);
        prevKey = k;
      }
      const timeEl = m.querySelector("attributes > time");
      if (timeEl) {
        const sig = (timeEl.querySelector("beats")?.textContent ?? "") + "/" + (timeEl.querySelector("beat-type")?.textContent ?? "");
        if (prevTime != null && sig !== prevTime) out.timeChange.push(i);
        prevTime = sig;
      }
    }
    return out;
  }
  var CANDIDATE_SCORES = {
    rehearsal: 100,
    doubleBar: 80,
    repeatFwd: 60,
    keyChange: 50,
    timeChange: 40
  };
  var DISTANCE_PENALTY_PER_MEASURE = 4;
  function autoSectionDefs(xmlText, measureCount, opts = {}) {
    const cand = collectSectionCandidates(xmlText, opts);
    const total = Math.max(1, measureCount ?? cand.total);
    if (total < 3) {
      return [
        { id: "A1", nameKey: "userSecA1", descKey: "userSecA1desc", startMeasure: 0, isBoss: false }
      ];
    }
    const pool = [];
    const pushAll = (idxs, score) => {
      for (const i of idxs) {
        if (i > 0 && i < total) pool.push({ idx: i, score });
      }
    };
    pushAll(cand.rehearsal, CANDIDATE_SCORES.rehearsal);
    pushAll(cand.doubleBar, CANDIDATE_SCORES.doubleBar);
    pushAll(cand.repeatFwd, CANDIDATE_SCORES.repeatFwd);
    pushAll(cand.keyChange, CANDIDATE_SCORES.keyChange);
    pushAll(cand.timeChange, CANDIDATE_SCORES.timeChange);
    const idealB1 = Math.floor(total / 3);
    const idealB2 = Math.floor(2 * total / 3);
    const tol = Math.max(2, Math.floor(total * 0.25));
    const pickNear = (target, exclude) => {
      let best = target;
      let bestScore = -Infinity;
      for (const c of pool) {
        if (c.idx === exclude) continue;
        const dist = Math.abs(c.idx - target);
        if (dist > tol) continue;
        const score = c.score - dist * DISTANCE_PENALTY_PER_MEASURE;
        if (score > bestScore) {
          bestScore = score;
          best = c.idx;
        }
      }
      return best;
    };
    const b1 = pickNear(idealB1, -1);
    let b2 = pickNear(idealB2, b1);
    if (b2 <= b1) b2 = Math.min(total - 1, b1 + 1);
    return [
      { id: "A1", nameKey: "userSecA1", descKey: "userSecA1desc", startMeasure: 0, isBoss: false },
      { id: "B", nameKey: "userSecB", descKey: "userSecBdesc", startMeasure: b1, isBoss: false },
      { id: "A2", nameKey: "userSecA2", descKey: "userSecA2desc", startMeasure: b2, isBoss: true }
    ];
  }

  // src/library/user-songs.ts
  var USER_DB_NAME = "pianoViz_v1";
  var USER_DB_STORE = "userSongs";
  function openUserDb(opts = {}) {
    const factory = opts.factory ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new Error("IndexedDB not available"));
    const dbName = opts.dbName ?? USER_DB_NAME;
    const storeName = opts.storeName ?? USER_DB_STORE;
    return new Promise((resolve, reject) => {
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function userDbAll(db, storeName = USER_DB_STORE) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }
  function userDbPut(db, record, storeName = USER_DB_STORE) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function userDbDelete(db, id, storeName = USER_DB_STORE) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  var defaultIdGenerator = () => "usr_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  async function detectIsMxl(blob, filename) {
    if (blob.type === "application/vnd.recordare.musicxml+zip") return true;
    if ((filename || "").toLowerCase().endsWith(".mxl")) return true;
    if (blob.size < 2) return false;
    return await blob.slice(0, 2).text() === "PK";
  }
  async function unzipScoreXml(blob, jszip) {
    const zip = await jszip.loadAsync(await blob.arrayBuffer());
    let scorePath = null;
    const containerFile = zip.file("META-INF/container.xml");
    if (containerFile) {
      const containerXml = await containerFile.async("text");
      const m = containerXml.match(/full-path="([^"]+)"/);
      if (m) scorePath = m[1];
    }
    if (!scorePath) {
      for (const name of Object.keys(zip.files)) {
        if (name.endsWith(".xml") && !name.startsWith("META-INF")) {
          scorePath = name;
          break;
        }
      }
    }
    if (!scorePath) throw new Error("No score file inside .mxl archive");
    const scoreFile = zip.file(scorePath);
    if (!scoreFile) throw new Error("Score path not found in archive: " + scorePath);
    return scoreFile.async("text");
  }
  async function parseUserSongFromBlob(blob, opts = {}) {
    const filename = opts.filename ?? "";
    const isMxl = await detectIsMxl(blob, filename);
    let xmlText;
    if (isMxl) {
      const jszip = opts.jszip ?? globalThis.JSZip;
      if (!jszip) {
        throw new Error("Cannot read .mxl metadata without JSZip. Use .musicxml instead.");
      }
      xmlText = await unzipScoreXml(blob, jszip);
    } else {
      xmlText = await blob.text();
    }
    const meta = parseMusicXmlMetadata(xmlText, opts.parser ? { parser: opts.parser } : {});
    if (meta.measureCount < 1) throw new Error("Score has no measures");
    const id = (opts.generateId ?? defaultIdGenerator)();
    const sectionDefs = autoSectionDefs(
      xmlText,
      meta.measureCount,
      opts.parser ? { parser: opts.parser } : {}
    );
    return {
      id,
      title: opts.titleOverride || meta.title || (filename || "Untitled").replace(/\.[^.]+$/, ""),
      composer: opts.composerOverride || meta.composer || "",
      mxlBlob: blob,
      mimeType: isMxl ? "application/vnd.recordare.musicxml+zip" : "application/vnd.recordare.musicxml+xml",
      sectionDefs,
      addedAt: Date.now(),
      source: opts.source ?? "upload"
    };
  }
  function makeUserSong(record, opts = {}) {
    const factory = opts.urlFactory ?? (typeof URL !== "undefined" ? URL.createObjectURL : null);
    if (!factory) throw new Error("URL.createObjectURL not available; pass opts.urlFactory");
    const url = factory(record.mxlBlob);
    const isMxl = record.mimeType !== "application/vnd.recordare.musicxml+xml";
    return {
      id: record.id,
      titleKey: "__userTitle:" + record.id,
      composerKey: "__userComposer:" + record.id,
      icon: opts.icon ?? "\u{1F3B5}",
      mxlUrl: isMxl ? url : null,
      xmlUrl: !isMxl ? url : null,
      sectionDefs: record.sectionDefs,
      notes: null,
      totalSec: 0,
      sections: [],
      playbackOrder: [],
      measureToCursorStep: [],
      _loaded: false,
      _loadingPromise: null,
      _isUser: true,
      _userTitle: record.title || record.id,
      _userComposer: record.composer || ""
    };
  }

  // src/state/session-confidence.ts
  var SESSION_RING_CAP = 100;
  function initSessionConfidenceState() {
    const ring = new Array(SESSION_RING_CAP);
    for (let i = 0; i < SESSION_RING_CAP; i++) ring[i] = { timeMs: 0, isPiano: false };
    return {
      phase: "waiting",
      confidence: 0,
      ring,
      ringHead: 0,
      ringTail: 0,
      ringSize: 0,
      pianoCount: 0,
      phaseStartMs: 0,
      performingStartMs: 0,
      // -Infinity ensures the first stepSessionConfidence call always passes the
      // throttle check, regardless of when it lands on the timeline (t=0, t=100, etc.).
      lastSampleMs: -Infinity,
      goalWindowStartMs: 0,
      goalCelebrateUntilMs: 0,
      goalCompletedCount: 0
    };
  }
  function resetSessionConfidence(s) {
    for (let i = 0; i < SESSION_RING_CAP; i++) s.ring[i].isPiano = false;
    s.phase = "waiting";
    s.confidence = 0;
    s.ringHead = 0;
    s.ringTail = 0;
    s.ringSize = 0;
    s.pianoCount = 0;
    s.phaseStartMs = 0;
    s.performingStartMs = 0;
    s.lastSampleMs = -Infinity;
    s.goalWindowStartMs = 0;
    s.goalCelebrateUntilMs = 0;
    s.goalCompletedCount = 0;
    return s;
  }
  function stepSessionConfidence(s, timeMs, isPianoDetected, opts) {
    if (timeMs - s.lastSampleMs < opts.sampleIntervalMs) {
      return { state: s, events: [], ticked: false };
    }
    s.lastSampleMs = timeMs;
    const entry = s.ring[s.ringHead];
    if (s.ringSize === SESSION_RING_CAP && entry.isPiano) s.pianoCount--;
    entry.timeMs = timeMs;
    entry.isPiano = isPianoDetected;
    if (isPianoDetected) s.pianoCount++;
    if (s.ringSize < SESSION_RING_CAP) {
      s.ringSize++;
    } else {
      s.ringTail = (s.ringTail + 1) % SESSION_RING_CAP;
    }
    s.ringHead = (s.ringHead + 1) % SESSION_RING_CAP;
    const windowStart = timeMs - opts.windowMs;
    while (s.ringSize > 0 && s.ring[s.ringTail].timeMs < windowStart) {
      if (s.ring[s.ringTail].isPiano) s.pianoCount--;
      s.ringTail = (s.ringTail + 1) % SESSION_RING_CAP;
      s.ringSize--;
    }
    if (s.ringSize < 3) {
      s.confidence = 0;
      return { state: s, events: [], ticked: true };
    }
    s.confidence = s.pianoCount / s.ringSize;
    const events = [];
    const prevPhase = s.phase;
    switch (s.phase) {
      case "waiting":
        if (s.confidence >= opts.confirmThreshold) {
          s.phase = "warmup";
          s.phaseStartMs = timeMs;
        }
        break;
      case "warmup":
        if (s.confidence < opts.loseThreshold) {
          s.phase = "waiting";
        } else if (timeMs - s.phaseStartMs >= opts.warmupMs && s.confidence >= opts.confirmThreshold) {
          s.phase = "performing";
          s.performingStartMs = timeMs;
          s.goalWindowStartMs = timeMs;
        }
        break;
      case "performing":
        if (s.confidence < opts.loseThreshold) {
          s.phase = "warmup";
          s.phaseStartMs = timeMs;
        }
        break;
    }
    if (prevPhase !== s.phase) {
      events.push({ type: "phaseEnter", from: prevPhase, to: s.phase, timeMs });
      if (prevPhase !== "performing" && s.phase === "performing") {
        s.goalWindowStartMs = timeMs;
      }
    }
    if (s.phase === "performing") {
      if (s.goalWindowStartMs <= 0) s.goalWindowStartMs = timeMs;
      const elapsedGoal = timeMs - s.goalWindowStartMs;
      if (elapsedGoal >= opts.motivationGoalMs) {
        s.goalCompletedCount++;
        s.goalWindowStartMs = timeMs;
        s.goalCelebrateUntilMs = timeMs + opts.celebrationDurationMs;
        events.push({ type: "goalCompleted", timeMs, totalCompleted: s.goalCompletedCount });
      }
    }
    return { state: s, events, ticked: true };
  }
  function deriveSessionUIHint(s, timeMs, opts, strings) {
    if (s.phase === "warmup") {
      const warmupProgress = Math.min(1, (timeMs - s.phaseStartMs) / opts.warmupMs);
      const dots = Math.floor(warmupProgress * 3) + 1;
      return { visible: true, text: strings.listeningFmt("\u266B ".repeat(dots)) };
    }
    if (s.phase === "performing") {
      if (timeMs < s.goalCelebrateUntilMs) {
        return { visible: true, text: strings.goalCelebrate() };
      }
      const remainSec = Math.max(
        0,
        Math.ceil((opts.motivationGoalMs - (timeMs - s.goalWindowStartMs)) / 1e3)
      );
      return { visible: true, text: strings.goalCountdownFmt(remainSec) };
    }
    return { visible: false, text: "" };
  }

  // src/state/midi-state.ts
  var DEFAULT_OPTS = {
    chordWindowMs: 80,
    chordCooldownMs: 600
  };
  function initMidiState() {
    return {
      activeNotes: /* @__PURE__ */ new Map(),
      sustainOn: false,
      sustainedNotes: /* @__PURE__ */ new Set(),
      recentOnsets: [],
      lastChordName: "",
      lastChordTimeMs: 0
    };
  }
  function resetMidiState(s) {
    s.activeNotes.clear();
    s.sustainedNotes.clear();
    s.recentOnsets.length = 0;
    s.sustainOn = false;
    s.lastChordName = "";
    s.lastChordTimeMs = 0;
    return s;
  }
  function applyMidiNoteOn(s, midi, velocity, timeMs, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts };
    const events = [];
    const synColor = opts.synColorFor ? opts.synColorFor(midi) : null;
    const note = { midi, velocity, onTimeMs: timeMs, synColor };
    s.activeNotes.set(midi, note);
    s.sustainedNotes.delete(midi);
    events.push({ type: "noteOn", note });
    const recents = s.recentOnsets;
    while (recents.length && timeMs - recents[0].timeMs >= o.chordWindowMs) {
      recents.shift();
    }
    recents.push({ midi, timeMs });
    if (recents.length >= 3) {
      const chord = detectChord(recents.map((r) => r.midi));
      if (chord && (chord !== s.lastChordName || timeMs - s.lastChordTimeMs > o.chordCooldownMs)) {
        s.lastChordName = chord;
        s.lastChordTimeMs = timeMs;
        events.push({ type: "chordDetected", name: chord, timeMs });
      }
    }
    return events;
  }
  function applyMidiNoteOff(s, midi) {
    const events = [];
    if (s.sustainOn) {
      s.sustainedNotes.add(midi);
      events.push({ type: "noteOff", midi, sustainedNow: true });
    } else {
      s.activeNotes.delete(midi);
      events.push({ type: "noteOff", midi, sustainedNow: false });
    }
    return events;
  }
  function applyMidiCC(s, cc, value) {
    if (cc !== 64) return [];
    const wasOn = s.sustainOn;
    s.sustainOn = value >= 64;
    const events = [{ type: "sustainPedal", on: s.sustainOn }];
    if (wasOn && !s.sustainOn) {
      const droppedMidis = [];
      s.sustainedNotes.forEach((midi) => {
        droppedMidis.push(midi);
        s.activeNotes.delete(midi);
      });
      s.sustainedNotes.clear();
      if (droppedMidis.length > 0) events.push({ type: "sustainReleased", droppedMidis });
    }
    return events;
  }
  function dispatchMidiBytes(s, status, data1, data2, timeMs, opts = {}) {
    const cmd = status & 240;
    if (cmd === 144 && data2 > 0) {
      return applyMidiNoteOn(s, data1, data2, timeMs, opts);
    }
    if (cmd === 128 || cmd === 144 && data2 === 0) {
      return applyMidiNoteOff(s, data1);
    }
    if (cmd === 176) {
      return applyMidiCC(s, data1, data2);
    }
    return [];
  }

  // src/state/practice-state.ts
  var HIT_WINDOW_EARLY_MS = 120;
  var HIT_WINDOW_MS = 350;
  var PERFECT_MS = 90;
  var CHORD_MATE_TOLERANCE_MS = 30;
  var DURATION_MIN_TOL_MS = 120;
  var DURATION_TOL_FRACTION = 0.4;
  function initPracticeState(mode = "guided") {
    return {
      mode,
      sectionIdx: 0,
      sectionNotes: [],
      currentNoteIdx: 0,
      hits: 0,
      misses: 0,
      timingScoreSum: 0,
      durationScoreSum: 0,
      durationScoredCount: 0,
      pendingHolds: /* @__PURE__ */ new Map(),
      sectionCombo: 0,
      sectionBestCombo: 0
    };
  }
  function resetPracticeState(s) {
    s.sectionNotes = [];
    s.currentNoteIdx = 0;
    s.hits = 0;
    s.misses = 0;
    s.timingScoreSum = 0;
    s.durationScoreSum = 0;
    s.durationScoredCount = 0;
    s.pendingHolds.clear();
    s.sectionCombo = 0;
    s.sectionBestCombo = 0;
    return s;
  }
  function buildSectionNotes(songNotes, section, opts) {
    const speedFactor = 100 / opts.tempoPct;
    const out = [];
    for (const n of songNotes) {
      if (n.timeSec < section.startSec || n.timeSec >= section.endSec) continue;
      const relSec = n.timeSec - section.startSec;
      const filtered = !!opts.handFilter && n.hand !== opts.handFilter;
      out.push({
        hand: n.hand,
        midi: n.midi,
        timeMs: relSec * 1e3 * speedFactor + opts.countInMs,
        durMs: n.durSec * 1e3 * speedFactor,
        measureIdx: n.measureIdx,
        cursorJump: n.cursorJump,
        hit: filtered,
        missed: false,
        _filtered: filtered
      });
    }
    out.sort((a, b) => a.timeMs - b.timeMs);
    return out;
  }
  function computeHandRanges(sectionNotes) {
    let lhMin = 200, lhMax = 0, rhMin = 200, rhMax = 0;
    let lhCount = 0, rhCount = 0;
    for (const n of sectionNotes) {
      if (n.hand === "L") {
        if (n.midi < lhMin) lhMin = n.midi;
        if (n.midi > lhMax) lhMax = n.midi;
        lhCount++;
      } else {
        if (n.midi < rhMin) rhMin = n.midi;
        if (n.midi > rhMax) rhMax = n.midi;
        rhCount++;
      }
    }
    if (rhCount === 0) {
      rhMin = 60;
      rhMax = 72;
    }
    if (lhCount === 0) {
      lhMin = 48;
      lhMax = 60;
    }
    if (rhMax <= rhMin) rhMax = rhMin + 1;
    if (lhMax <= lhMin) lhMax = lhMin + 1;
    return { lhMin, lhMax, rhMin, rhMax };
  }
  function matchNoteOnset(s, detectedMidi, opts, nowMs) {
    if (s.mode === "listen") return { type: "no-op", reason: "listen-mode" };
    const notes = s.sectionNotes;
    if (notes.length === 0) return { type: "no-op", reason: "no-section-notes" };
    let idx = s.currentNoteIdx;
    while (idx < notes.length && (notes[idx].hit || notes[idx].missed)) idx++;
    s.currentNoteIdx = idx;
    if (idx >= notes.length) return { type: "no-op", reason: "all-resolved" };
    const cur = notes[idx];
    const dtSigned = opts.elapsed - cur.timeMs;
    const inWindow = s.mode === "guided" ? true : dtSigned >= -HIT_WINDOW_EARLY_MS && dtSigned <= HIT_WINDOW_MS;
    let matched = null;
    let matchedIdx = -1;
    let isChordMate = false;
    if (inWindow) {
      if (cur.midi === detectedMidi) {
        matched = cur;
        matchedIdx = idx;
      } else {
        for (let i = idx + 1; i < notes.length; i++) {
          const m = notes[i];
          const diff = m.timeMs - cur.timeMs;
          if (diff > CHORD_MATE_TOLERANCE_MS) break;
          if (m.hit || m.missed) continue;
          if (m.midi === detectedMidi) {
            matched = m;
            matchedIdx = i;
            isChordMate = true;
            break;
          }
        }
      }
    }
    if (!matched) {
      return {
        type: "wrong-note",
        mode: s.mode,
        detectedMidi,
        expectedMidi: cur.midi
      };
    }
    const dtSignedMatched = opts.elapsed - matched.timeMs;
    const dt = Math.abs(dtSignedMatched);
    matched.hit = true;
    matched.holdStartMs = nowMs;
    s.pendingHolds.set(detectedMidi, matched);
    s.hits++;
    s.sectionCombo++;
    if (s.sectionCombo > s.sectionBestCombo) s.sectionBestCombo = s.sectionCombo;
    const window = dtSignedMatched < 0 ? HIT_WINDOW_EARLY_MS : HIT_WINDOW_MS;
    const timingScore = s.mode === "guided" ? 1 : Math.max(0, 1 - dt / window);
    s.timingScoreSum += timingScore;
    const isPerfect = s.mode === "guided" || dt < PERFECT_MS;
    return {
      type: "hit",
      note: matched,
      matchedIdx,
      isChordMate,
      isPerfect,
      timingScore,
      dt,
      dtSigned: dtSignedMatched
    };
  }
  function finalizeNoteHold(s, detectedMidi, nowMs) {
    const matched = s.pendingHolds.get(detectedMidi);
    if (!matched) return { type: "no-op", reason: "no-pending" };
    s.pendingHolds.delete(detectedMidi);
    if (s.mode !== "rhythm") return { type: "no-op", reason: "wrong-mode" };
    if (matched.holdStartMs == null || !matched.durMs) {
      return { type: "no-op", reason: "no-duration" };
    }
    const heldMs = nowMs - matched.holdStartMs;
    const expected = matched.durMs;
    const tol = Math.max(DURATION_MIN_TOL_MS, expected * DURATION_TOL_FRACTION);
    const score = Math.max(0, 1 - Math.abs(heldMs - expected) / tol);
    s.durationScoreSum += score;
    s.durationScoredCount++;
    return { type: "scored", score, heldMs, expectedMs: expected, tooShort: heldMs < expected };
  }
  var STAR_TIERS = [
    { stars: 3, acc: 90, timing: 70, dur: 70 },
    { stars: 2, acc: 75, timing: 0, dur: 50 },
    { stars: 1, acc: 50, timing: 0, dur: 0 }
  ];
  function computeStars(accPct, timingPct, durPct, tiers = STAR_TIERS) {
    const tier = tiers.find(
      (t) => accPct >= t.acc && timingPct >= t.timing && (durPct == null || durPct >= t.dur)
    );
    return tier ? tier.stars : 0;
  }
  var RESULT_TIER_KEYS = [
    { titleKey: "tier0Title", msgKey: "tier0Msg" },
    { titleKey: "tier1Title", msgKey: "tier1Msg" },
    { titleKey: "tier2Title", msgKey: "tier2Msg" },
    { titleKey: "tier3Title", msgKey: "tier3Msg" }
  ];
  function resolveResultTier(stars) {
    const idx = Math.max(0, Math.min(RESULT_TIER_KEYS.length - 1, stars | 0));
    return RESULT_TIER_KEYS[idx];
  }
  var TEMPO_TIERS = [60, 75, 90, 100];
  var DEFAULT_STREAK_MILESTONES = [3, 7];
  function computeUnlocks(input) {
    let unlockedTempo = null;
    let unlockedSecKey = null;
    let streakDays = null;
    if (input.stars >= 2) {
      const idx = TEMPO_TIERS.indexOf(input.tempoPct);
      if (idx >= 0 && idx < TEMPO_TIERS.length - 1) {
        const next = TEMPO_TIERS[idx + 1];
        if (!input.unlockedTempos[next]) unlockedTempo = next;
      }
    }
    if (input.stars >= 1) {
      const sIdx = input.sectionIds.indexOf(input.sectionId);
      if (sIdx >= 0 && sIdx < input.sectionIds.length - 1) {
        const next = input.sectionIds[sIdx + 1];
        if (!input.unlockedSections[next]) {
          const nameKey = input.sectionNameKeys[next];
          if (nameKey) unlockedSecKey = nameKey;
        }
      }
    }
    const milestones = input.streakMilestones ?? DEFAULT_STREAK_MILESTONES;
    if (milestones.indexOf(input.streakCount) !== -1) {
      streakDays = input.streakCount;
    }
    return { unlockedTempo, unlockedSecKey, streakDays };
  }
  function practiceElapsedMs(s, realElapsed, countInMs) {
    if (s.mode === "guided") {
      if (realElapsed < countInMs) return realElapsed;
      const cur = s.sectionNotes[s.currentNoteIdx];
      return cur ? cur.timeMs : countInMs;
    }
    return realElapsed;
  }

  // src/state/quality.ts
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }
  function computeRhythmScore(ioiHistory, opts) {
    if (ioiHistory.length < 3) return 0.5;
    const cv = coefficientOfVariation(ioiHistory);
    if (cv <= opts.ioiIdealCV) {
      return 0.85 + 0.15 * (1 - cv / opts.ioiIdealCV);
    }
    if (cv <= opts.ioiMaxCV) {
      const t = (cv - opts.ioiIdealCV) / (opts.ioiMaxCV - opts.ioiIdealCV);
      return 0.85 - 0.45 * t;
    }
    return 0.4;
  }
  function computeDynamicsScore(amps, opts) {
    if (amps.length < 3) return 0.5;
    const cv = coefficientOfVariation(amps);
    if (cv >= opts.dynamicsIdealCVMin && cv <= opts.dynamicsIdealCVMax) {
      return 0.8 + 0.2 * (1 - Math.abs(cv - 0.15) / 0.45);
    }
    if (cv < opts.dynamicsIdealCVMin) return 0.6;
    return Math.max(0.3, 0.8 - (cv - opts.dynamicsIdealCVMax) * 0.5);
  }
  function computeStabilityScore(pitchStability, sessionConfidence) {
    return clamp01(pitchStability * 0.75 + sessionConfidence * 0.25);
  }
  function composeQualityScore(rhythm, dynamics, stability, weights) {
    return rhythm * weights.rhythm + dynamics * weights.dynamics + stability * weights.stability;
  }
  function smoothQualityScore(displayed, target, alpha) {
    return displayed + (target - displayed) * alpha;
  }
  function updateGrowthTrend(prevHistory, timeMs, displayedScore, opts) {
    const windowStart = timeMs - opts.growthWindowMs;
    const next = prevHistory.filter((e) => e.timeMs >= windowStart).concat({ timeMs, score: displayedScore });
    if (next.length < 2) return { history: next, growthScore: 0 };
    return { history: next, growthScore: next[next.length - 1].score - next[0].score };
  }
  function buildCoachingFeedback(input) {
    const axes = [
      { key: "rhythm", score: input.rhythm },
      { key: "dynamics", score: input.dynamics },
      { key: "stability", score: input.stability }
    ].sort((a, b) => b.score - a.score);
    let strengthKey = "strNotesClear";
    if (input.growthScore > 0.05) {
      strengthKey = "strGrowing";
    } else if (axes[0].key === "rhythm" && axes[0].score > 0.7) {
      strengthKey = "strRhythmSteady";
    } else if (axes[0].key === "dynamics" && axes[0].score > 0.7) {
      strengthKey = "strDynamicsGood";
    } else if (axes[0].key === "stability" && axes[0].score > 0.7) {
      strengthKey = "strPitchStable";
    }
    const weakest = axes[axes.length - 1];
    let nextKey = "nxtBreathe";
    if (weakest.key === "rhythm") nextKey = "nxtOneHand";
    else if (weakest.key === "dynamics") nextKey = "nxtSoftLoud";
    else if (weakest.key === "stability") nextKey = "nxtHoldNotes";
    return { strengthKey, nextKey };
  }

  // src/i18n/strings.ts
  var T_STRINGS = {
    // Settings panel
    settings: { en: "Settings", jp: "\u8A2D\u5B9A" },
    close: { en: "Close", jp: "\u9589\u3058\u308B" },
    backToTitle: { en: "Back to title", jp: "\u30BF\u30A4\u30C8\u30EB\u306B\u3082\u3069\u308B" },
    display: { en: "Display", jp: "\u8868\u793A" },
    synesthesia: {
      en: "Synesthesia mode (each note has its own color)",
      jp: "\u97F3\u968E\u8272\u30E2\u30FC\u30C9\uFF08\u97F3\u3054\u3068\u306B\u8272\u304C\u5909\u308F\u308B\uFF09"
    },
    synesthesiaTitle: { en: "Synesthesia mode", jp: "\u97F3\u968E\u8272\u30E2\u30FC\u30C9" },
    timingCalibration: { en: "Timing Calibration", jp: "\u30BF\u30A4\u30DF\u30F3\u30B0\u8ABF\u6574" },
    audioOffset: { en: "Audio offset", jp: "\u97F3\u3068\u753B\u9762\u306E\u305A\u308C\u88DC\u6B63" },
    audioOffsetHelp: {
      en: `If you play on the beat but it's judged "late", raise the number. If your press is rejected as "early", lower it.`,
      jp: "\u62CD\u306B\u5408\u308F\u305B\u3066\u5F3E\u3044\u3066\u308B\u306E\u306B\u300C\u9045\u3044\u300D\u5224\u5B9A\u306B\u306A\u308B\u6642\u306F\u6570\u5024\u3092\u4E0A\u3052\u308B\u3002\u300C\u65E9\u3044\u300D\u5224\u5B9A\u306B\u306A\u308B\u6642\u306F\u4E0B\u3052\u308B\u3002"
    },
    autoDetectedFmt: {
      en: "Auto-detected value in use (currently {v} ms)",
      jp: "\u81EA\u52D5\u691C\u51FA\u5024\u3092\u4F7F\u7528\u4E2D\uFF08\u73FE\u5728: {v} ms\uFF09"
    },
    resetToAuto: { en: "Use auto-detected value", jp: "\u81EA\u52D5\u691C\u51FA\u306B\u623B\u3059" },
    input: { en: "Input", jp: "\u5165\u529B" },
    micInput: { en: "Mic input", jp: "\u30DE\u30A4\u30AF\u5165\u529B" },
    micStandby: { en: "Standby", jp: "\u5F85\u6A5F\u4E2D" },
    scanMidi: { en: "Scan for MIDI keyboard", jp: "MIDI\u30AD\u30FC\u30DC\u30FC\u30C9\u3092\u63A2\u3059" },
    connectBluetooth: { en: "Connect Bluetooth", jp: "Bluetooth\u63A5\u7D9A" },
    other: { en: "Other", jp: "\u305D\u306E\u4ED6" },
    resetSession: { en: "Reset session", jp: "\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u30EA\u30BB\u30C3\u30C8" },
    debugOverlay: { en: "Debug overlay", jp: "\u30C7\u30D0\u30C3\u30B0\u8868\u793A" },
    language: { en: "Language", jp: "\u8A00\u8A9E" },
    // Intro hint / MIDI diagnostics
    introNeedMidi: {
      en: "\u{1F3B9} Please connect a MIDI keyboard<br>(microphone unavailable)",
      jp: "\u{1F3B9} MIDI\u30AD\u30FC\u30DC\u30FC\u30C9\u3092\u63A5\u7D9A\u3057\u3066\u304F\u3060\u3055\u3044<br>\uFF08\u30DE\u30A4\u30AF\u304C\u4F7F\u3048\u307E\u305B\u3093\uFF09"
    },
    diagWebMidiUnsupported: {
      en: "\u{1F3B9} This browser does not support Web MIDI",
      jp: "\u{1F3B9} \u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F Web MIDI \u975E\u5BFE\u5FDC"
    },
    diagNoMidiPort: { en: "\u{1F3B9} No MIDI port found", jp: "\u{1F3B9} MIDI\u30DD\u30FC\u30C8\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" },
    diagWmbHint: {
      en: "In WMB, disconnect \u2192 reconnect the keyboard, then tap \u{1F504} again",
      jp: "WMB\u306E\u8A2D\u5B9A\u3067\u30AD\u30FC\u30DC\u30FC\u30C9\u3092\u4E00\u5EA6\u5207\u65AD\u2192\u518D\u63A5\u7D9A\u3057\u3066\u304B\u3089\u{1F504}\u3092\u518D\u5EA6\u30BF\u30C3\u30D7"
    },
    diagConnectHint: {
      en: "Connect the keyboard via USB/Bluetooth, then tap \u{1F504}",
      jp: "\u30AD\u30FC\u30DC\u30FC\u30C9\u3092USB/Bluetooth\u3067\u63A5\u7D9A\u3057\u3066\u304B\u3089\u{1F504}\u3092\u30BF\u30C3\u30D7"
    },
    diagDetectedFmt: { en: "\u{1F3B9} Detected: {v}", jp: "\u{1F3B9} \u8A8D\u8B58\u4E2D: {v}" },
    diagCouldNotConnect: { en: "Could not connect", jp: "\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F" },
    diagMidiError: { en: "\u{1F3B9} MIDI error", jp: "\u{1F3B9} MIDI\u30A8\u30E9\u30FC" },
    midiConnectedFmt: { en: "\u{1F3B9} Connected: {v}", jp: "\u{1F3B9} \u63A5\u7D9A: {v}" },
    // Alerts
    alertWebBluetoothUnsupported: {
      en: 'This browser does not support Web Bluetooth.\n\nAndroid Chrome / Mac Chrome / Linux Chrome are supported.\niPad Safari is not \u2014 use the "Web MIDI Browser" app instead.',
      jp: "\u3053\u306E\u30D6\u30E9\u30A6\u30B6\u306F Web Bluetooth \u306B\u5BFE\u5FDC\u3057\u3066\u3044\u307E\u305B\u3093\u3002\n\nAndroid Chrome / Mac Chrome / Linux Chrome \u306F\u5BFE\u5FDC\u3002\niPad Safari \u306F\u975E\u5BFE\u5FDC \u2192 \u300CWeb MIDI Browser\u300D\u30A2\u30D7\u30EA\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    alertBleConnectFailedFmt: {
      en: "Could not connect to Bluetooth keyboard:\n{v}",
      jp: "Bluetooth\u30AD\u30FC\u30DC\u30FC\u30C9\u306B\u63A5\u7D9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F:\n{v}"
    },
    alertScoreLoadFailedFmt: {
      en: "Failed to load score\n{v}",
      jp: "\u697D\u8B5C\u306E\u8AAD\u307F\u8FBC\u307F\u306B\u5931\u6557\u3057\u307E\u3057\u305F\n{v}"
    },
    // Session summary
    sumBestFmt: {
      en: "\u2728 All-time best: {combo} combo / Flow {flow}% (session #{n})",
      jp: "\u2728 \u6B74\u4EE3\u30D9\u30B9\u30C8: {combo}\u30B3\u30F3\u30DC / \u30D5\u30ED\u30FC{flow}% (\u7B2C{n}\u56DE\u30BB\u30C3\u30B7\u30E7\u30F3)"
    },
    sumAllClear: { en: "\u{1F389} ALL CLEAR! \u{1F389}", jp: "\u{1F389} \u5168\u30AF\u30EA\u30A2\uFF01 \u{1F389}" },
    sumQuestProgressFmt: { en: "{n}/{total} cleared", jp: "{n}/{total} \u30AF\u30EA\u30A2" },
    // Input indicator tooltips
    tipMidiKeyboardFmt: { en: "MIDI keyboard: {v}", jp: "MIDI\u30AD\u30FC\u30DC\u30FC\u30C9: {v}" },
    tipMicMode: { en: "Mic input mode", jp: "\u30DE\u30A4\u30AF\u5165\u529B\u30E2\u30FC\u30C9" },
    tipIosMidiBlocked: {
      en: 'iPad/iPhone Safari does not support Web MIDI. Use mic input. (For BLE-MIDI keyboards, install the "Web MIDI Browser" iOS app)',
      jp: "iPad/iPhone \u306ESafari\u306FWeb MIDI\u975E\u5BFE\u5FDC\u3002\u30DE\u30A4\u30AF\u5165\u529B\u3067\u6F14\u594F\u3057\u3066\u304F\u3060\u3055\u3044\u3002\uFF08BLE-MIDI\u30AD\u30FC\u30DC\u30FC\u30C9\u3092\u4F7F\u3046\u306B\u306F\u300CWeb MIDI Browser\u300D\u30A2\u30D7\u30EA\u304C\u5FC5\u8981\uFF09"
    },
    // Console-only iOS MIDI guidance
    consoleIosMidi: {
      en: 'iOS/iPadOS detected \u2014 Web MIDI is unavailable on Safari/WebKit. Use a desktop browser, Steam Deck, or the "Web MIDI Browser" iOS app for BLE-MIDI.',
      jp: "iOS/iPadOS\u691C\u51FA \u2014 Safari/WebKit\u3067\u306FWeb MIDI\u975E\u5BFE\u5FDC\u3002\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u30D6\u30E9\u30A6\u30B6\u30FBSteam Deck\u30FBiOS\u300CWeb MIDI Browser\u300D\u30A2\u30D7\u30EA\u306E\u3044\u305A\u308C\u304B\u3092\u5229\u7528\u3002"
    },
    // Start screen
    tagline: {
      en: "Play the piano and watch the screen come alive",
      jp: "\u30D4\u30A2\u30CE\u3092\u5F3E\u304F\u3068\u753B\u9762\u304C\u304D\u308C\u3044\u306B\u5149\u308B\u3088"
    },
    freePlay: { en: "Free Play", jp: "\u30D5\u30EA\u30FC\u30D7\u30EC\u30A4" },
    // Song panel
    // Leading space lives in EN so JP renders "1日れんしゅう中" without a half-width gap.
    dayStreak: { en: " day streak", jp: "\u65E5\u308C\u3093\u3057\u3085\u3046\u4E2D" },
    tempo: { en: "Tempo", jp: "\u30C6\u30F3\u30DD" },
    startFrom: { en: "Start from", jp: "\u3069\u3053\u304B\u3089\u306F\u3058\u3081\u308B\uFF1F" },
    whichHand: { en: "Which hand?", jp: "\u3069\u306E\u624B\u3067\u5F3E\u304F\uFF1F" },
    leftOnly: { en: "\u{1F448} Left only", jp: "\u{1F448} \u5DE6\u624B\u3060\u3051" },
    bothHands: { en: "\u{1F91D} Both", jp: "\u{1F91D} \u4E21\u624B" },
    rightOnly: { en: "Right only \u{1F449}", jp: "\u53F3\u624B\u3060\u3051 \u{1F449}" },
    modeLabel: { en: "Mode", jp: "\u30E2\u30FC\u30C9" },
    modeListen: { en: "\u{1F3A7} Listen", jp: "\u{1F3A7} \u304D\u304F" },
    modeGuided: { en: "\u2728 Guided", jp: "\u2728 \u30AC\u30A4\u30C9" },
    modeRhythm: { en: "\u{1F3B5} Rhythm", jp: "\u{1F3B5} \u30EA\u30BA\u30E0" },
    ghostPlayback: { en: "\u{1F47B} Ghost playback (demo)", jp: "\u{1F47B} \u304A\u3066\u307B\u3093\u518D\u751F\uFF08\u30B4\u30FC\u30B9\u30C8\uFF09" },
    metronome: { en: "\u{1F941} Metronome", jp: "\u{1F941} \u30E1\u30C8\u30ED\u30CE\u30FC\u30E0" },
    back: { en: "Back", jp: "\u3082\u3069\u308B" },
    startPractice: { en: "\u25B6 Start practice", jp: "\u25B6 \u308C\u3093\u3057\u3085\u3046\u30B9\u30BF\u30FC\u30C8" },
    startListening: { en: "\u{1F3A7} Start listening", jp: "\u{1F3A7} \u304D\u3044\u3066\u307F\u308B" },
    // Listen-mode result
    listenedTitle: { en: "\u{1F3A7} Nicely listened!", jp: "\u{1F3A7} \u3055\u3044\u3054\u307E\u3067\u8074\u3051\u305F\u306D\uFF01" },
    listenedMsg: { en: "Now try playing along.", jp: "\u3064\u304E\u306F\u5F3E\u3044\u3066\u307F\u3088\u3046\u3002" },
    tryPlayingNow: { en: "\u25B6 Try playing", jp: "\u25B6 \u5F3E\u3044\u3066\u307F\u308B" },
    // Practice HUD
    score: { en: "Score", jp: "\u697D\u8B5C" },
    quit: { en: "Quit", jp: "\u3084\u3081\u308B" },
    inputSource: { en: "Input source", jp: "\u5165\u529B\u30BD\u30FC\u30B9" },
    // Result screen
    pitchAccuracy: { en: "Pitch accuracy", jp: "\u97F3\u7A0B\u306E\u6B63\u78BA\u3055" },
    timing: { en: "Timing", jp: "\u30BF\u30A4\u30DF\u30F3\u30B0" },
    noteLength: { en: "Note length", jp: "\u97F3\u306E\u9577\u3055" },
    bestComboLabel: { en: "Best combo", jp: "\u9023\u7D9A\u6210\u529F\uFF08\u6700\u9AD8\uFF09" },
    songSelect: { en: "Song select", jp: "\u304D\u3087\u304F\u9078\u629E" },
    tryAgainBtn: { en: "Try again", jp: "\u3082\u3046\u4E00\u5EA6" },
    nextBtn: { en: "Next \u2192", jp: "\u3064\u304E\u3078 \u2192" },
    // Hit chips / dynamic
    perfect: { en: "Perfect!" },
    nice: { en: "Nice!" },
    missChip: { en: "Miss", jp: "\u30DF\u30B9" },
    youPlayedFmt: { en: "You played: {v}", jp: "\u5F3E\u3044\u305F\u97F3: {v}" },
    tooShort: { en: "\u23F1 Too short", jp: "\u23F1 \u77ED\u3044" },
    tooLong: { en: "\u23F1 Too long", jp: "\u23F1 \u9577\u3044" },
    // Lane labels
    laneLeft: { en: "LEFT", jp: "\u5DE6\u624B" },
    laneRight: { en: "RIGHT", jp: "\u53F3\u624B" },
    countInGo: { en: "GO!" },
    // Stages
    stage1: { en: "Awakening", jp: "\u3081\u3056\u3081" },
    stage2: { en: "Blooming", jp: "\u306F\u306A\u3072\u3089\u304F" },
    stage3: { en: "Aurora", jp: "\u30AA\u30FC\u30ED\u30E9" },
    stage4: { en: "Cosmos", jp: "\u30B3\u30B9\u30E2\u30B9" },
    stage5: { en: "Radiance", jp: "\u304B\u304C\u3084\u304D" },
    stage6: { en: "Legend", jp: "\u3067\u3093\u305B\u3064" },
    // Encouragement tiers
    enc1: { en: "Nice!", jp: "\u3044\u3044\u3088\uFF01" },
    enc2: { en: "Great!", jp: "\u3059\u3054\u3044\uFF01" },
    enc3: { en: "On a roll!", jp: "\u306E\u3063\u3066\u304D\u305F\uFF01" },
    enc4: { en: "Sparkle!", jp: "\u304D\u3089\u304D\u3089\uFF01" },
    enc5: { en: "Beautiful!", jp: "\u3059\u3066\u304D\u306A\u304A\u3068\uFF01" },
    enc6: { en: "Like magic!", jp: "\u307E\u307B\u3046\u307F\u305F\u3044\uFF01" },
    enc7: { en: "Shining!", jp: "\u304B\u304C\u3084\u3044\u3066\u308B\uFF01" },
    enc8: { en: "Awesome!", jp: "\u3055\u3044\u3053\u3046\uFF01" },
    // Result tiers
    tier0Title: { en: "Try again!", jp: "\u3082\u3046\u3044\u3061\u3069\uFF01" },
    tier0Msg: {
      en: "Start with a slow tempo. Give it another try!",
      jp: "\u307E\u305A\u306F\u3086\u3063\u304F\u308A\u30C6\u30F3\u30DD\u3067\u3082\u5927\u4E08\u592B\u3002\u30EA\u30C8\u30E9\u30A4\u3057\u3066\u307F\u3088\u3046\uFF01"
    },
    tier1Title: { en: "Clear!", jp: "\u30AF\u30EA\u30A2\uFF01" },
    tier1Msg: {
      en: "Clear! Keep practicing to get even better.",
      jp: "\u30AF\u30EA\u30A2\u304A\u3081\u3067\u3068\u3046\uFF01\u304F\u308A\u304B\u3048\u3057\u3067\u4E0A\u9054\u3059\u308B\u3088\u3002"
    },
    tier2Title: { en: "\u{1F389} Part Clear!", jp: "\u{1F389} \u7AE0\u30AF\u30EA\u30A2\uFF01" },
    tier2Msg: { en: "Great job! Almost perfect!", jp: "\u3088\u304F\u304C\u3093\u3070\u3063\u305F\u306D\uFF01\u3082\u3046\u5C11\u3057\u3067\u30D1\u30FC\u30D5\u30A7\u30AF\u30C8\uFF01" },
    tier3Title: { en: "\u{1F31F} Perfect!", jp: "\u{1F31F} \u30D1\u30FC\u30D5\u30A7\u30AF\u30C8\uFF01" },
    tier3Msg: {
      en: "Brilliant! Try the next difficulty!",
      jp: "\u3059\u3070\u3089\u3057\u3044\uFF01\u6B21\u306E\u96E3\u3057\u3055\u306B\u30C1\u30E3\u30EC\u30F3\u30B8\uFF01"
    },
    // Songs (Für Elise)
    furElise: { en: "F\xFCr Elise", jp: "\u30A8\u30EA\u30FC\u30BC\u306E\u305F\u3081\u306B" },
    feA1: { en: "Part 1: Theme", jp: "\u7B2C1\u7AE0 \u4E3B\u984C" },
    feA1desc: {
      en: "The famous melody. Start gently.",
      jp: "\u6709\u540D\u306A\u3042\u306E\u30E1\u30ED\u30C7\u30A3\u3002\u3084\u3055\u3057\u304F\u59CB\u3081\u3088\u3046\u3002"
    },
    feB: { en: "Part 2: Gentle Middle", jp: "\u7B2C2\u7AE0 \u304A\u3060\u3084\u304B\u306A\u4E2D\u9593" },
    feBdesc: {
      en: "A bright C-major section, then back to the theme.",
      jp: "C\u9577\u8ABF\u306E\u3042\u304B\u308B\u3044\u90E8\u5206\u2192\u4E3B\u984C\u306B\u623B\u308A\u307E\u3059\u3002"
    },
    feA2: { en: "Part 3: Storm & Finale", jp: "\u7B2C3\u7AE0 \u5D50\u3068\u30D5\u30A3\u30CA\u30FC\u30EC" },
    feA2desc: {
      en: "A D-minor storm, then back to the theme \u2014 the climax!",
      jp: "D\u77ED\u8ABF\u306E\u5D50\u2192\u4E3B\u984C\u306B\u623B\u308A\u30E9\u30B9\u30C8\uFF01\u3053\u3053\u304C\u30AF\u30E9\u30A4\u30DE\u30C3\u30AF\u30B9\u3002"
    },
    // Songs (Turkish March)
    turkishMarch: { en: "Turkish March", jp: "\u30C8\u30EB\u30B3\u884C\u9032\u66F2" },
    taA1: { en: "Part 1: Light Theme", jp: "\u7B2C1\u7AE0 \u8EFD\u3084\u304B\u306A\u4E3B\u984C" },
    taA1desc: {
      en: "The famous theme plus an A-major contrasting section. Right-hand scales feel great.",
      jp: "\u6709\u540D\u306A\u4E3B\u984C\uFF0BA\u9577\u8ABF\u306E\u5BFE\u6BD4\u90E8\u3002\u53F3\u624B\u306E\u30B9\u30B1\u30FC\u30EB\u304C\u6C17\u6301\u3061\u3044\u3044\u3002"
    },
    taB: { en: "Part 2: Theme Variations", jp: "\u7B2C2\u7AE0 \u4E3B\u984C\u306E\u3078\u3093\u305D\u3046" },
    taBdesc: {
      en: "The theme returns transformed \u2014 chord practice.",
      jp: "\u4E3B\u984C\u304C\u5F62\u3092\u5909\u3048\u3066\u304B\u3048\u3063\u3066\u304F\u308B\u3002\u548C\u97F3\u306E\u7DF4\u7FD2\u3002"
    },
    taA2: { en: "Part 3: March Festival", jp: "\u7B2C3\u7AE0 \u30DE\u30EB\u30C1\u30A2\u306E\u796D\u308A" },
    taA2desc: {
      en: "The coda's powerful octaves! Race to the finale.",
      jp: "\u30B3\u30FC\u30C0\u306E\u529B\u5F37\u3044\u30AA\u30AF\u30BF\u30FC\u30D6\uFF01\u30D5\u30A3\u30CA\u30FC\u30EC\u306B\u99C6\u3051\u3042\u304C\u308D\u3046\u3002"
    },
    // Misc
    loadingScore: { en: "Loading score\u2026", jp: "\u697D\u8B5C\u3092\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026" },
    starting: { en: "Starting...", jp: "\u8D77\u52D5\u4E2D..." },
    audioInitFailedFmt: {
      en: "Audio init failed: {v}\n\nReload the browser and try again.",
      jp: "\u30AA\u30FC\u30C7\u30A3\u30AA\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F: {v}\n\n\u30D6\u30E9\u30A6\u30B6\u3092\u66F4\u65B0\u3057\u3066\u30EA\u30C8\u30E9\u30A4\u3057\u3066\u307F\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    // Composers — last-name katakana for JP (common in JP music ed)
    composerBeethoven: { en: "L. v. Beethoven", jp: "\u30D9\u30FC\u30C8\u30FC\u30F4\u30A7\u30F3" },
    composerMozart: { en: "W. A. Mozart", jp: "\u30E2\u30FC\u30C4\u30A1\u30EB\u30C8" },
    // Result-screen unlock messages
    tempoUnlockedFmt: { en: "\u{1F680} Tempo {v}% unlocked!  ", jp: "\u{1F680} \u30C6\u30F3\u30DD {v}% \u89E3\u653E\uFF01  " },
    sectionUnlockedFmt: { en: "\u{1F513} {v} unlocked!", jp: "\u{1F513} {v} \u89E3\u653E\uFF01" },
    streakDaysFmt: { en: " \u2728 {v}-day streak!", jp: " \u2728 \u30B9\u30C8\u30EA\u30FC\u30AF {v}\u65E5\uFF01" },
    // Result-screen growth chart
    growthChartFmt: { en: "Growth ({v} attempts)", jp: "\u6210\u9577\u30B0\u30E9\u30D5 ({v}\u56DE)" },
    trendSimilar: { en: "\u2192 similar", jp: "\u2192 \u304A\u306A\u3058\u304F\u3089\u3044" },
    sustainLabel: { en: "SUSTAIN" },
    // Free-play HUD (session status while playing without a song)
    listeningFmt: { en: "{p}Listening{p}", jp: "{p}\u304D\u3044\u3066\u308B\u3088{p}" },
    goalCelebrate: { en: "\u2728 Goal reached! Keep it up! \u2728", jp: "\u2728 \u76EE\u6A19\u9054\u6210\uFF01\u3053\u306E\u8ABF\u5B50\uFF01 \u2728" },
    goalCountdownFmt: { en: "Goal: stable play for {v}s", jp: "\u76EE\u6A19: \u5B89\u5B9A\u6F14\u594F {v}\u79D2" },
    // Free-play quality coaching (shown in the qualityScore HUD)
    strengthFmt: { en: "Strength: {v}", jp: "\u3067\u304D\u305F\u70B9: {v}" },
    nextStepFmt: { en: "Next: {v}", jp: "\u6B21\u306E1\u624B: {v}" },
    // Quality coaching strengths
    strNotesClear: { en: "playing each note clearly", jp: "\u97F3\u3092\u3057\u3063\u304B\u308A\u9CF4\u3089\u305B\u3066\u3044\u308B" },
    strGrowing: { en: "improving steadily over the last 30s", jp: "\u76F4\u8FD130\u79D2\u3067\u7740\u5B9F\u306B\u4F38\u3073\u3066\u3044\u308B" },
    strRhythmSteady: { en: "rhythm is steady", jp: "\u30EA\u30BA\u30E0\u304C\u5B89\u5B9A\u3057\u3066\u3044\u308B" },
    strDynamicsGood: { en: "good dynamic control", jp: "\u5F37\u5F31\u306E\u30B3\u30F3\u30C8\u30ED\u30FC\u30EB\u304C\u826F\u3044" },
    strPitchStable: { en: "pitch is stable", jp: "\u97F3\u7A0B\u306E\u5B89\u5B9A\u611F\u304C\u9AD8\u3044" },
    // Quality coaching next steps
    nxtBreathe: { en: "breathe and hold tempo for 20s", jp: "\u6DF1\u547C\u5438\u3057\u3066\u540C\u3058\u30C6\u30F3\u30DD\u309220\u79D2\u30AD\u30FC\u30D7" },
    nxtOneHand: {
      en: "one hand slowly, hold tempo for 20s",
      jp: "\u7247\u624B\u3067\u3086\u3063\u304F\u308A\u3001\u4E00\u5B9A\u30C6\u30F3\u30DD\u309220\u79D2\u30AD\u30FC\u30D7"
    },
    nxtSoftLoud: {
      en: "build soft to loud across one phrase",
      jp: "1\u30D5\u30EC\u30FC\u30BA\u306E\u4E2D\u3067\u5F31\u2192\u5F37\u30922\u6BB5\u968E\u3064\u3051\u308B"
    },
    nxtHoldNotes: {
      en: "hold each note fully before moving on",
      jp: "1\u97F3\u305A\u3064\u6700\u5F8C\u307E\u3067\u4F38\u3070\u3057\u3066\u304B\u3089\u6B21\u306E\u97F3\u3078"
    },
    // Quest names + descriptions (free-play)
    qst1Name: { en: "First Notes", jp: "\u306F\u3058\u307E\u308A\u306E\u97F3" },
    qst1Desc: { en: "Play 3 notes", jp: "\u97F3\u30923\u56DE\u9CF4\u3089\u3057\u3066\u307F\u3088\u3046" },
    qst2Name: { en: "Catch the Flow", jp: "\u6D41\u308C\u306B\u4E57\u3063\u3066" },
    qst2Desc: { en: "Fill the flow gauge halfway", jp: "\u30D5\u30ED\u30FC\u30B2\u30FC\u30B8\u3092\u534A\u5206\u307E\u3067\u305F\u3081\u3088\u3046" },
    qst3Name: { en: "Combo Master", jp: "\u30B3\u30F3\u30DC\u30DE\u30B9\u30BF\u30FC" },
    qst3Desc: { en: "Reach 30 combo!", jp: "30\u30B3\u30F3\u30DC\u9054\u6210\uFF01" },
    qst4Name: { en: "Clean Tone", jp: "\u304D\u308C\u3044\u306A\u97F3" },
    qst4Desc: { en: "Keep stability at 80%+", jp: "\u5B89\u5B9A\u602780%\u4EE5\u4E0A\u3092\u30AD\u30FC\u30D7" },
    qst5Name: { en: "Pianist", jp: "\u30D4\u30A2\u30CB\u30B9\u30C8" },
    qst5Desc: { en: "Play with confidence", jp: "\u81EA\u4FE1\u3092\u6301\u3063\u3066\u6F14\u594F\u3057\u3088\u3046" },
    qst6Name: { en: "Rhythm Master", jp: "\u30EA\u30BA\u30E0\u306E\u9054\u4EBA" },
    qst6Desc: { en: "Rhythm score 85%+", jp: "\u30EA\u30BA\u30E0\u30B9\u30B3\u30A285%\u4EE5\u4E0A\uFF01" },
    qst7Name: { en: "Peak Flow", jp: "\u30D5\u30ED\u30FC\u306E\u6975\u307F" },
    qst7Desc: { en: "Reach 95% flow", jp: "\u30D5\u30ED\u30FC\u30B2\u30FC\u30B8\u309295%\u4EE5\u4E0A\u306B\u3057\u3088\u3046" },
    qst8Name: { en: "100 Combo", jp: "100\u30B3\u30F3\u30DC" },
    qst8Desc: { en: "Reach 100 combo!", jp: "100\u30B3\u30F3\u30DC\u9054\u6210\uFF01" },
    qst9Name: { en: "Dynamics", jp: "\u30C0\u30A4\u30CA\u30DF\u30AF\u30B9" },
    qst9Desc: { en: "Dynamics 80%+", jp: "\u30C0\u30A4\u30CA\u30DF\u30AF\u30B980%\u4EE5\u4E0A\uFF01" },
    qst10Name: { en: "Full Focus", jp: "\u5168\u96C6\u4E2D" },
    qst10Desc: { en: "Overall score 85%+", jp: "\u7DCF\u5408\u30B9\u30B3\u30A285%\u4EE5\u4E0A\uFF01" },
    qst11Name: { en: "Legendary Pianist", jp: "\u4F1D\u8AAC\u306E\u30D4\u30A2\u30CB\u30B9\u30C8" },
    qst11Desc: { en: "200 combo & 90% flow", jp: "200\u30B3\u30F3\u30DC&\u30D5\u30ED\u30FC90%\u4EE5\u4E0A" },
    // Quest display chrome
    questAllClearFmt: { en: "\u{1F389} {n}/{n} All Clear!", jp: "\u{1F389} {n}/{n} \u5168\u30AF\u30EA\u30A2\uFF01" },
    questTargetFmt: { en: "\u{1F3AF} {v}", jp: "\u{1F3AF} {v}" },
    questClearedFmt: { en: "\u2705 {v} CLEARED!", jp: "\u2705 {v} \u30AF\u30EA\u30A2\uFF01" },
    // Session summary (post free-play)
    sumTitle: { en: "\u{1F3B9} Session Results", jp: "\u{1F3B9} \u30BB\u30C3\u30B7\u30E7\u30F3\u7D50\u679C" },
    sumBestCombo: { en: "\u{1F3B5} Best Combo", jp: "\u{1F3B5} \u30D9\u30B9\u30C8\u30B3\u30F3\u30DC" },
    sumStageReached: { en: "\u{1F3D4} Stage Reached", jp: "\u{1F3D4} \u5230\u9054\u30B9\u30C6\u30FC\u30B8" },
    sumPlayTime: { en: "\u23F1 Play Time", jp: "\u23F1 \u6F14\u594F\u6642\u9593" },
    sumQuests: { en: "\u2B50 Quests", jp: "\u2B50 \u30AF\u30A8\u30B9\u30C8" },
    sumTitleBtn: { en: "\u{1F3E0} Title", jp: "\u{1F3E0} \u30BF\u30A4\u30C8\u30EB" },
    sumContinue: { en: "Continue \u2192", jp: "\u3064\u3065\u3051\u308B \u2192" },
    // User-song UI
    addSongBtn: { en: "\u2795 Add a song", jp: "\u2795 \u66F2\u3092\u8FFD\u52A0" },
    addSongTitle: { en: "Add a song", jp: "\u66F2\u3092\u8FFD\u52A0" },
    addSongTabLibrary: { en: "\u{1F4DA} Library", jp: "\u{1F4DA} \u30E9\u30A4\u30D6\u30E9\u30EA" },
    addSongTabFile: { en: "\u{1F4C1} File", jp: "\u{1F4C1} \u30D5\u30A1\u30A4\u30EB" },
    addSongTabUrl: { en: "\u{1F517} URL" },
    addSongLibraryHelp: {
      en: "Free public-domain pieces from MuseTrainer (jsDelivr CDN). Tap to download.",
      jp: "MuseTrainer \u306E\u30D1\u30D6\u30EA\u30C3\u30AF\u30C9\u30E1\u30A4\u30F3\u66F2\uFF08jsDelivr\u7D4C\u7531\uFF09\u3002\u30BF\u30C3\u30D7\u3067\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3002"
    },
    addSongFilePick: {
      en: "Choose .mxl / .musicxml / .xml file",
      jp: ".mxl / .musicxml / .xml \u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E"
    },
    addSongFileHelp: {
      en: "Drop a MusicXML file. I confirm it is public domain or my own work.",
      jp: "MusicXML \u30D5\u30A1\u30A4\u30EB\u3092\u30C9\u30ED\u30C3\u30D7\u3002\u30D1\u30D6\u30EA\u30C3\u30AF\u30C9\u30E1\u30A4\u30F3\u307E\u305F\u306F\u81EA\u4F5C\u306E\u66F2\u3067\u3042\u308B\u3053\u3068\u3092\u78BA\u8A8D\u3057\u307E\u3059\u3002"
    },
    addSongPdAttest: {
      en: "I confirm this score is public domain or my own work",
      jp: "\u30D1\u30D6\u30EA\u30C3\u30AF\u30C9\u30E1\u30A4\u30F3\u307E\u305F\u306F\u81EA\u4F5C\u306E\u66F2\u3067\u3059"
    },
    addSongUrlPlaceholder: { en: "https://cdn.jsdelivr.net/.../score.mxl" },
    addSongUrlHelp: {
      en: "Paste a direct .mxl / .musicxml URL (must be CORS-enabled, e.g. jsDelivr).",
      jp: ".mxl / .musicxml \u306E\u76F4\u30EA\u30F3\u30AF\uFF08CORS\u5BFE\u5FDCURL\u3001\u4F8B: jsDelivr\uFF09\u3002"
    },
    addSongFetch: { en: "\u2B07 Download", jp: "\u2B07 \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9" },
    addSongAdded: { en: "Added!", jp: "\u8FFD\u52A0\u3057\u307E\u3057\u305F\uFF01" },
    addSongFailed: { en: "Failed: {v}", jp: "\u5931\u6557: {v}" },
    myLibrary: { en: "My library", jp: "\u30DE\u30A4\u30E9\u30A4\u30D6\u30E9\u30EA" },
    addSongRemove: { en: "Delete", jp: "\u524A\u9664" },
    addSongConfirmRemove: {
      en: 'Delete "{v}"? This cannot be undone.',
      jp: "\u300C{v}\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002"
    },
    addSongSearch: { en: "Search composer / title\u2026", jp: "\u4F5C\u66F2\u5BB6\u30FB\u66F2\u540D\u3067\u691C\u7D22\u2026" },
    addSongLibraryLoading: { en: "Loading catalog\u2026", jp: "\u30AB\u30BF\u30ED\u30B0\u53D6\u5F97\u4E2D\u2026" },
    addSongLibraryCount: { en: "{n} pieces", jp: "{n} \u66F2" },
    addSongLibraryOffline: {
      en: "Catalog offline \u2014 showing seed list",
      jp: "\u30AB\u30BF\u30ED\u30B0\u53D6\u5F97\u5931\u6557 \u2014 \u65E2\u5B9A\u30EA\u30B9\u30C8\u3092\u8868\u793A"
    },
    addSongExport: { en: "\u2B07 Export library", jp: "\u2B07 \u30A8\u30AF\u30B9\u30DD\u30FC\u30C8" },
    addSongImport: { en: "\u2B06 Import", jp: "\u2B06 \u30A4\u30F3\u30DD\u30FC\u30C8" },
    addSongImportDone: { en: "Imported {n} song(s)", jp: "{n} \u66F2\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F" },
    addSongEditSections: { en: "\u270E Edit sections", jp: "\u270E \u7AE0\u3092\u7DE8\u96C6" },
    sectionEditTitle: { en: "Edit sections", jp: "\u7AE0\u306E\u7DE8\u96C6" },
    sectionEditHelp: {
      en: "Set start measure (1-based) for each part. Total: {v} measures.",
      jp: "\u5404\u7AE0\u306E\u958B\u59CB\u5C0F\u7BC0\u3092\u5165\u529B\uFF081\u59CB\u307E\u308A\uFF09\u3002\u5168{v}\u5C0F\u7BC0\u3002"
    },
    sectionEditSave: { en: "Save", jp: "\u4FDD\u5B58" },
    sectionEditCancel: { en: "Cancel", jp: "\u30AD\u30E3\u30F3\u30BB\u30EB" },
    sectionEditError: {
      en: "Boundaries must be increasing and within range.",
      jp: "\u5C0F\u7BC0\u756A\u53F7\u306F\u6607\u9806\u304B\u3064\u7BC4\u56F2\u5185\u3067\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002"
    },
    // Auto-section names for user-added songs (no human-curated descriptions)
    userSecA1: { en: "Part 1", jp: "\u7B2C1\u7AE0" },
    userSecA1desc: { en: "Opening section", jp: "\u5192\u982D\u306E\u90E8\u5206" },
    userSecB: { en: "Part 2", jp: "\u7B2C2\u7AE0" },
    userSecBdesc: { en: "Middle section", jp: "\u307E\u3093\u306A\u304B\u306E\u90E8\u5206" },
    userSecA2: { en: "Part 3 (climax)", jp: "\u7B2C3\u7AE0\uFF08\u30AF\u30E9\u30A4\u30DE\u30C3\u30AF\u30B9\uFF09" },
    userSecA2desc: { en: "Final section", jp: "\u304A\u308F\u308A\u306E\u90E8\u5206" }
  };

  // src/i18n/index.ts
  function translate(table, lang, key, vars, opts = {}) {
    if (key.startsWith("__user")) {
      const colon = key.indexOf(":");
      if (colon < 0) return "";
      const which = key.slice(2, colon);
      const id = key.slice(colon + 1);
      if (which !== "userTitle" && which !== "userComposer") return "";
      const resolved = opts.userResolver?.(id, which);
      return resolved ?? "";
    }
    const entry = table[key];
    if (!entry) return key;
    const fallback = opts.fallbackLang ?? "en";
    let s = entry[lang] || entry[fallback] || key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.split("{" + k + "}").join(String(vars[k]));
      }
    }
    return s;
  }
  function createT(table, opts) {
    return (key, vars) => translate(table, opts.getLang(), key, vars, opts);
  }
  var NOTE_NAMES_EN = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B"
  ];
  var NOTE_NAMES_JP = [
    "\u30C9",
    "\u30C9#",
    "\u30EC",
    "\u30EC#",
    "\u30DF",
    "\u30D5\u30A1",
    "\u30D5\u30A1#",
    "\u30BD",
    "\u30BD#",
    "\u30E9",
    "\u30E9#",
    "\u30B7"
  ];
  function noteNamesFor(lang) {
    return lang === "jp" ? NOTE_NAMES_JP : NOTE_NAMES_EN;
  }

  // src/config.ts
  var CONFIG = {
    // Audio — main analyser (for pitch + visualisation)
    FFT_SIZE: 4096,
    SMOOTHING: 0.82,
    PIANO_FREQ_MIN: 27,
    PIANO_FREQ_MAX: 4200,
    // Onset analyser — dedicated low-smoothing node for transient detection
    ONSET_FFT_SIZE: 2048,
    ONSET_SMOOTHING: 0.15,
    // Software AGC via GainNode
    AGC_TARGET_RMS: 0.06,
    AGC_ATTACK_COEFF: 0.02,
    AGC_RELEASE_COEFF: 0.08,
    AGC_MIN_GAIN: 1,
    AGC_MAX_GAIN: 40,
    AGC_UPDATE_INTERVAL_MS: 100,
    AGC_SILENCE_FLOOR: 3e-4,
    // AGC voice suppression
    AGC_VOICE_REJECT_COUNT: 5,
    AGC_VOICE_SUPPRESS_MAX: 8,
    AGC_VOICE_SUPPRESS_MS: 500,
    AGC_VOICE_RMS_MIN: 0.02,
    // Synesthesia colors (educational mode)
    NOTE_COLORS: {
      C: "#ff0000",
      "C#": "#ff4000",
      D: "#ff8000",
      "D#": "#ffbf00",
      E: "#ffff00",
      F: "#80ff00",
      "F#": "#00ff00",
      G: "#00ffff",
      "G#": "#0080ff",
      A: "#0000ff",
      "A#": "#8000ff",
      B: "#ff00ff"
    },
    // YIN pitch detection
    YIN_THRESHOLD: 0.2,
    YIN_PROBABILITY_THRESHOLD: 0.1,
    RMS_SILENCE_THRESHOLD: 8e-3,
    PITCH_MIN_HZ: 25,
    // Practice-mode floor — YIN frequently locks onto a sub-harmonic 1-2 octaves
    // below the actual note. Für Elise's lowest written pitch is ~A2 (~110Hz),
    // so anything below E2 (~82Hz) is almost always an octave-down error.
    PITCH_MIN_HZ_PRACTICE: 80,
    PITCH_MAX_HZ: 5e3,
    GOOD_NOTE_RMS: 8e-3,
    CONFIDENCE_THRESHOLD: 0.6,
    // Multi-feature onset classification
    SPECTRAL_FLUX_THRESHOLD: 4,
    SPECTRAL_FLUX_ADAPTIVE_K: 1.3,
    SPECTRAL_FLUX_HISTORY_SIZE: 20,
    ONSET_SPREAD_THRESHOLD: 0.05,
    ONSET_SPREAD_MAX: 0.7,
    ONSET_SPREAD_MIN_CHANGE: 1.5,
    // Spectral flatness lower bound. Piano single notes are very tonal (low
    // flatness), so this threshold must be small or the gate rejects clean
    // playing. The harmonicity gate already filters non-pitched sounds.
    FLATNESS_PIANO_MIN: 0.03,
    CREST_VOICE_MAX: 8,
    ONSET_GATE_DURATION_MS: 1500,
    ONSET_COOLDOWN_MS: 60,
    FLUX_FREQ_MIN_HZ: 20,
    FLUX_FREQ_MAX_HZ: 4200,
    // Harmonicity gate
    HARMONICITY_MIN: 0,
    // free-play: lenient so chords aren't rejected
    HARMONICITY_MIN_PRACTICE: 0.12,
    // practice: light filter for voice/key clatter
    HARMONICITY_PARTIALS: 6,
    HARMONICITY_BIN_TOLERANCE: 2,
    // Session confidence
    SESSION_WINDOW_MS: 4e3,
    SESSION_CONFIRM_THRESHOLD: 0.35,
    SESSION_LOSE_THRESHOLD: 0.1,
    SESSION_WARMUP_MS: 2e3,
    SESSION_SAMPLE_INTERVAL_MS: 50,
    // Spectral centroid tracking (debug)
    CENTROID_HISTORY_SIZE: 20,
    // Quality scoring
    SCORE_RHYTHM_WEIGHT: 0.4,
    SCORE_DYNAMICS_WEIGHT: 0.35,
    SCORE_STABILITY_WEIGHT: 0.25,
    IOI_HISTORY_SIZE: 16,
    IOI_IDEAL_CV: 0.3,
    IOI_MAX_CV: 1.5,
    AMPLITUDE_HISTORY_SIZE: 30,
    DYNAMICS_IDEAL_CV_MIN: 0.03,
    DYNAMICS_IDEAL_CV_MAX: 0.6,
    SCORE_UPDATE_INTERVAL_MS: 500,
    SCORE_SMOOTHING: 0.08,
    GROWTH_WINDOW_MS: 3e4,
    MOTIVATION_GOAL_MS: 3e4,
    // Game timing
    COMBO_WINDOW_MS: 3e3,
    SILENCE_DECAY_START_MS: 8e3,
    SILENCE_HARD_DECAY_MS: 12e3,
    NOISE_PENALTY_COOLDOWN_MS: 300,
    NOTE_DISPLAY_DURATION_MS: 1200,
    MIN_NOTE_INTERVAL_MS: 70,
    // Game balance
    FLOW_GAIN_BASE: 8,
    FLOW_GAIN_COMBO_MAX: 10,
    FLOW_GAIN_STABILITY_MAX: 20,
    FLOW_GAIN_QUALITY_MAX: 25,
    FLOW_DECAY_SOFT: 0.5,
    FLOW_DECAY_HARD: 2,
    NOISE_RMS_THRESHOLD: 0.05,
    FLOW_NOISE_PENALTY: 3,
    COMBO_DECAY_RATE: 0.5,
    COMBO_NOISE_PENALTY: 1,
    // Pitch stability
    STABILITY_SEMITONE_THRESHOLD: 3,
    STABILITY_GROWTH: 0.05,
    STABILITY_DECAY_GOOD: 0.9,
    STABILITY_DECAY_IDLE: 0.995,
    // Rendering — these are defaults; PERF_PROFILE overrides them at runtime.
    MAX_PARTICLES: 800,
    SHADOW_BLUR_ENABLED: true,
    AMBIENT_PARTICLE_CHANCE: 0.03,
    BAR_COUNT: 64,
    // Stages — `nameKey` is resolved via t() so labels follow prefs.lang.
    STAGES: [
      { nameKey: null, prefix: "", minFlow: 0 },
      { nameKey: "stage1", prefix: "\u2726 ", minFlow: 15 },
      { nameKey: "stage2", prefix: "\u2726\u2726 ", minFlow: 35 },
      { nameKey: "stage3", prefix: "\u2726\u2726\u2726 ", minFlow: 55 },
      { nameKey: "stage4", prefix: "\u2726\u2726\u2726\u2726 ", minFlow: 75 },
      { nameKey: "stage5", prefix: "\u2726\u2726\u2726\u2726\u2726 ", minFlow: 90 },
      { nameKey: "stage6", prefix: "\u2726\u2726\u2726\u2726\u2726\u2726 ", minFlow: 98 }
    ],
    // Encouragement tiers — replaces combo number display
    ENCOURAGEMENT_TIERS: [
      { minCombo: 3, messageKey: "enc1", effect: "glowPulse" },
      { minCombo: 8, messageKey: "enc2", effect: "glowParticles" },
      { minCombo: 15, messageKey: "enc3", effect: "colorWave" },
      { minCombo: 25, messageKey: "enc4", effect: "starShower" },
      { minCombo: 40, messageKey: "enc5", effect: "flowerBurst" },
      { minCombo: 60, messageKey: "enc6", effect: "shimmer" },
      { minCombo: 80, messageKey: "enc7", effect: "radiance" },
      { minCombo: 100, messageKey: "enc8", effect: "goldenBurst" }
    ],
    ENCOURAGEMENT_COOLDOWN_MS: 8e3,
    ENCOURAGEMENT_DISPLAY_MS: 2500,
    // Note mapping — kept here for legacy convenience; @piano/core/i18n
    // exposes NOTE_NAMES_EN/JP separately for localized rendering.
    NOTE_NAMES: ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    PIANO_KEY_MIN: 21,
    PIANO_KEY_COUNT: 88,
    // Themes
    THEMES: [
      {
        bg: [10, 10, 20],
        colors: ["#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#6366f1", "#818cf8"],
        glow: "rgba(139,92,246,"
      },
      {
        bg: [8, 18, 20],
        colors: ["#06b6d4", "#22d3ee", "#34d399", "#10b981", "#14b8a6", "#67e8f9"],
        glow: "rgba(6,182,212,"
      },
      {
        bg: [20, 12, 8],
        colors: ["#f97316", "#fb923c", "#ef4444", "#f43f5e", "#eab308", "#fbbf24"],
        glow: "rgba(249,115,22,"
      },
      {
        bg: [12, 12, 18],
        colors: ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#ddd6fe", "#f0f0ff", "#ffffff"],
        glow: "rgba(200,200,255,"
      }
    ]
  };
  var QUESTS = [
    {
      id: "q1",
      nameKey: "qst1Name",
      descKey: "qst1Desc",
      condition: (s) => s.noteOnsetTimes.length >= 3,
      reward: "Nice Start!"
    },
    {
      id: "q2",
      nameKey: "qst2Name",
      descKey: "qst2Desc",
      condition: (s) => s.flow >= 50,
      reward: "Good Flow!"
    },
    {
      id: "q3",
      nameKey: "qst3Name",
      descKey: "qst3Desc",
      condition: (s) => s.combo >= 30,
      reward: "Combo Master!"
    },
    {
      id: "q4",
      nameKey: "qst4Name",
      descKey: "qst4Desc",
      condition: (s) => s.stabilityScore >= 0.8,
      reward: "Stable Tone!"
    },
    {
      id: "q5",
      nameKey: "qst5Name",
      descKey: "qst5Desc",
      condition: (s) => s.sessionState === "performing" && s.sessionConfidence > 0.8,
      reward: "Virtuoso!"
    },
    {
      id: "q6",
      nameKey: "qst6Name",
      descKey: "qst6Desc",
      condition: (s) => s.rhythmScore >= 0.85,
      reward: "Rhythm Master!"
    },
    {
      id: "q7",
      nameKey: "qst7Name",
      descKey: "qst7Desc",
      condition: (s) => s.flow >= 95,
      reward: "Peak Flow!"
    },
    {
      id: "q8",
      nameKey: "qst8Name",
      descKey: "qst8Desc",
      condition: (s) => s.combo >= 100,
      reward: "Century Combo!"
    },
    {
      id: "q9",
      nameKey: "qst9Name",
      descKey: "qst9Desc",
      condition: (s) => s.dynamicsScore >= 0.8,
      reward: "Dynamic Range!"
    },
    {
      id: "q10",
      nameKey: "qst10Name",
      descKey: "qst10Desc",
      condition: (s) => s.qualityScore >= 0.85,
      reward: "Full Focus!"
    },
    {
      id: "q11",
      nameKey: "qst11Name",
      descKey: "qst11Desc",
      condition: (s) => s.bestCombo >= 200 && s.flow >= 90,
      reward: "LEGENDARY!"
    }
  ];
  return __toCommonJS(src_exports);
})();
