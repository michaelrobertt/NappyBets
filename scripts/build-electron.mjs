import { build } from 'esbuild';

await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron', 'sql.js'],
  outdir: 'dist-electron',
  sourcemap: false,
  logLevel: 'info',
});
