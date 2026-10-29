import assert from "node:assert/strict";

// Run against deployed PUBLIC DEMO worker. Uses fictional hotel details and
// synthetic role tokens only. Never send real candidate information.
const BASE = (process.env.SKILLPRINT_LIVE_API || "https://skillprint-live-api.hsdf7rb.workers.dev").replace(/\/$/, "");

async function request(path, method = "GET", body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const value = await r.json().catch(() => null);
  return { status: r.status, value };
}
function waitSnapshot(socket, check, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("No matching WebSocket snapshot received")); }, ms);
    function cleanup() {
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
      socket.removeEventListener("close", onClose);
    }
    function onMessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "snapshot" && check(data.data)) { cleanup(); resolve(data.data); }
      } catch (e) { cleanup(); reject(e); }
    }
    function onError() { cleanup(); reject(new Error("WebSocket error before matching event")); }
    function onClose() { cleanup(); reject(new Error("WebSocket closed unexpectedly")); }
    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
    socket.addEventListener("close", onClose);
  });
}
const pathFor = (id, route, token) => "/api/sessions/" + encodeURIComponent(id) + "/" + route + "?token=" + encodeURIComponent(token);


// Verify the ACTUAL deployed Pages HTML and its frontend assets, not the GitHub build.
const site = "https://skillprint.pages.dev/";
const siteResponse = await fetch(site, { signal: AbortSignal.timeout(20000) });
assert.equal(siteResponse.status, 200, "Published Pages HTML is unavailable");
const html = await siteResponse.text();
assert.ok(/SKILLPRINT/i.test(html) && /id=["']app["']/.test(html), "Published HTML does not contain our SPA entry point");
const scripts = [...html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi)];
assert.ok(scripts.length >= 1, "No application JavaScript entrypoint in deployed HTML");
const mainURL = new URL(scripts.at(-1)[1], site);
const scriptResponse = await fetch(mainURL, { signal: AbortSignal.timeout(20000) });
assert.equal(scriptResponse.status, 200, "Deployed main JS returned a non-success response");
assert.match(scriptResponse.headers.get("content-type") || "", /javascript/i, "Main JS URL returned a non-JavaScript MIME type, likely an SPA HTML fallback");
const scriptBody = await scriptResponse.text();
assert.ok(scriptBody.length > 100, "Deployed main JS is unexpectedly empty");
const styles = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)];
assert.ok(styles.length >= 1, "No deployed stylesheet entrypoint");
const styleResponse = await fetch(new URL(styles.at(-1)[1], site), { signal: AbortSignal.timeout(20000) });
assert.equal(styleResponse.status, 200, "Stylesheet cannot be fetched");
assert.match(styleResponse.headers.get("content-type") || "", /css/i, "Stylesheet URL returned a non-CSS MIME type");
console.log("PASS: live Pages HTML, JavaScript and CSS assets all reachable", mainURL.pathname);
const hasMultitask = scriptBody.includes("Live Multitasking Demo starten");
const hasOldButton = scriptBody.includes("Neue Demo-Sitzung starten");
console.log("DEPLOYED FRONTEND:",JSON.stringify({asset:mainURL.pathname,hasMultitask,hasOldButton,bytes:scriptBody.length}));
assert.ok(hasMultitask, "STALE CLOUDFLARE PAGES DEPLOYMENT: live JS does NOT include Sprint 2 button. Redeploy latest main with build command npm run build and output dist.");
console.log("PASS: deployed frontend includes Sprint 2 Multitasking UI");
const hasFrontDeskStudio = scriptBody.includes("fd-cockpit") && scriptBody.includes("Ihr Arbeitsplatz.");
console.log("FRONT DESK RELEASE:",JSON.stringify({hasFrontDeskStudio,main:mainURL.pathname}));
assert.ok(hasFrontDeskStudio, "Cloudflare Pages still serves an older frontend without Sprint 3 Front Desk Studio.");
console.log("PASS: public website serves the new integrated Front Desk Studio");


