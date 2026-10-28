import { terms } from './utils.js';

export const data = { categories: [], lessons: [], paths: [], projects: [], questions: [] };
const byId = { lesson: new Map(), category: new Map(), path: new Map(), project: new Map(), question: new Map() };

export const ROLES = [['beginner', 'AI Beginner'], ['developer', 'AI Developer'], ['engineer', 'AI Engineer'], ['manager', 'AI Product / Project Manager']];
export const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
export const QUESTION_TYPES = ['Conceptual', 'Practical', 'Scenario-based', 'Interview'];

export async function loadContent() {
  const res = await fetch(`${import.meta.env.BASE_URL}content/curriculum.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Content request failed (${res.status})`);
  const json = await res.json();
  Object.assign(data, json);
  data.questions = data.lessons.flatMap(l => l.questions.map(q => ({ ...q, lesson: l, category: l.category, level: l.level, roles: l.roles })));
  data.lessons.forEach(l => byId.lesson.set(l.id, l));
  data.categories.forEach(c => {
    c.lessons = data.lessons.filter(l => l.category === c.id);
    byId.category.set(c.id, c);
  });
  data.paths.forEach(p => byId.path.set(p.id, p));
  data.projects.forEach(p => byId.project.set(p.id, p));
  data.questions.forEach(q => byId.question.set(q.id, q));
}

export const getLesson = id => byId.lesson.get(id);
export const getCategory = id => byId.category.get(id);
export const getPath = id => byId.path.get(id);
export const getProject = id => byId.project.get(id);
export const getQuestion = id => byId.question.get(id);

function score(fields, query) {
  const t = terms(query);
  if (!t.length) return 1;
  let total = 0;
  for (const term of t) {
    let hit = 0;
    for (const [text, weight] of fields) if (text.toLowerCase().includes(term)) hit = Math.max(hit, weight);
    if (!hit) return 0;
    total += hit;
  }
  return total;
}

export function searchLessons(query, { category, level } = {}) {
  return data.lessons
    .filter(l => (!category || l.category === category) && (!level || l.level === level))
    .map(l => ({
      item: l,
      score: score([
        [l.title, 10], [l.description, 5], [getCategory(l.category).name, 4],
        [l.terms.map(t => `${t.term} ${t.definition}`).join(' '), 3],
        [l.objectives.join(' '), 2], [l.explanation.join(' ') + l.example + l.mistakes.join(' '), 1]
      ], query)
    }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

export function searchQuestions(query, { category, level, type, role } = {}) {
  return data.questions
    .filter(q => (!category || q.category === category) && (!level || q.level === level) && (!type || q.type === type) && (!role || q.roles.includes(role)))
    .map(q => ({ item: q, score: score([[q.question, 6], [q.answer, 3], [q.lesson.title, 2], [getCategory(q.category).name, 2]], query) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}
