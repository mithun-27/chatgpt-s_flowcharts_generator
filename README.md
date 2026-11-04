---
title: "ChatGPT's Flowcharts Generator"
emoji: "🧭"
colorFrom: "blue"
colorTo: "violet"
sdk: static
pinned: false
short_description: "Turn screenshots, text, or Mermaid into editable flowcharts."
---

<p align="center">
  <a href="https://github.com/mithun-27/chatgpt-s_flowcharts_generator"><img src="https://img.shields.io/github/repo-size/mithun-27/chatgpt-s_flowcharts_generator?color=blue&style=flat-square" alt="Repo size"></a>
  <a href="https://github.com/mithun-27/chatgpt-s_flowcharts_generator/commits/main"><img src="https://img.shields.io/github/last-commit/mithun-27/chatgpt-s_flowcharts_generator?color=violet&style=flat-square" alt="Last commit"></a>
  <a href="https://mithun-2714-chatgpt-flowcharts-generator.static.hf.space/"><img src="https://img.shields.io/badge/live%20demo-huggingface%20spaces-blueviolet?style=flat-square" alt="Live demo"></a>
  <a href="https://github.com/mithun-27/chatgpt-s_flowcharts_generator/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mithun-27/chatgpt-s_flowcharts_generator?color=green&style=flat-square" alt="License"></a>
</p>

# 🧭 ChatGPT's Flowcharts Generator

> A browser-only flowchart workspace. Turn a screenshot, text, ChatGPT answers, ASCII diagrams, Mermaid, or technical docs into clean, **editable** flowcharts — then export as PNG, SVG, PDF, Mermaid, or JSON. No backend, no database, no account required.

A **hybrid AI intelligence layer** classifies your input, extracts intent and structure, validates the graph, repairs structural gaps, and lays it out professionally with ELK.js. A Hugging Face model (or any OpenAI-compatible endpoint) is optional and adds deeper interpretation for ambiguous wording.

![Support ticket triage sample](public/samples/support-ticket-flow.png)

---

## ✨ Features

### Input understanding
| Feature | What it does |
|---|---|
| 🔍 **Auto-detect input type** | Natural language, ChatGPT responses, numbered steps, ASCII diagrams, Mermaid, technical documentation, agentic workflows, software architecture, and business processes — classified with confidence scores |
| 🖼️ **Screenshot reconstruction** | Upload or paste PNG/JPG/JPEG/WEBP; local OCR + geometry reading order rebuilds editable nodes and edges (vision model optional with a token) |
| 🤖 **Hybrid understanding** | Extracts objective, problem, actors, systems, inputs, outputs, outcome, steps, conditions, decisions, branches, loops, and dependencies — explicit vs. inferred steps marked separately |

### Graph intelligence
| Feature | What it does |
|---|---|
| 🧠 **Semantic shapes** | start/end, process, decision, input/output, document, connector — chosen from graph role & context, not isolated keywords |
| 🔗 **Graph algorithms** | Topological sort, cycle detection, reachability, connected components, quality scoring, bounded structural repair; intentional loops preserved |
| 📐 **ELK layout** | ELK.js preferred (TB, LR, BT, RL), Dagre fallback — the LLM never computes coordinates |
| ✅ **Validate & repair** | Unreachable nodes, dead ends, duplicates, missing Yes/No labels — bounded, safe fixes only; never invents business steps |

### Editor & assistant
| Feature | What it does |
|---|---|
| 🎨 **Full editor** | Add, delete, rename, drag, connect nodes; 6 shapes × 6 colors; zoom, pan, fit-to-view; undo/redo |
| 💬 **Graph-aware assistant** | 12 quick actions: direction, detail, missing steps/dependencies, exception handling, agent architecture, parallel execution, alternatives, simplify, explain |
| 👀 **Preview before apply** | Every edit staged with **Apply / Discard** — nothing changes until you accept |
| 📊 **Quality feedback** | Detected input type, confidence, assumptions, warnings, open questions, graph-quality score |
| 📤 **Exports** | PNG, SVG, PDF, Mermaid, JSON — exports use only the diagram, never the uploaded screenshot |
| 🌗 **Theme** | Light/dark mode, responsive, keyboard shortcuts |

---

## 🚀 Live Demo

| Platform | Link |
|---|---|
| Hugging Face Spaces | <https://mithun-2714-chatgpt-flowcharts-generator.static.hf.space> |

No sign-up needed. Works offline after the page loads.

---

## 🛠️ Tech stack

| Layer | Tech |
|---|---|
| Framework | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Editor | React Flow (`@xyflow/react`) |
| Layout | ELK.js (`elkjs`) preferred, Dagre (`@dagrejs/dagre`) fallback |
| OCR | Tesseract.js (lazy-loaded) |
| Diagrams | Mermaid (lazy-loaded) |
| Export | `html-to-image` + `jsPDF` (lazy-loaded) |
| Icons | Lucide React |
| AI | Hugging Face Inference Providers, or any OpenAI-compatible endpoint |

---

## 💻 Run locally

```bash
# 1. Clone
git clone https://github.com/mithun-27/chatgpt-s_flowcharts_generator.git
cd chatgpt-s_flowcharts_generator

# 2. Install
npm install

# 3. Develop
npm run dev        # http://localhost:5173

# 4. Production build
npm run build      # type-check + build into dist/
npm run preview    # serve production build locally
```

Requires **Node.js 20+** and npm. Works fully in demo mode — no token needed.

---

## 🧪 Demo mode vs AI mode

