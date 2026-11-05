# AI Learning Hub

A responsive learning site for AI: structured tutorials, learning paths, practice projects, and searchable questions with answers. It serves beginners, software developers, and technical managers.

**🌐 Live site:** https://ashokrana25.github.io/ai-beginner-handbook-assistant/

- **57 published tutorials** across the curriculum, each with objectives, examples, practice, sources, and a quiz
- **285 distinct questions** with answers (conceptual, practical, scenario-based, interview)
- **16 topic categories**, with all 37 previously planned lessons now published
- 4 learning paths, 4 practice projects, search, filters, quizzes, bookmarks, progress tracking
- Light and dark modes, keyboard accessible, and responsive from phone to desktop

## Stack

| Concern | Choice |
| --- | --- |
| Build / dev server | [Vite](https://vite.dev/) |
| UI | Plain JavaScript modules and CSS (no framework) |
| Icons | [lucide](https://lucide.dev/) (only the icons in use are imported) |
| Content | JSON files in `content/`, validated and bundled by `scripts/build-content.mjs` |
| Persistence | `localStorage` in the browser (no login, no server) |
| Tests | [Playwright](https://playwright.dev/) on desktop, tablet, and mobile viewports |

The site is fully static, so the `dist/` folder can be hosted on any static host.

## Run it

Requires Node.js 20.19+ in the 20.x line, or Node.js 22.12+ (Node.js 24 is used in CI). The runnable examples also need Python 3. In the handbook assistant repository, first run `cd tutorial-site`; this website has its own dependencies and runs independently of the Python assistant.

```bash
npm ci
npm run dev          # validates content, then starts http://localhost:5173
npm run build        # validates content, then builds to dist/
npm run preview      # serves dist/ at http://localhost:4173
```

## Verify it

```bash
npx playwright install chromium   # first time only
npm test                          # builds, serves, and runs the end-to-end tests
npm run check:examples            # runs lesson code examples and compares their output
```

The end-to-end tests cover every published lesson, navigation, breadcrumbs, previous/next links, the table of contents, library and global search, filters, empty and error states, quizzes, bookmarks, progress and theme persistence, the mobile menu, and horizontal overflow at three viewport sizes. Regression checks cover malformed links, searches pending during navigation, damaged stored data, immediate bookmark removal, and unique identifiers in repeated role groups.

Ten dependency-free Python/Node examples have expected-output checks. The optional Chroma, MCP, Langfuse, and Docker integration labs include setup instructions and are labeled separately; they require their own environments or services and are not claimed as live-verified by the offline checks. All lesson code is available in `content/examples/` as well as on the tutorial pages. No paid model API is needed to run this website.

## Build and publish

The Vite build uses relative asset URLs, so `dist/` can be served at a domain root or a nested path. Serve the directory over HTTP(S), preserving `assets/` and `content/`; do not open `index.html` with a `file:` URL. Hash routes work without server-side rewrite rules.

The containing repository includes `.github/workflows/tutorial-site.yml`. It installs locked dependencies, validates generated content, runs the examples and browser tests, and uploads a production build for changes to `tutorial-site/`. A manual workflow run can also deploy the tested bundle to GitHub Pages when the repository has Pages configured to use GitHub Actions and its plan supports Pages. Select the `deploy_pages` option for that run. A repository push alone does not enable hosting or change repository visibility.

## Project layout

```
content/
  site.json             categories (with planned lessons), learning paths, practice projects
  lessons/<id>.json     one file per tutorial
  examples/             code shown in lessons, kept as real files so they can be run
scripts/
  build-content.mjs     validates content and writes public/content/curriculum.json
  check-examples.mjs    runs examples that declare an expected output
src/
  main.js               app shell, hash router, global event handling
  data.js               content loading, lookups, search
  store.js              local progress, bookmarks, quiz results, theme
  components.js         shared UI pieces (cards, bookmarks, Q&A items)
  views/                one module per page
  styles.css
tests/site.spec.js      Playwright tests
```

`public/content/curriculum.json` is generated. Don't edit it by hand.

## Add a tutorial

1. Create `content/lessons/<id>.json`. The file name must match `id`.
2. If it replaces a planned lesson, remove that title from the category's `planned` list in `content/site.json`.
3. Add the lesson id to at least one appropriate learning path in `content/site.json`. The paths also set the **Role** used to filter questions.
4. Run `npm run content`. It lists any validation errors with the file and field.

```json
{
  "id": "vector-databases",
  "category": "rag",
  "order": 3,
  "title": "Vector databases in practice",
  "description": "One sentence shown on cards and in search results.",
  "level": "Intermediate",
  "minutes": 14,
  "prerequisites": "RAG foundations.",
  "objectives": ["First objective", "Second objective"],
  "explanation": ["Paragraph one.", "Paragraph two."],
  "terms": [{ "term": "Index", "definition": "..." }],
  "example": "A concrete, practical scenario.",
  "code": [
    {
      "title": "Shown above the code",
      "language": "python",
      "file": "my_example.py",
      "run": "python",
      "expectedOutput": "exact stdout",
      "note": "Optional note shown under the code."
    }
  ],
  "mistakes": ["A common mistake or limitation."],
  "exercise": "A short practice task.",
  "questions": [
    {
      "id": "vector-databases-1",
      "type": "Conceptual",
      "question": "...?",
      "answer": "The correct answer with its explanation.",
      "distractor": "A plausible wrong answer."
    }
  ],
  "sources": [{ "title": "Official documentation page", "url": "https://..." }],
  "reviewed": "2026-10-28"
}
```

The validation rules are:

- `category` must be an `id` from `site.json`. `level` must be `Beginner`, `Intermediate`, or `Advanced`.
- Category, path, project, lesson, and question ids must be lowercase slugs. Site records need unique ids, valid lesson references, and complete metadata. Review dates must be real calendar dates.
- Every lesson needs exactly **five** questions. `type` must be `Conceptual`, `Practical`, `Scenario-based`, or `Interview`. Question ids and texts must be unique across the site.
- Each question's `answer` is used both as the correct quiz option and as the Q&A answer. The `distractor` is the wrong quiz option.
- `sources` must use `https` URLs. Cite official documentation for technical claims, and open each link before publishing.
- `code` is optional. `file` must be a filename within `content/examples/`. Supply `run` (`python` or `node`) and `expectedOutput` together only for examples that run on their own. Those examples then show an "Output checked" note and are executed by `npm run check:examples`. Don't describe code as tested unless it has been.
- Update `reviewed` whenever you re-check a lesson against its sources.

## Security notes

- The site makes no model or API calls and holds no secrets. The API lesson shows the recommended pattern: the browser calls your own server, and the server reads the provider key from an environment variable (`MODEL_API_KEY`). Never put keys in `VITE_*` variables or other front-end code; Vite embeds those in the public bundle.
- All content is escaped before rendering. Search terms are escaped before highlighting.
- `.env*` files are git-ignored.
