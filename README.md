---
title: "ChatGPT's Flowcharts Generator"
emoji: "🧭"
colorFrom: "blue"
colorTo: "violet"
sdk: static
pinned: false
short_description: "Turn screenshots, text, or Mermaid into editable flowcharts."
---

# ChatGPT's Flowcharts Generator

A browser-only flowchart workspace for students and makers. Turn a screenshot,
a rough workflow description, ChatGPT answer, ASCII diagram, Mermaid code, or
technical documentation into a clean, editable diagram, then export it as PNG,
SVG, PDF, Mermaid, or JSON.

The app is a **static React build with no backend**. Demo mode works offline
once the page is loaded and needs no account, API key, database, or paid
hardware. A hybrid intelligence layer classifies the input, extracts intent and
structure, validates the graph, repairs safe structural gaps, and lays it out
with ELK. A Hugging Face model (or any OpenAI-compatible endpoint) is optional
and adds deeper interpretation for ambiguous wording.

![Support ticket triage sample](public/samples/support-ticket-flow.png)

## Features

- **Screenshot reconstruction** — upload or paste a PNG/JPG/JPEG/WEBP file
  (drag and drop or `Ctrl+V`) and reconstruct editable nodes and edges. Local
  OCR plus geometry reading order works without credentials; a vision-language
  model is used when a token is configured. The screenshot is never used as the
  exported result.
- **Any text input** — automatic detection of natural language, ChatGPT
  responses, numbered steps, ASCII diagrams, Mermaid, technical documentation,
  agentic workflows, software architecture, and business processes.
- **Hybrid understanding** — extracts objective, problem, actors, systems,
  inputs, outputs, outcome, steps, conditions, decisions, branches, loops, and
  dependencies. Important terms are preserved and inferred steps are marked
  separately from explicit ones.
- **Graph intelligence** — topological ordering, cycle detection, reachability,
  connected components, quality scoring, and bounded structural repair. Intentional
  loops are preserved.
- **Semantic shapes** — start/end, process, decision, input/output, document, and
  connector are chosen from graph role and context, not isolated keywords.
- **Describe a process** — the local engine builds a starting diagram; with a
  token, an AI model can produce a more nuanced structure. The AI never computes
  coordinates.
- **Full editor** — add, delete, rename, drag, and connect nodes; six shapes;
  six colors; zoom, pan, fit-to-view, and automatic layout.
- **ELK layout** — ELK.js is preferred for professional routing, with Dagre as a
  fallback. Layout directions are top-to-bottom, left-to-right, bottom-to-top,
  and right-to-left.
- **Undo / redo** — `Ctrl+Z`, `Ctrl+Shift+Z`, and `Ctrl+Y`, with drag and label
  edits grouped into single history entries.
- **Mermaid workspace** — generate Mermaid from the canvas, edit it, preview it,
  copy/download `.mmd`, or apply it back as nodes.
- **Graph-aware assistant** — 12 quick actions cover direction, detail, missing
  steps/dependencies, exception handling, agent architecture, parallel execution,
  alternatives, simplify, and explain. Every graph edit is staged as a preview
  with **Apply** and **Discard**; nothing changes until you accept it. With a
  token, custom instructions and AI explanations are also available.
- **Visible quality feedback** — the editor shows detected input type, confidence,
  assumptions, warnings, open questions, and graph-quality notes.
- **Exports** — PNG, SVG, PDF, Mermaid, and JSON. Exports use only the diagram,
  never the uploaded screenshot.
- **Light/dark mode**, responsive layout, keyboard shortcuts, and a clean UI with
  no placeholder buttons.

## Tech stack

- React 19 + TypeScript + Vite
- Tailwind CSS
- React Flow (`@xyflow/react`) for the editor
- ELK.js (`elkjs`) as the preferred layout engine, with Dagre (`@dagrejs/dagre`)
  as a fallback
- Tesseract.js (lazy-loaded) for local OCR
- Mermaid (lazy-loaded) for Mermaid preview
- `html-to-image` + `jsPDF` (lazy-loaded) for image/PDF export
- Lucide React icons
- Hugging Face Inference Providers through the OpenAI-compatible router, or a
  configurable OpenAI-compatible base URL

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`).

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```

## Demo mode vs AI mode

Demo mode is the default and is fully usable:

