# Dianzi Opening Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Astro opening page for Dianzi that turns the approved paper-back storyboard into an interactive animated first screen.

**Architecture:** Add a self-contained `DianziOpening` Astro component, a dedicated GSAP lifecycle script, and a route at `/dianzi`. Use local raster assets derived from the supplied reference board and generated/provided image assets only; no new image generation is required. Keep the final state intentionally unfinished: core mark first, text light and delayed.

**Tech Stack:** Astro 6, TypeScript, GSAP, existing `Base` layout/font pipeline, Sharp for local asset preparation, Playwright or local screenshot capture for QA.

## Global Constraints

- Do not generate new images during this implementation.
- Preserve existing unrelated working tree changes.
- Use the approved storyboard at `docs/superpowers/specs/2026-06-25-dianzi-opening-animation-design.md` as the motion source of truth.
- Use the user's provided brand board image at `C:/Users/26296/AppData/Local/Temp/codex-clipboard-40ed2906-fb01-44bc-9853-f8306842a926.png` as visual reference.
- Final state must feel unfinished, not like a closed brand bumper.
- Avoid AI visual cliches: robots, chips, blue sci-fi dashboards, holograms, generic data streams.

---

### Task 1: Prepare Local Assets

**Files:**
- Create: `public/images/dianzi/reference-board.png`
- Create: `public/images/dianzi/wordmark-source.png`
- Create: `public/images/dianzi/paper-back-hand.png`

**Interfaces:**
- Produces: static image URLs `/images/dianzi/reference-board.png`, `/images/dianzi/wordmark-source.png`, `/images/dianzi/paper-back-hand.png`.

- [ ] **Step 1: Create the asset folder**

Run: `New-Item -ItemType Directory -Force public\images\dianzi`

Expected: directory exists.

- [ ] **Step 2: Copy the supplied brand board**

Run: `Copy-Item 'C:\Users\26296\AppData\Local\Temp\codex-clipboard-40ed2906-fb01-44bc-9853-f8306842a926.png' public\images\dianzi\reference-board.png -Force`

Expected: `public/images/dianzi/reference-board.png` exists.

- [ ] **Step 3: Crop the brand wordmark source**

Run a Node/Sharp script that extracts the top logo area from the supplied board:

```js
import sharp from 'sharp';

const input = 'C:/Users/26296/AppData/Local/Temp/codex-clipboard-40ed2906-fb01-44bc-9853-f8306842a926.png';

await sharp(input)
  .extract({ left: 340, top: 76, width: 540, height: 270 })
  .resize({ width: 540 })
  .png()
  .toFile('public/images/dianzi/wordmark-source.png');
```

Expected: `wordmark-source.png` contains the reference logo area.

- [ ] **Step 4: Reuse the already generated hand/brush asset when available**

Find the most recent generated PNG under `C:\Users\26296\.codex\generated_images\019efe5b-eb86-7d20-aef2-d32d7686876a`. If present, copy it to `public/images/dianzi/paper-back-hand.png`.

Expected: `paper-back-hand.png` exists.

- [ ] **Step 5: If the generated asset is missing, use the supplied board only and continue without a hand image**

The component must still render with paper, shadow, brush proxy, dot, fragments, and logo structure. This fallback keeps implementation unblocked without generating new images.

### Task 2: Add the Astro Opening Component

**Files:**
- Create: `src/components/dianzi/DianziOpening.astro`

**Interfaces:**
- Produces: markup for `#dianzi-opening` and child elements consumed by `src/scripts/dianzi-opening.ts`.

- [ ] **Step 1: Create a component with semantic full-screen structure**

The component must include:

- paper-back scene layer
- hand/brush visual layer
- implant dot
- collapse rings
- fragment layer with repeated fragment elements
- perspective stage
- unfinished logo mark
- delayed copy and controls

- [ ] **Step 2: Scope all styles inside the component**

Use component-scoped CSS for paper texture, responsive layout, layers, mark geometry, text sizing, and controls. Do not edit `src/styles/global.css`.

- [ ] **Step 3: Add accessible controls**

Include:

- primary link: "继续这个点子" pointing to `/ideas`
- secondary link: "看看它如何发生" pointing to `/about`
- replay button with `data-dianzi-replay`

### Task 3: Add the GSAP Animation Script

**Files:**
- Create: `src/scripts/dianzi-opening.ts`

**Interfaces:**
- Consumes: `#dianzi-opening`, `.dianzi-*` selectors from the component.
- Produces: replayable GSAP timeline initialized through `registerLifecycle`.

- [ ] **Step 1: Create a lifecycle-safe animation module**

Use:

```ts
import { gsap, mm } from './gsap-setup';
import { registerLifecycle } from './with-lifecycle';
```

The module must register on page load and clean up its event listeners/timeline.

- [ ] **Step 2: Implement the timeline phases**

Timeline phases:

- paper-back stillness
- brush descent
- implant hold
- spatial collapse
- fragment break
- perspective flip
- reorganization
- unfinished final reveal

- [ ] **Step 3: Respect reduced motion**

If `prefers-reduced-motion: reduce`, skip the cinematic sequence and immediately show the unfinished final state.

- [ ] **Step 4: Wire replay**

`[data-dianzi-replay]` restarts the timeline.

### Task 4: Add the Route

**Files:**
- Create: `src/pages/dianzi.astro`

**Interfaces:**
- Produces: `/dianzi`.

- [ ] **Step 1: Use the existing Base layout**

Render with `hideNav`, `hideFooter`, `theme="dianzi"`, title `点子 DIANZI`, and the opening component.

- [ ] **Step 2: Import the animation script**

Inside the page, import `../scripts/dianzi-opening`.

### Task 5: Verify Build and Visual QA

**Files:**
- Create or update: `design-qa.md`
- Capture: `output/playwright/dianzi-opening.png` if browser capture is available.

**Interfaces:**
- Produces: Product Design QA report with `final result: passed` or `final result: blocked`.

- [ ] **Step 1: Run TypeScript/build verification**

Run: `npm run build`

Expected: build succeeds, or report the concrete blocker.

- [ ] **Step 2: Start the local dev server**

Run: `npm run dev -- --host 127.0.0.1`

Expected: local URL is available.

- [ ] **Step 3: Capture `/dianzi`**

Use the available browser path. If Playwright is needed and no browser skill is available, use the local Playwright dependency because this is the project QA phase.

- [ ] **Step 4: Write Product Design QA**

Compare the source reference board, storyboard spec, and implementation screenshot. Save `design-qa.md` with:

- source visual truth path
- implementation screenshot path
- viewport
- state
- findings
- final result

- [ ] **Step 5: Fix P0/P1/P2 issues**

If QA finds blocking issues, patch the component/script and repeat build/capture.
