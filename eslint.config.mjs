// Flat-config ESLint 9 setup. Targets the monorepo (packages/**) — explicitly
// EXCLUDES the still-vanilla legacy-app.js (loaded by the Vite shell as a
// side-effect import; awaiting Phase 0c TypeScript conversion).

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Global ignores (apply before any other config picks files up).
  // Flat-config patterns are evaluated against cwd-relative paths, so we use
  // `**/dist/**` etc. to catch nested dist folders inside packages/.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      'packages/mobile/ios/**',
      'packages/mobile/android/**',
      // Legacy shell — Phase 0c will rewrite to TS and lift this exclusion.
      'packages/web/src/legacy-app.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        DOMParser: 'readonly',
        Float32Array: 'readonly',
        Uint8Array: 'readonly',
        FileReader: 'readonly',
        // Web Audio
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        AudioBuffer: 'readonly',
        AnalyserNode: 'readonly',
        GainNode: 'readonly',
        AudioWorklet: 'readonly',
        // MIDI
        MIDIAccess: 'readonly',
        MIDIInput: 'readonly',
        MIDIPort: 'readonly',
        MIDIMessageEvent: 'readonly',
        MIDIConnectionEvent: 'readonly',
        // Canvas / DOM
        CanvasRenderingContext2D: 'readonly',
        HTMLCanvasElement: 'readonly',
        OffscreenCanvas: 'readonly',
        // Misc
        performance: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
      },
    },
    rules: {
      // We use both '_' prefix and 'no-unused-vars' off in many places; keep loose.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off', // We bridge to untyped Web MIDI / native APIs frequently.
      // Empty marker interfaces are useful for nominal typing of node subclasses.
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off', // Console logging is part of debugging UX in this app.
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
    },
  },
  // Node scripts (bench harness, build helpers) — they import 'node:*' and
  // touch process.env / process.argv / process.stdout. Add Node globals.
  {
    files: ['**/scripts/**/*.mjs', '**/scripts/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
  },
];
