// Vercel's build command (see vercel.json). Writes .vercel/output in the Build Output API v3
// format: the static web app, plus a single Node function that serves every /api/* request.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const OUTPUT = '.vercel/output';
const FUNCTION = path.join(OUTPUT, 'functions/api.func');

rmSync(OUTPUT, { recursive: true, force: true });

// 1. The web app: the same `npm run build` as locally (typecheck + vite build).
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
cpSync('apps/web/dist', path.join(OUTPUT, 'static'), { recursive: true });

// 2. The API as one ESM bundle. better-sqlite3 is a native addon and cannot be bundled.
await build({
  entryPoints: ['apps/api/src/vercel-handler.ts'],
  outfile: path.join(FUNCTION, 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${process.versions.node.split('.')[0]}`,
  external: ['better-sqlite3'],
  // Bundled CommonJS dependencies (express, jsonwebtoken…) call require(); give ESM one.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// 3. The native addon, as installed (and compiled for this Linux image) by `npm ci`, without
//    its C sources, plus bindings + file-uri-to-path, which it uses to locate the .node file.
//    Located with Node's resolver, so this works with npm's and pnpm's node_modules layouts.
const packageDir = (name, from) =>
  path.dirname(createRequire(path.resolve(from, 'package.json')).resolve(`${name}/package.json`));
const sqliteDir = packageDir('better-sqlite3', 'apps/api');
const bindingsDir = packageDir('bindings', sqliteDir);
const fileUriDir = packageDir('file-uri-to-path', bindingsDir);
for (const [name, source] of [
  ['better-sqlite3', sqliteDir],
  ['bindings', bindingsDir],
  ['file-uri-to-path', fileUriDir],
]) {
  cpSync(source, path.join(FUNCTION, 'node_modules', name), {
    recursive: true,
    dereference: true,
    filter: (file) => !/[\\/]better-sqlite3[\\/](deps|src)([\\/]|$)/.test(file),
  });
}

// 4. SQL migrations, read at runtime relative to the bundle (`new URL('./migrations/', import.meta.url)`).
cpSync('apps/api/src/db/migrations', path.join(FUNCTION, 'migrations'), { recursive: true });

// 5. Function config. The runtime must be the Node major the addon was just compiled for.
mkdirSync(FUNCTION, { recursive: true });
writeFileSync(
  path.join(FUNCTION, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: `nodejs${process.versions.node.split('.')[0]}.x`,
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      maxDuration: 30,
    },
    null,
    2,
  ),
);

// 6. Routing: /api/* goes to the function, real files are served as-is, and every other path
//    falls back to index.html so client-side routes (/orders, /stats…) survive a reload.
writeFileSync(
  path.join(OUTPUT, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Build output ready in ${OUTPUT}`);
