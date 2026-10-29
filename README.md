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

1. Install dependencies and authenticate with Cloudflare: `npm install`, then `npx wrangler login`.
2. Deploy the separate Worker + SQLite Durable Object:

   ```sh
   npm run api:deploy
   ```

3. Take the deployed Worker URL (for example `https://skillprint-live-api.<account>.workers.dev`) and replace the empty string in `public/config.js`:

   ```js
   window.SKILLPRINT_API_BASE = "https://YOUR-WORKER-URL.workers.dev";
   ```

4. Connect the GitHub repository to Cloudflare Pages, using build command `npm run build` and output directory `dist`. Or deploy the built `dist/` directory manually.
5. Open the deployed Pages site, create a session, copy the candidate link and open it from another device. The Worker uses REST for actions and WebSocket for live observer updates.

*Cloudflare account configuration, API deployment, custom domains and DNS are not performed by this repository commit.* Local mode works without Cloudflare.

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
public/config.js         Set Worker URL to enable cross-device mode
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
