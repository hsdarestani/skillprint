# SKILLPRINT LIVE

**From interview impressions to observable, evidence-linked work samples.**

Sprint 0 vertical slice for the `SKILLPRINT LIVE — Entwickler-Pflichtenheft v1.0 (29.10.2026)`. This is a **working demonstrator**, not a validated employment assessment, certified AI system, or product suitable for real candidate information.

## Sprint 4 — natural-language arrival and internal phone dialogue

The advanced Hotel Front Desk Studio now supports **three distinct text conversations**: invoice guest Lena Weber, arriving guest Sofia Demir and Housekeeping on the internal phone. Sofia and Housekeeping have separate, event-based conversation histories and consistent fictional scenario facts. The model can respond in **German, Turkish or English**; an explicitly labeled deterministic fallback keeps the demo usable during model outages.

- **Candidate side:** in the **Check-in** or **Telefon** work area, type naturally and receive a context-specific reply. A maximum of six candidate messages is allowed per channel; back-to-back prompts before the corresponding reply are rejected.
- **Employer side:** both sides of these conversations are timestamped and visible in the Control Room timeline and evidence report, alongside existing operational actions.
- **Operational decisions are separate from AI dialogue:** hotel system buttons still explicitly confirm booking verification, phone handling, waiting-area offers and case completion. A language model does **not** convert a message into a scored action or make employment recommendations.
- **Backend:** `POST /api/sessions/:id/service-chat` accepts a candidate capability token and `channel: "arrival" | "phone"`, validated locale and free-text message; persists both candidate message and generated (or scripted fallback) reply and notifies subscribed observers. The standard `/action` endpoint refuses forged service replies.
- **Safety and costs:** all facts are synthetic; AI replies are bounded to room 311 not yet released, and no known completion time. Cloudflare Workers AI consumes quota and can incur charges. Per-IP throttling and per-session limits are demo controls, not enterprise-level identity or abuse protection.
- **Limits:** text-only roleplay, not an actual telephone call or automatic speech recognizer; the overall interface is German with three conversation languages. No real candidate data, formal hiring assessments or independent validation.

Run `npm test` and `node scripts/live-service-smoke.mjs` to validate the service conversation domain and published Worker.

## Sprint 3 — Front Desk Studio (interactive workspace)

The **advanced** Hotel Front Office scenario is now a single operational reception workspace, rather than a long sequence of stacked cards.

- A responsive stylized **Hotel Aurora reception desk** visualizes Lena Weber, Sofia Demir, the internal Housekeeping phone and the invoice terminal. Every status and work-area navigation control is derived from the real saved session events.
- Five interoperable work areas: **Gast**, **Check-in**, **Telefon**, **Rechnung**, **Abschluss**. Only the active area renders on mobile. The small fixed navigation supports touch and arrow-key switching.
- Candidate typed **chat, invoice amount and final handover drafts are kept in page memory while switching work areas or while live updates arrive**. The drafts are not persisted to the backend until the candidate submits the corresponding action, and are deliberately cleared when entering another session.
- Existing server-side sequencing, role tokens, evidence identifiers, deterministic scoring and optional multilingual AI chat remain intact.
- The observer's Control Room mirrors a compact, event-derived desk status (guest complaint, waiting arrival, ringing phone, invoice), never a recording of a candidate's private screen.
- The employer sees **no provisional numeric rubric** while the session is in progress, avoiding presentation of partial scores as candidate performance.
- The visual room and telephone are **illustrative UI**, not 3D rendering, telephony, voice, camera tracking, or real room-booking software. No validated suitability or automated hiring claims.

**Demo path:** Create **Live Multitasking Demo starten**, open the candidate link, converse with Lena, handle Sofia's arrival and Housekeeping call, correct the fictional 240 EUR bill, and send a written final response. Open the employer Control Room on another device to see evidence update in real time.

## Mobile assessment improvements (Sprint 2 QA)

