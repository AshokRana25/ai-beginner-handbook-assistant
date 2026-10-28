import { icon } from '../icons.js';
import { store } from '../store.js';
import { esc, levelBadge } from '../utils.js';
import { data, getCategory, getLesson, getPath, getProject } from '../data.js';
import { breadcrumbs, pathCard, pathProgress, progressBar } from '../components.js';
import { notFoundView } from './notfound.js';

export function pathsView() {
  return {
    title: 'Learning paths',
    html: `<div class="container page">
      ${breadcrumbs([['Home', '#/'], ['Learning paths']])}
      <header class="page-head"><h1 tabindex="-1">Learning paths</h1>
      <p class="lead">Ordered lessons for four roles. Your progress is saved in this browser.</p></header>
      <div class="grid grid-2">${data.paths.map(pathCard).join('')}</div>
    </div>`
  };
}

export function pathView(id) {
  const p = getPath(id);
  if (!p) return notFoundView('That learning path does not exist.');
  const { done, total, next } = pathProgress(p);
  return {
    title: p.name,
    html: `<div class="container page narrow">
      ${breadcrumbs([['Home', '#/'], ['Learning paths', '#/paths'], [p.name]])}
      <header class="page-head path-head path-${esc(p.color)}">
        <p class="eyebrow">${icon(p.icon, 16)} ${esc(p.tag)}</p>
        <h1 tabindex="-1">${esc(p.name)}</h1><p class="lead">${esc(p.description)}</p>
        <p class="meta"><span>${done} of ${total} lessons completed</span></p>
        ${progressBar(done, total, `${p.name} progress`)}
        ${next ? `<a class="btn btn-primary" href="#/lesson/${esc(next)}">${done ? 'Continue with' : 'Start with'}: ${esc(getLesson(next).title)} ${icon('arrow-right', 18)}</a>` : `<p class="done">${icon('circle-check', 18)} Path complete. Well done.</p>`}
      </header>
      <ol class="steps">${p.lessons.map((lid, i) => {
        const l = getLesson(lid);
        const isDone = store.isCompleted(lid);
        const quiz = store.quiz(lid);
        return `<li class="step${isDone ? ' is-done' : ''}${lid === next ? ' is-next' : ''}">
          <span class="step-num" aria-hidden="true">${isDone ? icon('check', 16) : i + 1}</span>
          <div><h2><a href="#/lesson/${esc(l.id)}">${esc(l.title)}</a></h2>
          <p>${esc(l.description)}</p>
          <p class="meta">${levelBadge(l.level)}<span>${esc(getCategory(l.category).name)}</span><span>${l.minutes} min</span>
            ${isDone ? `<span class="done">Completed</span>` : lid === next ? '<span class="badge badge-next">Up next</span>' : ''}
            ${quiz ? `<span>Quiz ${quiz.best}/${quiz.total}</span>` : ''}</p></div>
        </li>`;
      }).join('')}</ol>
    </div>`
  };
}

export function projectsView() {
  return {
    title: 'Practice projects',
    html: `<div class="container page">
      ${breadcrumbs([['Home', '#/'], ['Practice projects']])}
      <header class="page-head"><h1 tabindex="-1">Practice projects</h1>
      <p class="lead">Guided projects with requirements, implementation steps, and success criteria. They use invented or public data only.</p></header>
      <div class="grid grid-2">${data.projects.map(p => `<article class="card project-card">
        <div class="path-icon">${icon(p.icon, 24)}</div>
        <p class="eyebrow">${esc(p.category)}</p>
        <h2 class="h3"><a class="stretched" href="#/projects/${esc(p.id)}">${esc(p.title)}</a></h2>
        <p>${esc(p.description)}</p>
        <p class="meta">${levelBadge(p.level)}<span>${icon('clock', 15)} ${esc(p.time)}</span><span>${p.steps.length} steps</span></p>
      </article>`).join('')}</div>
    </div>`
  };
}

export function projectView(id) {
  const p = getProject(id);
  if (!p) return notFoundView('That practice project does not exist.');
  return {
    title: p.title,
    html: `<div class="container page narrow">
      ${breadcrumbs([['Home', '#/'], ['Practice projects', '#/projects'], [p.title]])}
      <header class="page-head"><p class="eyebrow">${icon(p.icon, 16)} ${esc(p.category)}</p>
        <h1 tabindex="-1">${esc(p.title)}</h1><p class="lead">${esc(p.description)}</p>
        <p class="meta">${levelBadge(p.level)}<span>${icon('clock', 15)} ${esc(p.time)}</span></p></header>
      <section class="lesson-section" aria-labelledby="p-req"><h2 id="p-req">Requirements</h2><ul>${p.requirements.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>
      <section class="lesson-section" aria-labelledby="p-steps"><h2 id="p-steps">Implementation steps</h2><ol class="numbered">${p.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>
      <section class="lesson-section" aria-labelledby="p-crit"><h2 id="p-crit">Success criteria</h2><ul class="check-list">${p.criteria.map(c => `<li>${icon('circle-check', 18)}<span>${esc(c)}</span></li>`).join('')}</ul></section>
      <section class="lesson-section" aria-labelledby="p-less"><h2 id="p-less">Lessons to review first</h2>
        <ul class="link-list">${p.lessons.map(getLesson).map(l => `<li><a href="#/lesson/${esc(l.id)}">${esc(l.title)}</a>${store.isCompleted(l.id) ? ` <span class="done">${icon('circle-check', 15)} Completed</span>` : ''}</li>`).join('')}</ul></section>
    </div>`
  };
}