| Feature | Demo mode (no token) | With Hugging Face token |
|---|---|---|
| Text → diagram | Local intelligence engine | AI structuring + local validation |
| Screenshot → diagram | Local OCR + geometry | Vision model with OCR hint |
| Graph validate/repair/layout | ✅ Yes | ✅ Yes |
| Assistant quick actions | ✅ Local only | Local + custom AI instructions |
| Editor + exports | ✅ Yes | ✅ Yes |

Your token stays in **React state for the current tab only** — never written to `localStorage`, the build, or this repo.

---

## 🤖 Optional AI setup

Get a fine-grained token:  
<https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained>

Paste it in the app's **Demo mode** header button → save.

### Default models
- Text/reasoning: `openai/gpt-oss-20b`
- Vision: `Qwen/Qwen3-VL-30B-A3B-Instruct`

Both editable under **AI settings → Model settings**. Point the layer at any OpenAI-compatible base URL if preferred.

### Local dev (without committing a token)
```bash
VITE_AI_PROVIDER=huggingface
VITE_AI_TOKEN=hf_...
VITE_AI_BASE_URL=            # optional OpenAI-compatible base URL
VITE_TEXT_MODEL=openai/gpt-oss-20b
VITE_VISION_MODEL=Qwen/Qwen3-VL-30B-A3B-Instruct
```

> ⚠️ Never commit `.env` files or tokens.

---

## 📊 How the hybrid pipeline works

1. **Classify** — multi-signal input detection (natural language, ChatGPT, numbered steps, ASCII, Mermaid, screenshot/OCR, technical doc, agent workflow, architecture, business process). Highest signal score wins; confidence shown.
2. **Understand** — deterministic narrative parsing: objective, actors, systems, I/O, conditions, yes/no branches, loops, parallel markers, explicit vs. inferred steps.
3. **Normalize & refine** — shapes from graph role/context, not keywords. Payment checks, eligibility branches, retries, merges handled distinctly.
4. **Validate & repair** — topological order, cycles, reachability, components, unlabeled branches, dead ends. Bounded structural fixes only.
5. **Lay out** — ELK.js (Dagre fallback), then surface assumptions, warnings, questions, and quality score beside the canvas.

---

## 📈 Evaluation

`npm run test:eval` runs a **10-category reference corpus** and reports measurable metrics instead of relying on "looks right" screenshots.

| Metric | Result |
|---|---|
| Cases | 10/10 (100%) pass |
| Classification (top-1) | 100% |
| Node recall | 98% |
| Node precision | 99% (reference-based) |
| Decision recall | 100% |
| Branch-label recall | 100% |
| Relationship recall | 100% |
| Cycle accuracy | 100% |
| Avg graph quality | 100% |

These numbers are measured against the small reference corpus in `scripts/evalCorpus.ts` — they are **not** a claim of universal 100% accuracy on arbitrary text, and AI-mode output is not covered by this deterministic run.

---

## 📁 Project structure

```
src/
  components/   Header, input tabs, editor, toolbar, dialogs, assistant
  editor/       ELK layout + Dagre fallback, node theme, undo/redo reducer
  intelligence/ classification, NLP, understanding, shapes, graph engine,
                assistant edits, pipeline
  services/     Hugging Face client, AI/vision calls, OCR reconstruction,
                exporters, Mermaid preview
  types/        Diagram and AI settings types
  utils/        Diagram model, local parsers, Mermaid parser/generator, files
public/samples/ Sample screenshot used by the no-token demo
scripts/        Sample generator, parser tests, 10-category evaluation corpus
```

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Y` | Redo |
| `Delete` / `Backspace` | Delete selected nodes & edges |
| `Ctrl+V` | Paste an image (Upload tab) |
| Double-click a node | Rename it |
| `Enter` / `Escape` while renaming | Save / cancel label |

---

## ⚠️ Limitations

- The local engine is deterministic & heuristic — ambiguous prose or unusual domain vocabulary may need AI mode or manual editing. Evaluation numbers are reference-based, not universal accuracy.
- Local OCR depends on image quality & browser OCR support. Hand-drawn diagrams may need corrections; a vision model is optional.
- Live AI/vision calls require a token. Without one, the app falls back to the local engine.
- Mermaid support covers nodes, shapes, chained edges, and edge labels. Unsupported types are rejected rather than rendered incorrectly.
- Export fidelity is best in Chromium-based browsers (DOM-to-image conversion).

---

## 🔒 Privacy

- No analytics, cookies, tracking scripts, or backend storage.
- Screenshots & prompts go to Hugging Face **only** when you explicitly run an AI action with a token.
- Token lives in memory for the current tab only.
- Theme preference is the only value saved in `localStorage`.

---

## 📦 Deploy as Hugging Face Static Space

This project has **no Dockerfile, backend, auth, or database**.

```bash
npm install
npm run build
```

1. Create a new **Static** Space on Hugging Face.
2. Copy the **contents** of `dist/` (not the folder) into a clone of the Space repo.
3. Add a Space `README.md` with `sdk: static` front matter (this file's YAML block is a valid starting point).
4. Commit & push. HF serves `index.html` from the repo root.

`vite.config.ts` sets `base: './'`, so it works from a sub-path too.

> Don't commit tokens or `.env` files.

---

## 📄 License

MIT — free to use for learning and portfolio projects.

<p align="center">
  <a href="https://github.com/mithun-27/chatgpt-s_flowcharts_generator">Source</a> · 
  <a href="https://mithun-2714-chatgpt-flowcharts-generator.static.hf.space/">Live Demo</a>
</p>