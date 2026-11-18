import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();
server.printUrls();

const url = `http://localhost:5173`;
const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

child.on('close', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
