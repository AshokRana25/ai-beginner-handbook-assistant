import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const curriculum = JSON.parse(fs.readFileSync(new URL('../public/content/curriculum.json', import.meta.url), 'utf8'));
const isNarrow = page => page.viewportSize().width < 1000;

async function openNav(page) {
  if (isNarrow(page)) await page.getByRole('button', { name: 'Menu' }).click();
}

test.describe('content', () => {
  test('publishes the required scope', () => {
    expect(curriculum.lessons).toHaveLength(57);
    const questions = curriculum.lessons.flatMap(l => l.questions);
    expect(questions).toHaveLength(285);
    expect(new Set(questions.map(q => q.question)).size).toBe(questions.length);
    expect(curriculum.categories).toHaveLength(16);
    expect(curriculum.categories.flatMap(c => c.planned)).toEqual([]);
    for (const lesson of curriculum.lessons) expect(lesson.roles.length, lesson.id).toBeGreaterThan(0);
  });
});

test('home page shows paths, categories, featured tutorials and Start Learning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn AI');
  await expect(page.getByRole('heading', { name: 'Learning paths' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured tutorials' })).toBeVisible();
  await expect(page.locator('.category-card')).toHaveCount(16);
  await page.getByRole('link', { name: /Start Learning/ }).click();
  await expect(page).toHaveURL(/#\/paths$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Learning paths' })).toBeVisible();
});

test('main navigation reaches every page', async ({ page }) => {
  await page.goto('/');
  const pages = [['Topics', 'Topic library'], ['Q&A', 'Questions & answers'], ['Paths', 'Learning paths'], ['Projects', 'Practice projects'], ['My learning', 'My learning'], ['Home', /Learn AI/]];
  for (const [link, heading] of pages) {
    await openNav(page);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
  }
});

test('topic library search, filters, empty state and complete curriculum', async ({ page }) => {
  await page.goto('/#/library');
  await expect(page.locator('.lesson-card')).toHaveCount(curriculum.lessons.length);
  await expect(page.getByText('Coming soon')).toHaveCount(0);
  await expect(page.locator('.cat-group')).toHaveCount(16);

  await page.getByLabel('Search tutorials', { exact: true }).fill('embeddings');
  await expect(page.locator('.lesson-card').first()).toBeVisible();
  await expect(page.locator('.lesson-card', { hasText: 'Neural networks, embeddings & transformers' })).toBeVisible();
  await expect(page).toHaveURL(/q=embeddings/);

  await page.getByLabel('Search tutorials', { exact: true }).fill('zzqqxx');
  await expect(page.getByText('No tutorials match your filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(curriculum.lessons.length);

  await page.getByLabel('Level').selectOption('Beginner');
  const beginner = curriculum.lessons.filter(l => l.level === 'Beginner').length;
  await expect(page.locator('.lesson-card')).toHaveCount(beginner);

  await page.getByLabel('Topic', { exact: true }).selectOption('rag');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('RAG');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('RAG');
});

test('global search covers tutorials and questions with content type filter', async ({ page }) => {
  await page.goto('/');
  const box = page.getByRole('searchbox', { name: 'Search tutorials and questions' });
  await box.fill('prompt injection');
  await box.press('Enter');
  await expect(page).toHaveURL(/#\/search\?q=prompt/);
  await expect(page.getByRole('heading', { name: /^Tutorials/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Questions/ })).toBeVisible();
  await page.getByLabel('Content type').selectOption('question');
  await expect(page.getByRole('heading', { name: /^Tutorials/ })).toHaveCount(0);
  await expect(page.locator('.qa').first()).toBeVisible();
  await page.getByLabel('Search tutorials, questions, and projects').fill('qqqzzz');
  await expect(page.getByText('Nothing matched')).toBeVisible();
});

test('questions page filters, groups and expands answers', async ({ page }) => {
  await page.goto('/#/questions');
  await expect(page.locator('.qa')).toHaveCount(curriculum.lessons.length * 5);
  await page.getByLabel('Type', { exact: true }).selectOption('Interview');
  const interview = curriculum.lessons.flatMap(l => l.questions).filter(q => q.type === 'Interview').length;
  await expect(page.locator('.qa')).toHaveCount(interview);
  await page.getByLabel('Group by').selectOption('level');
  await expect(page.locator('.qa-group h2').first()).toContainText('Beginner');

  const first = page.locator('.qa').first();
  await expect(first.locator('.qa-body')).toBeHidden();
  await first.locator('summary').click();
  await expect(first.locator('.qa-body')).toBeVisible();

  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.locator('.qa[open]')).toHaveCount(interview);

  await page.getByLabel('Type', { exact: true }).selectOption('');
  await page.getByLabel('Search questions and answers').fill('context budget');
  await expect(page.locator('.qa mark').first()).toBeVisible();
  await expect(page.locator('.qa', { hasText: 'What should a context budget include?' })).toBeVisible();
});

test('tutorial page has full structure, navigation and a working quiz', async ({ page, context, browserName }) => {
  const lesson = curriculum.lessons.find(l => l.id === 'model-evaluation');
  await page.goto(`/#/lesson/${lesson.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title);
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('Machine learning');
  for (const h of ['Objectives & prerequisites', 'Explanation', 'Key terms', 'Practical example', 'Common mistakes & limitations', 'Check your understanding', 'Practice exercise', 'Sources', 'Related lessons']) {
    await expect(page.getByRole('heading', { level: 2, name: h, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/Last reviewed/).first()).toBeVisible();
  await expect(page.locator('.code-block pre')).toContainText('precision_recall');

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: /Copy code/ }).click();
    await expect(page.locator('.code-block figcaption .btn span')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('def precision_recall');
  }

  // Quiz: incomplete submission is rejected, then a perfect score is recorded.
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.quiz-msg')).toContainText('5 remaining');
  const fieldsets = page.locator('.quiz-q');
  for (let i = 0; i < lesson.questions.length; i++) {
    await fieldsets.nth(i).locator('.option').nth(lesson.questions[i].correct).click();
  }
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.quiz-score')).toContainText('You scored 5 out of 5');
  await expect(page.locator('.quiz-q.is-correct')).toHaveCount(5);

  await page.getByRole('button', { name: 'Try again' }).click();
  for (let i = 0; i < lesson.questions.length; i++) {
    await fieldsets.nth(i).locator('.option').nth(1 - lesson.questions[i].correct).click();
  }
  await page.getByRole('button', { name: 'Check answers' }).click();
  await expect(page.locator('.quiz-score')).toContainText('You scored 0 out of 5');
  await expect(page.locator('.quiz-q.is-wrong .feedback').first()).toContainText('Not quite');

  // Previous / next navigation follows curriculum order.
  const idx = curriculum.lessons.findIndex(l => l.id === lesson.id);
  await page.getByRole('link', { name: new RegExp(`Next.*${curriculum.lessons[idx + 1].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(curriculum.lessons[idx + 1].title);
  await page.getByRole('link', { name: /Previous/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title);

  await page.goto('/#/my-learning');
  const row = page.getByRole('row', { name: new RegExp(lesson.title) });
  await expect(row).toContainText('0/5');
  await expect(row).toContainText('5/5');
});

test('table of contents scrolls to a section', async ({ page }) => {
  await page.goto('/#/lesson/rag-foundations');
  const toc = isNarrow(page) || page.viewportSize().width < 1200
    ? page.locator('details.show-below-xl')
    : page.getByRole('complementary', { name: 'On this page' });
  if (await toc.evaluate(el => el.tagName === 'DETAILS')) await toc.locator('summary').click();
  await toc.getByRole('link', { name: 'Practice exercise' }).click();
  await expect(page.getByRole('heading', { name: 'Practice exercise' })).toBeInViewport();
  await expect(page).toHaveURL(/#\/lesson\/rag-foundations$/);
});

test('progress, bookmarks and theme persist across reloads', async ({ page }) => {
  await page.goto('/#/lesson/what-is-ai');
  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await expect(page.getByRole('button', { name: 'Completed' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.lesson-actions').getByRole('button', { name: /Bookmark/ }).click();

  await page.goto('/#/questions?q=precision');
  await page.locator('.qa').first().locator('summary').click();
  await page.locator('.qa').first().getByRole('button', { name: /Bookmark/ }).click();

  const toggle = page.getByRole('button', { name: /Switch to (dark|light) mode/ });
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await toggle.click();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(after).not.toBe(before);

  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(after);
  await page.goto('/#/my-learning');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My learning');
  await expect(page.locator('#ml-done + .link-list, #ml-done ~ .link-list')).toContainText('What is AI?');
  await expect(page.locator('.lesson-card', { hasText: 'What is AI?' })).toBeVisible();
  await expect(page.locator('.qa')).toHaveCount(1);

  await page.goto('/#/paths/beginner');
  await expect(page.getByText(`1 of ${curriculum.paths.find(p => p.id === 'beginner').lessons.length} lessons completed`)).toBeVisible();

  await page.goto('/#/my-learning');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Reset my progress' }).click();
  await expect(page.getByText('No completed lessons yet')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No bookmarks yet')).toBeVisible();
});

test('projects list and detail', async ({ page }) => {
  await page.goto('/#/projects');
  await expect(page.locator('.project-card')).toHaveCount(curriculum.projects.length);
  await page.getByRole('link', { name: curriculum.projects[0].title }).click();
  for (const h of ['Requirements', 'Implementation steps', 'Success criteria']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
});

test('unknown routes and failed content loads show clear states', async ({ page }) => {
  await page.goto('/#/lesson/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  let fail = true;
  await page.route('**/content/curriculum.json', route => (fail ? route.fulfill({ status: 500, body: 'error' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('We could not load the lessons');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn AI');
});

test('malformed and extra route segments show a recoverable not-found page', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/lesson/%E0%A4%A', '/library/extra', '/lesson/what-is-ai/extra', '/my-learning/extra']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  }
  await page.getByRole('link', { name: 'AI Learning Hub home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn AI');
  expect(errors).toEqual([]);
});

test('pending searches cannot replace the route after navigation', async ({ page }) => {
  await page.clock.install();
  for (const route of ['/library', '/questions', '/search']) {
    await page.goto(`/#${route}`);
    await page.locator('.filters input[type="search"]').fill('embeddings');
    await page.evaluate(() => { location.hash = '#/paths'; });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learning paths');
    await page.clock.runFor(300);
    await expect(page).toHaveURL(/#\/paths$/);
    await expect(page).toHaveTitle('Learning paths · AI Learning Hub');
  }
});

test('removing bookmarks updates My learning immediately', async ({ page }) => {
  await page.goto('/#/lesson/what-is-ai');
  await page.locator('.lesson-actions [data-bookmark]').click();
  await page.goto('/#/questions');
  await page.locator('.qa').first().locator('summary').click();
  await page.locator('.qa').first().getByRole('button', { name: /Bookmark/ }).click();
  await page.goto('/#/my-learning');
  const count = page.locator('.stats-cards div').filter({ has: page.getByText('Bookmarks', { exact: true }) }).locator('dd');
  await expect(count).toHaveText('2');
  await page.locator('.lesson-card [data-bookmark]').click();
  await expect(page.locator('.lesson-card')).toHaveCount(0);
  await expect(count).toHaveText('1');
  await page.locator('.qa summary').click();
  await page.locator('.qa [data-bookmark]').click();
  await expect(page.getByText('No bookmarks yet')).toBeVisible();
  await expect(count).toHaveText('0');
  await page.reload();
  await expect(page.getByText('No bookmarks yet')).toBeVisible();
});

test('damaged saved data does not prevent learning or saving new progress', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('ai-learning-hub:v1', JSON.stringify({
      completed: { 'what-is-ai': '2026-10-01T00:00:00.000Z', 'llm-basics': 42 },
      bookmarks: [null, { type: 'lesson', id: 'what-is-ai', at: '2026-10-01T00:00:00.000Z' }],
      quizzes: { 'what-is-ai': { score: '<img>', total: 0, at: null } }
    }));
    sessionStorage.setItem('seeded', 'true');
  });
  await page.goto('/#/my-learning');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My learning');
  await expect(page.locator('.lesson-card')).toHaveCount(1);
  await expect(page.getByText('No quiz results yet')).toBeVisible();
  await page.goto('/#/lesson/llm-basics');
  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('invalid JSON and null storage fields recover without a storage warning', async ({ page }) => {
  await page.goto('/');
  for (const raw of ['{invalid', '{"completed":null,"bookmarks":{},"quizzes":[]}']) {
    await page.evaluate(value => localStorage.setItem('ai-learning-hub:v1', value), raw);
    await page.goto('/#/my-learning');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('My learning');
    await expect(page.getByText('No completed lessons yet')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
});

test('role groups have unique IDs and keep repeated bookmark controls in sync', async ({ page }) => {
  await page.goto('/#/questions?group=role');
  const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
  expect(new Set(ids).size).toBe(ids.length);
  const shared = curriculum.lessons.find(lesson => lesson.roles.length > 1).questions[0];
  const buttons = page.locator(`[data-bookmark][data-id="${shared.id}"]`);
  expect(await buttons.count()).toBeGreaterThan(1);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await buttons.first().click();
  for (const button of await buttons.all()) await expect(button).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard users can skip to content and see focus', async ({ page }) => {
  await page.goto('/#/library');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await expect(page).toHaveURL(/#\/library$/);
});

test('layout does not overflow horizontally', async ({ page }) => {
  for (const route of ['/', '/#/library', '/#/lesson/api-basics', '/#/questions', '/#/paths/engineer', '/#/projects/knowledge-base', '/#/my-learning']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow on ${route}`).toBeLessThanOrEqual(0);
  }
});

test('mobile menu opens and closes', async ({ page }) => {
  test.skip(!isNarrow(page), 'menu button only on narrow screens');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
});

test('every published lesson renders its content and quiz without browser errors', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const lesson of curriculum.lessons) {
    await page.goto(`/#/lesson/${lesson.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(lesson.title);
    await expect(page.locator('.quiz-q')).toHaveCount(5);
    await expect(page.locator('.sources a')).toHaveCount(lesson.sources.length);
  }
  expect(errors).toEqual([]);
});

test('interview topic includes the published workshop and interview question link', async ({ page }) => {
  await page.goto('/');
  await page.locator('.category-card').getByRole('link', { name: 'Interview preparation' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Interview preparation');
  await expect(page.getByRole('link', { name: 'Role-based mock interviews', exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Browse interview questions/ }).click();
  await expect(page.locator('.qa')).toHaveCount(curriculum.lessons.flatMap(l => l.questions).filter(q => q.type === 'Interview').length);
});

test('production bundle works under a nested static hosting path', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const dist = new URL('../dist/', import.meta.url);
  await page.route('**/release-check/**', async route => {
    const relative = new URL(route.request().url()).pathname.slice('/release-check/'.length) || 'index.html';
    const file = new URL(relative, dist);
    if (!file.href.startsWith(dist.href)) return route.abort();
    await route.fulfill({ path: fileURLToPath(file) });
  });
  await page.goto('/release-check/#/lesson/first-mcp-server');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Build your first MCP server');
  await expect(page.locator('.quiz-q')).toHaveCount(5);
  await expect(page.locator('.code-block')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('lesson.png'), fullPage: true });
  await page.getByRole('link', { name: 'AI Learning Hub home' }).click();
  await expect(page.locator('.stats').first()).toContainText('285');
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await page.screenshot({ path: testInfo.outputPath('home-dark.png'), fullPage: true });
  expect(errors).toEqual([]);
});
