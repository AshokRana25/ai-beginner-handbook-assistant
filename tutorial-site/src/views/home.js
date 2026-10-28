import { icon } from '../icons.js';
import { store } from '../store.js';
import { esc } from '../utils.js';
import { data, getLesson } from '../data.js';
import { categoryCard, lessonCard, pathCard } from '../components.js';

const FEATURED = ['what-is-ai', 'llm-basics', 'better-prompts', 'rag-foundations', 'agent-workflows', 'mcp-introduction'];

export function homeView() {
  const completed = store.completedIds().filter(getLesson);
  const lastPath = data.paths.find(p => p.lessons.some(id => store.isCompleted(id)) && p.lessons.some(id => !store.isCompleted(id)));
  const nextId = lastPath?.lessons.find(id => !store.isCompleted(id));
  const next = nextId && getLesson(nextId);
  const planned = data.categories.reduce((n, c) => n + (c.planned?.length ?? 0), 0);

  return {
    title: 'AI Learning Hub: learn AI step by step',
    html: `
    <section class="hero">
      <div class="container hero-inner">
        <p class="eyebrow">Free, structured, practical</p>
        <h1 tabindex="-1">Learn AI one clear lesson at a time.</h1>
        <p class="lead">Tutorials, learning paths, practice projects, and interview questions for beginners, software developers, and technical managers.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="#/paths">Start Learning ${icon('arrow-right', 18)}</a>
          <a class="btn btn-secondary btn-lg" href="#/library">Browse topics</a>
        </div>
        <dl class="stats">
          <div><dt>Tutorials</dt><dd>${data.lessons.length}</dd></div>
          <div><dt>Questions with answers</dt><dd>${data.questions.length}</dd></div>
          <div><dt>Topic categories</dt><dd>${data.categories.length}</dd></div>
          <div><dt>Learning paths</dt><dd>${data.paths.length}</dd></div>
        </dl>
      </div>
    </section>
    ${next ? `<section class="container section continue" aria-labelledby="continue-h">
      <div class="card continue-card">
        <div><p class="eyebrow">Continue ${esc(lastPath.name)}</p><h2 id="continue-h">${esc(next.title)}</h2>
        <p>${completed.length} ${completed.length === 1 ? 'lesson' : 'lessons'} completed so far.</p></div>
        <a class="btn btn-primary" href="#/lesson/${esc(next.id)}">Resume ${icon('arrow-right', 18)}</a>
      </div></section>` : ''}
    <section class="container section" aria-labelledby="paths-h">
      <div class="section-head"><h2 id="paths-h">Learning paths</h2><a href="#/paths">All paths ${icon('arrow-right', 16)}</a></div>
      <p class="section-lead">Pick the path that matches your role. Each one orders the lessons for you.</p>
      <div class="grid grid-4">${data.paths.map(pathCard).join('')}</div>
    </section>
    <section class="container section" aria-labelledby="featured-h">
      <div class="section-head"><h2 id="featured-h">Featured tutorials</h2><a href="#/library">Topic library ${icon('arrow-right', 16)}</a></div>
      <div class="grid grid-3">${FEATURED.map(getLesson).filter(Boolean).map(l => lessonCard(l)).join('')}</div>
    </section>
    <section class="container section" aria-labelledby="topics-h">
      <div class="section-head"><h2 id="topics-h">Topic categories</h2></div>
      <p class="section-lead">${data.lessons.length} published tutorials across ${data.categories.length} categories.${planned ? ` ${planned} more are marked “Coming soon”.` : ' Explore the full curriculum at your own pace.'}</p>
      <div class="grid grid-3 categories">${data.categories.map(categoryCard).join('')}</div>
    </section>
    <section class="container section" aria-labelledby="more-h">
      <h2 id="more-h" class="visually-hidden">More ways to learn</h2>
      <div class="grid grid-3">
        <a class="card feature-card" href="#/questions">${icon('circle-help', 24)}<h3>Questions & answers</h3><p>${data.questions.length} conceptual, practical, scenario-based, and interview questions.</p></a>
        <a class="card feature-card" href="#/projects">${icon('hammer', 24)}<h3>Practice projects</h3><p>${data.projects.length} guided projects with requirements, steps, and success criteria.</p></a>
        <a class="card feature-card" href="#/my-learning">${icon('graduation-cap', 24)}<h3>My learning</h3><p>Track completed lessons, bookmarks, and quiz results. No account needed.</p></a>
      </div>
    </section>`
  };
}
