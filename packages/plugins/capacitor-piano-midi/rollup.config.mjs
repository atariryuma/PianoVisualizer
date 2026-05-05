// Standard Capacitor plugin rollup config — emits CJS for older bundlers and
// IIFE for unpkg <script> consumption. ESM is emitted by tsc directly.
export default {
  input: 'dist/esm/index.js',
  output: [
    {
      file: 'dist/plugin.js',
      format: 'iife',
      name: 'capacitorPianoMidi',
      globals: { '@capacitor/core': 'capacitorExports' },
      sourcemap: true,
      inlineDynamicImports: true,
    },
    {
      file: 'dist/plugin.cjs.js',
      format: 'cjs',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
  external: ['@capacitor/core'],
};
