// VOLTLINE PROTOCOL — entry program (Node 22, standard library only).
// Menyerahkan game ke /output: menyalin game/ dan screenshots/ dari repo ini,
// lalu menulis /output/dossier.json dengan library make.fun yang divendor.
// Di luar grader, MAKEFUN_OUTPUT_DIR menggantikan /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Game dimainkan lokal dengan: node serve.ts -> http://localhost:8080
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Batas scorer (reference/gate.json): text_max_bytes membentuk byte dossier;
// batas lain menolak entry yang scorer tolak (lebih dari 4 screenshot atau satu
// di atas 256 KiB; lebih dari 993 file di game/ atau 48 MiB game secara total:
// game/ dihitung bersama cap 1000 entri /output, screenshots/ dan dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, { text_max_bytes: 163840, screenshots: { max: 4, max_bytes: 262144 }, game_max_files: 993, game_max_bytes: 50331648 }),
);
