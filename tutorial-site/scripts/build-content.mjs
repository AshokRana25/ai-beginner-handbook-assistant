// Validates content/ and bundles it into public/content/curriculum.json for the site.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const contentDir = path.join(root, 'content');
const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const TYPES = ['Conceptual', 'Practical', 'Scenario-based', 'Interview'];
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(path.relative(root, file), `invalid JSON (${e.message})`);
    return null;
  }
};

const nonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const nonEmptyStrings = v => Array.isArray(v) && v.length > 0 && v.every(nonEmptyString);
const isId = v => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v);
const isHttps = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const abortIfInvalid = () => {
  if (!errors.length) return;
  console.error(`Content validation failed with ${errors.length} error(s):\n- ${errors.join('\n- ')}`);
  process.exit(1);
};
// Stable per-question choice so option order is not always "correct first".
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const site = readJson(path.join(contentDir, 'site.json'));
if (!site) throw new Error(errors.join('\n'));
for (const key of ['categories', 'paths', 'projects']) {
  if (!Array.isArray(site[key]) || !site[key].length) {
    fail('content/site.json', `"${key}" must be a non-empty array`);
    continue;
  }
  const ids = new Set();
  for (const item of site[key]) {
    if (!item || !isId(item.id)) { fail(key, 'each item requires a slug id'); continue; }
    if (ids.has(item.id)) fail(key, `duplicate id "${item.id}"`);
    ids.add(item.id);
    const fields = key === 'categories' ? ['name', 'description', 'coverage', 'icon']
      : key === 'paths' ? ['name', 'description', 'audience', 'tag', 'color', 'icon']
        : ['title', 'description', 'category', 'time', 'icon'];
    for (const field of fields) if (!nonEmptyString(item[field])) fail(`${key}/${item.id}`, `"${field}" is required`);
    if (key === 'categories') {
      if (!Array.isArray(item.planned) || !item.planned.every(nonEmptyString)) fail(item.id, 'planned must be a list of titles');
    } else {
      if (!nonEmptyStrings(item.lessons) || new Set(item.lessons).size !== item.lessons.length) fail(item.id, 'lessons must be non-empty and unique');
    }
    if (key === 'projects' && !LEVELS.includes(item.level)) fail(item.id, 'unknown project level');
  }
}
abortIfInvalid();
const categoryIds = new Set(site.categories.map(c => c.id));

const lessonFiles = fs.readdirSync(path.join(contentDir, 'lessons')).filter(f => f.endsWith('.json'));
const lessons = [];
const questionIds = new Set();
const questionTexts = new Set();

