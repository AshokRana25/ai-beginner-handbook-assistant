// Runs lesson code examples that declare "run" and "expectedOutput", and compares their output.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const lessonsDir = path.join(root, 'content', 'lessons');
const commands = { python: process.platform === 'win32' ? 'python' : 'python3', node: process.execPath };
let failures = 0;
let checked = 0;

for (const file of fs.readdirSync(lessonsDir).filter(f => f.endsWith('.json'))) {
  const lesson = JSON.parse(fs.readFileSync(path.join(lessonsDir, file), 'utf8'));
  for (const example of lesson.code ?? []) {
    if (!example.run || example.expectedOutput === undefined) continue;
    const script = path.join(root, 'content', 'examples', example.file);
    checked++;
    try {
      const output = execFileSync(commands[example.run], [script], { encoding: 'utf8', timeout: 15_000 }).replace(/\r\n/g, '\n').trim();
      if (output === example.expectedOutput.replace(/\r\n/g, '\n').trim()) {
        console.log(`PASS ${lesson.id}: ${example.file}`);
      } else {
        failures++;
        console.error(`FAIL ${lesson.id}: ${example.file}\n  expected: ${example.expectedOutput}\n  actual:   ${output}`);
      }
    } catch (e) {
      failures++;
      console.error(`FAIL ${lesson.id}: ${example.file} (${e.message})`);
    }
  }
}

console.log(`${checked - failures}/${checked} examples passed.`);
process.exit(failures ? 1 : 0);