console.log("Checking published SKILLPRINT backend:", BASE);
const health = await request("/api/health");
assert.equal(health.status, 200, "Health endpoint is not accessible");
assert.equal(health.value?.ok, true, "Worker health endpoint is not healthy");
console.log("PASS: API health");

const created = await request("/api/sessions", "POST", {});
assert.equal(created.status, 201, "Could not create a synthetic session");
const { id, coachToken, candidateToken } = created.value;
assert.match(id, /^sl-[a-z0-9-]+$/);
assert.match(coachToken, /^[a-f0-9]{48}$/);
assert.match(candidateToken, /^[a-f0-9]{48}$/);
assert.notEqual(coachToken, candidateToken);
console.log("PASS: synthetic session created");

const view = async (roleToken) => request(pathFor(id, "snapshot", roleToken));
const act = async (data) => request(pathFor(id, "action", candidateToken), "POST", { ...data, id: crypto.randomUUID() });
const initialCandidate = await view(candidateToken);
const initialCoach = await view(coachToken);
assert.equal(initialCandidate.status, 200);
assert.equal(initialCoach.status, 200);
assert.equal(initialCandidate.value.role, "candidate");
assert.equal(initialCoach.value.role, "coach");
assert.equal(initialCandidate.value.report, undefined, "Candidate must not get employer report");
assert.equal(initialCoach.value.events.length, 0);
const unauthorized = await view("0".repeat(48));
assert.equal(unauthorized.status, 401);
const illegalNote = await act({ type: "observer_note", text: "Candidate must not post this observer note." });
assert.notEqual(illegalNote.status, 200);
console.log("PASS: role authorization and report isolation");

let ws;
try {
  assert.equal(typeof WebSocket, "function", "Node 22 WebSocket required");
  ws = new WebSocket(BASE.replace(/^http/, "ws") + pathFor(id, "stream", coachToken));
  const initialStream = await waitSnapshot(ws, s => s.events.length === 0);
  assert.equal(initialStream.role, "coach");
  const liveUpdate = waitSnapshot(ws, s => s.events.length >= 1);
  const asked = await act({type:"ask_guest"});
  assert.equal(asked.status, 200);
  const streamed = await liveUpdate;
  assert.equal(streamed.events[0].type, "ask_guest");
  console.log("PASS: realtime observer WebSocket received candidate action");
} finally {
  if (ws && ws.readyState <= 1) ws.close();
}

const rest = [
  {type:"verify_identity"},
  {type:"open_invoice"},
  {type:"compare_items"},
  {type:"correct_invoice",amount:220},
  {type:"submit_reply",text:"Guten Tag Frau Weber, wir haben die doppelte Frühstücksposition entfernt. Ihre Rechnung beträgt nun 220 Euro."},
];
for (const step of rest) {
  const response = await act(step);
  assert.equal(response.status, 200, "Failed candidate step " + step.type + ": " + JSON.stringify(response.value));
}
const completedCoach = await view(coachToken);
const completedCandidate = await view(candidateToken);
assert.equal(completedCoach.status, 200);
assert.equal(completedCoach.value.status, "completed");
assert.equal(completedCoach.value.report.total, 100);
assert.equal(completedCoach.value.events.length, 6);
assert.equal(completedCandidate.value.report, undefined);
for (const criterion of completedCoach.value.report.criteria) {
  assert.ok(criterion.evidence.length > 0, "Missing evidence for " + criterion.id);
  for (const evidenceId of criterion.evidence) {
    assert.ok(completedCoach.value.events.some(e => e.id === evidenceId), "Evidence link cannot be resolved");
  }
}
console.log("PASS: completed candidate task, evidence-linked rubric and score");

const approved = await request(pathFor(id, "finalize", coachToken), "POST", {});
assert.equal(approved.status, 200);
assert.equal(approved.value.reviewStatus, "approved");
const reviewed = await view(coachToken);
assert.equal(reviewed.value.reviewStatus, "approved");
assert.equal(reviewed.value.events.at(-1).type, "human_review");
console.log("PASS: human review and final report");

console.log("ALL PASS — live API, role protection, cross-device WebSocket, report evidence and human review");