- Mobile candidate UI has a compact persistent four-section navigator (guest, check-in, telephone, invoice) to avoid very long scrolling when interruptions arrive.
- Assessment completion progress now includes **all three service tracks**: 6 invoice-related actions, 4 check-in actions and 1 phone answer; optional risk actions never inflate completion.
- The initial hotel-task rubric only credits a **relevant clarifying question**, not generic acknowledgements such as "yes of course" or "no sorry". This is a conservative keyword-based demo rule, **not** scientifically validated automated language evaluation.
- In the Control Room, final demo numeric totals are withheld until the session ends, because partially filled scores were being mistaken for candidate ability. Human review remains required.

## Sprint 2 — Advanced Hotel Front Desk

Choose **Live Multitasking Demo starten** on the dashboard for an advanced session. The classic demo remains available for backward compatibility.

This advanced scenario introduces two **event-triggered interruptions** while the AI guest's invoice complaint is underway:

- After two candidate actions: Sofia Demir arrives with the synthetic booking `CK-311` and requests check-in. The room cannot be promised without confirming availability.
- After four candidate actions: a housekeeping phone call arrives. Answering it establishes that room 311 **has not been released** and there is no confirmed readiness time.
- The candidate can greet the guest, verify the booking, place/answer/ignore the call, offer a waiting area and a follow-up, and document the case. Risky choices such as promising an unready room are recorded rather than silently blocked.
- The original invoice complaint and free-text AI conversation continue in parallel. Submitting the final invoice reply is blocked until both service interruptions have been resolved.
- **The report contains two independent illustrative score sets**: original five invoice-related criteria and three additional multi-task criteria (check-in, phone handling, prioritization). Every criterion links to actual timestamped events. No model makes employment decisions.
- Arrivals are triggered by **actions**, not real-world wall-clock timers or a video/audio call. This first iteration demonstrates decision sequencing; it does **not** reproduce live time pressure or perform real check-ins. The phone is an interactive scripted call, not voice telephony.

Live Cloudflare validation: `scripts/live-multitask-smoke.mjs` runs after the Worker deployment using fictional demo events. For a stronger hiring pilot, recruit subject-matter reviewers to validate the scenarios and rubrics, and test the interface on Android, iPad and desktop.

## Sprint 1 — live multilingual guest conversation

The Hotel Front Office candidate can now ask **free-text questions** in German, Turkish or English. Messages are sent to a Cloudflare Worker Durable Object where a **bounded Workers AI** roleplays fictional hotel guest Lena Weber with fixed invoice facts. Both candidate messages and guest replies become timestamped events visible to the employer and available in the Evidence Report.

- `src/guest.js`: strict hotel facts, language instructions and deterministic scripted fallback if AI is offline, returns out-of-scope text or responds with restricted information.
- `worker/index.js`: role-protected `POST /api/sessions/:id/chat`; saves message and guest response as separate events and broadcasts live; max 12 candidate messages per session.
- `worker/wrangler.toml`: `[ai]` binding for Workers AI; basic Cloudflare location-based rate limit bindings for public session creation and AI messages. Limits are approximate; not enterprise anti-abuse protection.
- `.github/workflows/deploy-realtime-api.yml`: new push-to-main auto-deploy for Worker changes; runs a live smoke test after deploy.
- Candidate dialogue is free-text but the rest of the assessment still uses deterministic guided steps. AI does not generate scores, hiring recommendations, psychological assessments or candidate traits.
- These are **three conversation languages**, not yet a completely translated multilingual app or scientifically validated multilingual test.

**AI usage/cost:** Workers AI consumes AI quota and may incur usage charges under the linked Cloudflare account plan. Model calls only occur through the demo chat endpoint (never in a browser). The public demo is not appropriate for real applicant data or production hiring.

## What works now