| Feature | Demo mode | With a Hugging Face token |
| --- | --- | --- |
| Start from a sample diagram | Yes | Yes |
| Workflow text → diagram | Local intelligence engine | AI structuring, with local validation |
| Description → diagram | Local intelligence engine | AI generation or local engine |
| Screenshot → diagram | Local OCR + geometry reconstruction | Vision model, with OCR text as a hint |
| Graph validation, repair, layout | Yes | Yes |
| AI assistant | Local graph-aware actions | Custom modifications and AI explanations |
| Editor + exports | Yes | Yes |

The screenshot workflow works without credentials: local OCR reads the labels and
geometry reconstructs reading order. A vision model generally handles sketches,
icons, and low-contrast images better, but it is optional rather than required.

## Optional Hugging Face AI setup

1. Create a Hugging Face account and a **fine-grained access token** with
   permission to use Inference Providers:
   <https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained>
2. Open the app, click **Demo mode** in the header, paste the token, and save.
3. The token is kept in React state for the current tab only. It is never
   written to `localStorage`, `sessionStorage`, a cookie, the build output, or
   this repository. Refreshing or closing the tab clears it.
4. Inference usage may consume Hugging Face credits depending on your account.

Default models:

- Text/reasoning: `openai/gpt-oss-20b`
- Vision: `Qwen/Qwen3-VL-30B-A3B-Instruct`

Both are editable under **AI settings → Model settings**. Any chat-completions
model available through Hugging Face Inference Providers can be used. The app
calls `https://router.huggingface.co/v1/chat/completions` directly from the
browser; the router returns browser-friendly CORS headers.

The AI layer is provider-independent. You can point it at another
OpenAI-compatible endpoint by setting a base URL and model names in the settings
dialog. For local development, environment variables provide defaults without
committing a token:

```bash
VITE_AI_PROVIDER=huggingface
VITE_AI_TOKEN=hf_...
VITE_AI_BASE_URL=          # optional OpenAI-compatible base URL
VITE_TEXT_MODEL=openai/gpt-oss-20b
VITE_VISION_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct
```

Never commit `.env` files or tokens. The app itself keeps a pasted token in
memory only.

If a request fails, the UI explains common statuses (401 token, 402/403 credits
or permissions, 404 unavailable model, 429 rate limit, 5xx provider outage) and
suggests demo mode. Transient 408/425/429/5xx responses are retried up to three
times with backoff.

## Deploy as a Hugging Face Static Space

This project intentionally has no Dockerfile, backend, auth, or database. A
static Space only needs the built files at its repository root.

### Option A — upload the build manually

```bash
npm install
npm run build
```

1. Create a new **Static** Space on Hugging Face.
2. Copy the **contents** of `dist/` (not the folder itself) into a clone of the
   Space repository.
3. Add a Space `README.md` whose front matter includes `sdk: static` (the YAML
   block at the top of this file is a valid starting point).
4. Commit and push the Space repository. Hugging Face serves `index.html` from
   the repository root.

`vite.config.ts` sets `base: './'`, so the app also works when the Space is
served from a sub-path.

### Option B — push the full project to GitHub first

Keep this repository as the source of truth, then publish a build to the Space:

```bash
npm run build
cd dist
git init
git add .
git commit -m "Deploy static build"
git branch -M main
git remote add space https://huggingface.co/spaces/<username>/<space-name>
git push space main
```

Remember to include a `README.md` with the `sdk: static` metadata in the Space
repository. Do not commit a Hugging Face token or any `.env` file.

The GitHub source repository for this project is:
<https://github.com/mithun-27/chatgpt-s_flowcharts_generator>

## How screenshot reconstruction works

1. The image is validated (type and 10 MB limit), read in the browser, and
   downscaled to a maximum dimension before processing.
2. **Without a token**, Tesseract.js runs OCR locally in the browser. Word boxes
   are grouped into lines, a geometry pass infers reading order and possible
   connections, and the same hybrid intelligence pipeline rebuilds the graph.
   This needs network access the first time to download the OCR worker/language
   data; the image itself never leaves the browser.
3. **With a token**, a vision model receives a strict prompt that asks for JSON
   containing labels, shapes, colors, and directed edges — no coordinates. OCR
   text is passed in as a hint so the model does not have to re-read small labels.
4. The response is parsed defensively: invalid shapes/colors fall back to safe
   defaults, labels are cleaned, ids are remapped, duplicate/self edges are
   dropped, and node/edge counts are capped.
