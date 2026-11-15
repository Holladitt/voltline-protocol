// VOLTLINE PROTOCOL — tests/parse_check.mjs
// Parse every game module as an ES module (no execution, no DOM needed).
// Needs --experimental-vm-modules (Node 24 refuses vm.SourceTextModule
// without the flag — that is a Node quirk, not a code defect).
// Usage: node --experimental-vm-modules tests/parse_check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'src');
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
let ok = 0;
for (const f of files) {
  const code = readFileSync(join(dir, f), 'utf8');
  try {
    new vm.SourceTextModule(code, { identifier: f });
    ok++;
  } catch (e) {
    console.log(`  parse FAIL: ${f}: ${e.message}`);
  }
}
console.log(`parse_check: ${ok}/${files.length} modules parse`);
process.exit(ok === files.length ? 0 : 1);
