# SKILLPRINT LIVE

**From interview impressions to observable, evidence-linked work samples.**

Sprint 0 vertical slice for the `SKILLPRINT LIVE — Entwickler-Pflichtenheft v1.0 (29.10.2026)`. This is a **working demonstrator**, not a validated employment assessment, certified AI system, or product suitable for real candidate information.

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

**Not implemented yet:** generative AI customer (the current dialogue is scripted), identity verification of real individuals (the check is a simulation), cross-tenant management, real authentication/MFA, video/audio, actual multilingual scenario localization, independent assessment validity studies, automated ATS integrations, VR, legal/privacy clearance. These items are intentionally **not** simulated or advertised as live features.

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

The app now has a static, dark startup screen: if a JavaScript entrypoint is missing or errors, it displays a diagnostic rather than an empty white page. A CI smoke check also verifies that generated HTML references real `dist/assets/*` files. The public demo Worker URL is embedded in `public/config.js` so an API environment variable is not required for this demo.

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
public/config.js         Optional local fallback when the build-time API variable is not set
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