5. ELK lays out the result (Dagre fallback). React Flow renders new, fully
   editable nodes and edges. The source image is discarded and is never exported.

## How the hybrid pipeline works

1. **Classify** the input across natural language, ChatGPT response, numbered
   steps, ASCII, Mermaid, screenshot/OCR, technical documentation, agent
   workflow, architecture, and business process. Each signal votes; the highest
   score wins and the confidence is shown.
2. **Understand** the narrative deterministically: objective, actors, systems,
   inputs/outputs, conditions, yes/no branches, loops, parallel markers, and
   explicit versus inferred steps. If a token is configured, the AI layer can
   produce the semantic graph first.
3. **Normalize and refine** labels and shapes from graph role rather than
   isolated keywords. Payment checks, eligibility branches, retries, and merges
   are treated differently from ordinary process steps.
4. **Validate and repair** the directed graph: topological order, cycles,
   reachability, components, unlabeled branches, dead ends. Repairs are bounded
   and structural; the engine never invents business steps.
5. **Lay out** with ELK.js, then show assumptions, warnings, open questions, and
   a quality report next to the editable canvas.

## Evaluation

`npm run test:eval` runs a 10-category reference corpus and reports measurable
metrics instead of relying on screenshots that “look right”:

- Natural language, ChatGPT response, ASCII, screenshot/OCR text, Mermaid,
  numbered steps, technical documentation, agent workflow, software architecture,
  and business process.
- Node recall/precision, decision recall, branch-label recall, relationship
  recall, cycle accuracy, and average graph quality, using one-to-one semantic
  label matching on the local deterministic engine.

Current local result:

```text
cases                10
pass rate            10/10 (100%)
classification       100% (top-1)
node recall          98%
node precision       99% (reference-based)
decision recall      100%
branch-label recall  100%
relationship recall  100%
cycle accuracy       100%
avg graph quality    100%
```

These numbers are measured against the small reference corpus in
`scripts/evalCorpus.ts`. They are **not** a claim of universal 100% accuracy on
arbitrary text, and AI-mode output is not covered by this deterministic run.

## Project structure

```text
src/
  components/       Header, input tabs, editor, toolbar, dialogs, assistant
  editor/           ELK layout + Dagre fallback, node theme, undo/redo reducer
  intelligence/     classification, NLP, understanding, shapes, graph engine,
                    assistant edits, pipeline
  services/         Hugging Face client, AI/vision calls, OCR reconstruction,
                    exporters, Mermaid preview
  types/            Diagram and AI settings types
  utils/            Diagram model, local parsers, Mermaid parser/generator, files
public/samples/     Sample screenshot used by the no-token demo
scripts/            Sample generator, parser tests, 10-category evaluation corpus
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete selected nodes and edges |
| `Ctrl+V` | Paste an image while the Upload tab is active |
| Double-click a node | Rename it |
| `Enter` / `Escape` while renaming | Save / cancel the label |

## Limitations

- The local engine is deterministic and heuristic. It handles the reference
  corpus well, but ambiguous prose, unusual domain vocabulary, and implicit
  business rules can still need AI mode or manual editing. The evaluation numbers
  above are reference-based, not a universal accuracy claim.
- Local screenshot OCR depends on image quality and browser OCR support. The OCR
  worker/language data is fetched on first use, so it needs network access once;
  hand-drawn diagrams may need manual corrections. A vision model is optional and
  is not exercised by the local evaluation.
- Live AI and vision calls require a token and are not part of `npm run test:eval`.
  Without a token the app clearly falls back to the local engine rather than
  failing silently.
- The app supports a practical Mermaid flowchart subset (nodes, shapes, chained
  edges, and edge labels). Unsupported Mermaid diagram types are rejected with
  an error instead of being rendered incorrectly.
- Mermaid has no native document shape, so document nodes use flag notation when
  exported and are mapped back to the document shape when the app re-imports
  its own output.
- Export fidelity is best in Chromium-based browsers because PNG/SVG/PDF export
  uses DOM-to-image conversion.

## Privacy

- No analytics, cookies, tracking scripts, or backend storage.
- Uploaded screenshots and prompts are sent directly to Hugging Face only when
  you explicitly run an AI action with a token.
- The token exists in memory for the current tab only.
- Theme preference is the only value saved in `localStorage`.

## License

MIT — free to use for learning and portfolio projects.