- Responsive German employer dashboard with one-click Hotel Front Office demo.
- Candidate workflow: clarify complaint → verify guest identity → open invoice → compare line items → correct the 240 EUR bill to 220 EUR → document reply.
- Observer Control Room that mirrors the **assessment state**, not the applicant's private screen.
- Event timeline with timestamps, idempotent event IDs, role-specific visibility and observer notes.
- Deterministic weighted job-specific rubric with evidence IDs; 5 criteria from the PDF.
- Report with click-to-evidence details, human review gate, browser print-to-PDF.
- **Two execution modes**: automatic local preview across tabs of the same browser, and Cloudflare Durable Object realtime WebSocket sessions across devices when deployed.
- Responsive and accessibility-conscious styling (keyboard focus, reduced motion, semantic headings); comprehensive WCAG testing still outstanding.
- Automated engine tests and CI build workflow.

**Not implemented yet:** full synthetic voice customer (the current guest dialogue uses text and can fall back to scripted responses), identity verification of real individuals (the check is a simulation), cross-tenant management, real authentication/MFA, video/audio, actual multilingual scenario localization, independent assessment validity studies, automated ATS integrations, VR, legal/privacy clearance. These items are intentionally **not** simulated or advertised as live features.

## White-screen recovery for skillprint.pages.dev

The UI is a **Vite** project. If Cloudflare publishes the repository root or the `public/` directory instead of the built `dist/`, the HTML may load but the JavaScript app will fail. Do **not** use the `worker/wrangler.toml` file as the Pages framework configuration: it belongs to a **different Worker deployment**.

In the Cloudflare Pages project `skillprint`, verify:

- **Production branch**: `main`
- **Framework preset**: Vite or None (both can work with these explicit settings)
- **Root directory**: repository root (empty or `/`)
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Node version**: 22 (if a runtime version is explicitly selected)
- **Latest production deployment**: should use the current `main` commit

The app now has a static, dark startup screen: if a JavaScript entrypoint is missing or errors, it displays a diagnostic rather than an empty white page. A CI smoke check also verifies that generated HTML references real `dist/assets/*` files. The public demo Worker URL is also a fallback in `src/main.js`; an API environment variable is not required for this demo. The HTML loads CSS directly and JS uses browser-native ES modules if the repository root is published accidentally. The correct Pages build output is still `dist`.

If the project was originally deployed via **Direct Upload**, GitHub commits will not automatically redeploy it: build locally, upload the resulting `dist/` contents, or create a Git-connected Pages project.

## Local preview

Requires Node.js 20.19+ or 22+.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The default `public/config.js` has an empty API address, so the site runs in **local preview mode**. Create a session and copy the candidate link; open it in a second tab **in the same browser and origin**. Browser storage is used for demo-only event sync. This mode does **not** work across devices or browsers.

```sh
npm test
npm run build
```

## Enable true cross-device live sessions with Cloudflare

The website and the realtime API are **two separate deployments**. A Cloudflare Pages deployment by itself is only the static UI. Cross-device live sessions require the `skillprint-live-api` Worker plus its SQLite-backed Durable Object.

### Option A — GitHub Actions (easiest without a terminal)

1. In Cloudflare, find your **Account ID** and create a narrowly scoped API Token using the **Edit Cloudflare Workers** template. **Never paste the API token into code or chat.**
2. Go to GitHub repository **Settings → Secrets and variables → Actions → New repository secret**. Add these two secrets:
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare Account ID.
   - `CLOUDFLARE_API_TOKEN`: Cloudflare API Token.
3. In GitHub **Actions → Deploy SKILLPRINT Realtime API → Run workflow**, choose `main` and run it. Wait for the workflow to succeed.
4. Open the Worker URL from the workflow's deploy step, which will normally look like `https://skillprint-live-api.<your-subdomain>.workers.dev`. Verify the URL plus `/api/health` returns JSON with `"ok":true`.
5. In **Cloudflare Pages → skillprint → Settings → Environment variables / Variables and Secrets**, create the **Production build-time** variable:
   - Name: `VITE_SKILLPRINT_API_BASE`
   - Value: the exact Worker base URL **without** `/api/health` and without a trailing slash.