for (const file of lessonFiles) {
  const where = `content/lessons/${file}`;
  const l = readJson(path.join(contentDir, 'lessons', file));
  if (!l) continue;
  if (!isId(l.id)) fail(where, 'id must be a lowercase slug');
  if (l.id !== file.replace(/\.json$/, '')) fail(where, 'id must match the file name');
  for (const key of ['title', 'description', 'prerequisites', 'example', 'exercise']) {
    if (!nonEmptyString(l[key])) fail(where, `"${key}" is required`);
  }
  if (!categoryIds.has(l.category)) fail(where, `unknown category "${l.category}"`);
  if (!LEVELS.includes(l.level)) fail(where, `level must be one of ${LEVELS.join(', ')}`);
  if (!Number.isInteger(l.order)) fail(where, '"order" must be an integer');
  if (!Number.isInteger(l.minutes) || l.minutes <= 0) fail(where, '"minutes" must be a positive integer');
  for (const key of ['objectives', 'explanation', 'mistakes']) {
    if (!nonEmptyStrings(l[key])) fail(where, `"${key}" must be a non-empty list of strings`);
  }
  if (!Array.isArray(l.terms) || !l.terms.length || !l.terms.every(t => nonEmptyString(t.term) && nonEmptyString(t.definition))) {
    fail(where, '"terms" must list {term, definition} objects');
  }
  const reviewedDate = new Date(`${l.reviewed}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.reviewed ?? '') || !Number.isFinite(+reviewedDate) || reviewedDate.toISOString().slice(0, 10) !== l.reviewed) fail(where, '"reviewed" must be a real YYYY-MM-DD date');
  if (!Array.isArray(l.sources) || !l.sources.length || !l.sources.every(s => s && nonEmptyString(s.title) && isHttps(s.url))) {
    fail(where, '"sources" must list {title, url} objects with https URLs');
  }

  const code = [];
  if (l.code !== undefined && !Array.isArray(l.code)) fail(where, 'code must be an array');
  for (const [i, c] of (Array.isArray(l.code) ? l.code : []).entries()) {
    if (!c || typeof c !== 'object') { fail(where, `code[${i}] must be an object`); continue; }
    if (!nonEmptyString(c.file) || path.basename(c.file) !== c.file || /[\\/]/.test(c.file)) {
      fail(where, `code[${i}] must refer to a filename within content/examples`);
      continue;
    }
    const file = path.join(contentDir, 'examples', c.file ?? '');
    if (!nonEmptyString(c.file) || !fs.existsSync(file)) {
      fail(where, `code[${i}] references a missing file "${c.file}"`);
      continue;
    }
    if (!nonEmptyString(c.title) || !nonEmptyString(c.language)) fail(where, `code[${i}] needs a title and language`);
    const runnable = c.run !== undefined || c.expectedOutput !== undefined;
    if (runnable && (!['python', 'node'].includes(c.run) || typeof c.expectedOutput !== 'string')) {
      fail(where, `code[${i}] requires run (python or node) and a string expectedOutput together`);
    }
    const { file: _file, run, expectedOutput, ...rest } = c;
    code.push({ ...rest, tested: Boolean(run && typeof expectedOutput === 'string'), source: fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd() });
  }

  if (!Array.isArray(l.questions) || l.questions.length !== 5) fail(where, 'exactly five questions are required');
  const questions = (Array.isArray(l.questions) ? l.questions : []).map((q, i) => {
    const qWhere = `${where} question ${i + 1}`;
    if (!q || typeof q !== 'object') { fail(qWhere, 'must be an object'); return null; }
    for (const key of ['id', 'question', 'answer', 'distractor']) if (!nonEmptyString(q[key])) fail(qWhere, `"${key}" is required`);
    if (!TYPES.includes(q.type)) fail(qWhere, `type must be one of ${TYPES.join(', ')}`);
    if (!isId(q.id)) fail(qWhere, 'id must be a lowercase slug');
    if (nonEmptyString(q.answer) && nonEmptyString(q.distractor) && q.answer.trim() === q.distractor.trim()) fail(qWhere, 'answer and distractor must differ');
    if (questionIds.has(q.id)) fail(qWhere, `duplicate question id "${q.id}"`);
    if (questionTexts.has(q.question)) fail(qWhere, 'duplicate question text');
    questionIds.add(q.id);
    questionTexts.add(q.question);
    const correct = hash(q.id ?? '') % 2;
    const options = correct ? [q.distractor, q.answer] : [q.answer, q.distractor];
    return { id: q.id, type: q.type, question: q.question, answer: q.answer, options, correct };
  });

  lessons.push({ ...l, code, questions });
}

const categoryOrder = site.categories.map(c => c.id);
lessons.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || a.order - b.order);
const lessonIds = new Set(lessons.map(l => l.id));

for (const p of site.paths) {
  for (const id of p.lessons) if (!lessonIds.has(id)) fail(`path "${p.id}"`, `unknown lesson "${id}"`);
}
for (const p of site.projects) {
  if (!site.categories.some(c => c.name === p.category)) fail(`project "${p.id}"`, 'unknown category name');
  for (const id of p.lessons) if (!lessonIds.has(id)) fail(`project "${p.id}"`, `unknown lesson "${id}"`);
  for (const key of ['requirements', 'steps', 'criteria']) if (!nonEmptyStrings(p[key])) fail(`project "${p.id}"`, `"${key}" is required`);
}

abortIfInvalid();

// Roles come from the learning paths that include a lesson.
for (const l of lessons) {
  l.roles = site.paths.filter(p => p.lessons.includes(l.id)).map(p => p.id);
  if (!l.roles.length) fail(l.id, 'must belong to at least one learning path');
  if (site.categories.find(c => c.id === l.category).planned.includes(l.title)) fail(l.id, 'published lesson is still marked planned');
}
abortIfInvalid();

const out = path.join(root, 'public', 'content', 'curriculum.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ ...site, lessons }));
console.log(`Built ${lessons.length} tutorials and ${questionIds.size} questions -> ${path.relative(root, out)}`);
