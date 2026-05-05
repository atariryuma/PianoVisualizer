// Minimal CanvasRenderingContext2D stub for testing draw functions.
// Records every call so tests can assert what was drawn without needing jsdom.

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface CanvasStub {
  ctx: CanvasRenderingContext2D;
  /** All method calls + property writes, in order. */
  calls: RecordedCall[];
  /** Snapshot of property writes (last value wins). */
  props: Record<string, unknown>;
  /** Reset between tests. */
  reset(): void;
  /** Convenience: count calls of a given method name. */
  countCalls(method: string): number;
  /** Convenience: get the last value written to a property. */
  prop<T = unknown>(key: string): T | undefined;
}

const STATE_PROPS = [
  'globalAlpha',
  'fillStyle',
  'strokeStyle',
  'shadowColor',
  'shadowBlur',
  'lineWidth',
  'font',
  'textAlign',
  'textBaseline',
  'globalCompositeOperation',
];

const VOID_METHODS = [
  'save',
  'restore',
  'translate',
  'rotate',
  'scale',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'arc',
  'arcTo',
  'ellipse',
  'rect',
  'fillRect',
  'strokeRect',
  'clearRect',
  'fill',
  'stroke',
  'fillText',
  'strokeText',
  'setTransform',
  'resetTransform',
];

export function makeCanvasStub(): CanvasStub {
  const calls: RecordedCall[] = [];
  const props: Record<string, unknown> = {};

  const ctx = {} as Record<string, unknown>;

  for (const m of VOID_METHODS) {
    ctx[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
    };
  }

  // createLinearGradient + createRadialGradient return a chainable object
  // that addColorStop also gets recorded.
  const fakeGradient = {
    addColorStop: (...args: unknown[]) => calls.push({ method: 'gradient.addColorStop', args }),
  };
  ctx.createLinearGradient = (...args: unknown[]) => {
    calls.push({ method: 'createLinearGradient', args });
    return fakeGradient;
  };
  ctx.createRadialGradient = (...args: unknown[]) => {
    calls.push({ method: 'createRadialGradient', args });
    return fakeGradient;
  };

  for (const p of STATE_PROPS) {
    Object.defineProperty(ctx, p, {
      get: () => props[p],
      set: (v) => {
        props[p] = v;
        calls.push({ method: 'set ' + p, args: [v] });
      },
      enumerable: true,
      configurable: true,
    });
  }

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    props,
    reset() {
      calls.length = 0;
      for (const k of Object.keys(props)) delete props[k];
    },
    countCalls(method: string) {
      return calls.filter((c) => c.method === method).length;
    },
    prop<T = unknown>(key: string) {
      return props[key] as T | undefined;
    },
  };
}