6. **Redeploy your Cloudflare Pages build.** Vite embeds `VITE_*` variables into the built JavaScript. A mere variable change cannot update an already-built site.
7. Visit the Pages site and confirm the header reads **BACKEND ONLINE**, then create a session and open the candidate link on a **different phone or laptop**. Both devices must use the deployed Pages URL, not a localhost URL.

### Option B — Wrangler from a terminal

```sh
npm install
npx wrangler login
npm run api:deploy
```

Then complete steps 4–7 above.

### Diagnostics

- **LOKALE VORSCHAU:** no API URL has been embedded in the build; only same-browser tabs can sync.
- **BACKEND OFFLINE:** the API URL is configured but the Worker health check failed. Verify `/api/health`, deployment and browser network permissions.
- **BACKEND ONLINE:** the health endpoint responded. This does *not* prove that live WebSocket event delivery, security or full e2e assessment has passed.
- If the Pages project was deployed using **Direct Upload** rather than GitHub integration, changes to this GitHub repository won't automatically update Pages. Upload a fresh `dist/` build after setting the variable in your local build environment, or connect the project to GitHub.

**Cloudflare limits:** SQLite-backed Durable Objects are available on the Cloudflare Free plan, subject to usage caps. Avoid sharing this publicly as a production hiring tool; the current code has demo-only capability URLs, no full identity service, no tenant isolation and no applicant privacy compliance.

### Demo script

1. Employer clicks **Neue Demo-Sitzung starten** and sees a Control Room with zero actions.
2. Open the candidate link (same browser for local mode; independent device with deployed Worker).
3. Candidate asks the guest about the complaint, performs the *simulated* identity check and opens the invoice.
4. Compare line items, enter **220** as the corrected total, then send a complete reply.
5. Observer sees the event timeline update; open **Evidence Report** and click a rubric evidence link.
6. Observer reviews the report and clicks **Fachlich freigeben** after completion.
7. Demonstrate negative path in a fresh session: open invoice before verifying identity. The rubric records a privacy issue rather than inventing a personality conclusion.

## Technical organization

```text
index.html               Vite SPA entry point
src/main.js              Three UI roles, navigation, REST + WebSocket, local preview
src/style.css            Premium dark responsive design
src/engine.js            Shared deterministic scenario / events / rubric rules
worker/index.js          Cloudflare API + durable session room
worker/wrangler.toml     SQLite Durable Object binding and migration
public/config.js         Legacy public configuration; the current HTML uses Vite env or the source fallback
.github/workflows/deploy-realtime-api.yml On-demand GitHub Action to deploy the Worker
tests/engine.test.js     Domain logic and negative-path tests
docs/ARCHITECTURE.md     Scope, data flow, caveats, roadmap
```

## Important limitations / safety

- **Use synthetic guest names and fictional candidate content only.** This demonstrator is not approved for real recruitment sessions or personal information.
- The API is public and creates sessions using unguessable **capability links**, not enterprise SSO. Tokens in URLs and permissive demo CORS are **not** a replacement for authentication, multi-tenant authorization, access retention controls, abuse rate limits or a completed DPIA.
- No camera, mic, face/eye/emotion analysis, personality inference, automatic hiring/rejection or unvalidated success probability.
- Values in the report are **exercise demonstration points, not validated employment fitness scores**.
- WebSocket sessions, event logs and Worker's storage have not been load-tested, independently audited or reviewed for EU/TR labor law or data protection.
- The document proposes multiple countries and industries; this repository deliberately starts with one hotel exercise so real testing is possible before expansion.

## Next delivery slice

Bounded AI guest agent with deterministic scenario facts, employer-approved editable scenario templates, role-based identity/authentication, a real teach–retry–transfer block, candidate localization DE/TR/EN, evidence browsing across repeated tasks, privacy controls, independent assessment review and end-to-end tests.

The original `Pflichtenheft` remains the scope reference; no confidential PDF or applicant data is copied into this public repository.
