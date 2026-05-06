// Legacy app.js side-effect module declaration.
// app.js is plain JS executed for its side effects (registers event
// handlers, kicks off the render loop). main.ts dynamically imports it
// after seeding the Tone / OSMD / JSZip / PianoCore globals.
declare module '@legacy/app.js';
