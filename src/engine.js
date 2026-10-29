// SKILLPRINT LIVE — Hotel Front Office, illustrative, non-validated assessment.
// Shared deterministic logic for the browser preview and the Cloudflare Worker.
export const SCENARIO = Object.freeze({
  id: "hotel_frontdesk_invoice_v1",
  version: "hotel_reception_rubric_1.2",
  title: "Hotel Front Office · Rechnungsprüfung",
  guest: "Lena Weber",
  booking: "HT-2048",
  room: "208",
  billed: 240,
  correct: 220,
  currency: "EUR",
  problem: "Frühstück doppelt berechnet",
});
export const RUBRIC = [
  { id: "clarification", title: "Anliegen klären", weight: 25 },
  { id: "privacy", title: "Datenschutz", weight: 25 },
  { id: "solution", title: "Lösungsweg", weight: 25 },
  { id: "documentation", title: "Dokumentation", weight: 15 },
  { id: "escalation", title: "Eskalation", weight: 10 },
];
export const ACTION_LABELS = {
  ask_guest: "Rückfrage an den Gast",
  verify_identity: "Gastidentität geprüft",
  open_invoice: "Rechnung geöffnet",
  compare_items: "Rechnungspositionen verglichen",
  correct_invoice: "Rechnung korrigiert",
  escalate: "An Vorgesetzte eskaliert",
  submit_reply: "Antwort dokumentiert",
  observer_note: "Beobachternotiz",
  human_review: "Fachlich freigegeben",
};
export function newSession(id, at = new Date().toISOString()) {
  return { id, createdAt: at, status: "running", reviewStatus: "pending", scenarioId: SCENARIO.id, rubricVersion: SCENARIO.version, events: [] };
}
export function deriveState(events = []) {
  const candidate = events.filter(e => e.actor === "candidate");
  const find = type => candidate.find(e => e.type === type);
  const verified = find("verify_identity");
  const opened = find("open_invoice");
  const compared = find("compare_items");
  const corrected = candidate.find(e => e.type === "correct_invoice" && Number(e.payload?.amount) === SCENARIO.correct);
  const reply = find("submit_reply");
  return {
    asked: Boolean(find("ask_guest")),
    verified: Boolean(verified),
    opened: Boolean(opened),
    compared: Boolean(compared),
    corrected: Boolean(corrected),
    replied: Boolean(reply),
    escalated: Boolean(find("escalate")),
    privacyBreach: Boolean(opened && (!verified || candidate.indexOf(opened) < candidate.indexOf(verified))),
    replyText: reply?.payload?.text || "",
    attempts: candidate.filter(e => e.type === "correct_invoice").length,
  };
}
export function evaluate(events = []) {
  const state = deriveState(events);
  const candidate = events.filter(e => e.actor === "candidate");
  const relevant = types => candidate.filter(e => types.includes(e.type)).map(e => e.id);
  const reply = candidate.find(e => e.type === "submit_reply");
  const criteria = [
    { id: "clarification", points: state.asked ? 2 : state.replied ? 1 : 0, evidence: relevant(["ask_guest", "submit_reply"]), reason: state.asked ? "Das Anliegen wurde aktiv geklärt." : "Keine dokumentierte fachliche Rückfrage." },
    { id: "privacy", points: state.privacyBreach ? 0 : state.verified ? 2 : 0, evidence: relevant(["verify_identity", "open_invoice"]), reason: state.privacyBreach ? "Die Rechnung wurde vor der Identitätsprüfung geöffnet." : state.verified ? "Identität vor Datenzugriff geprüft." : "Identitätsprüfung nicht dokumentiert." },
    { id: "solution", points: state.corrected && state.compared ? 2 : state.compared ? 1 : 0, evidence: relevant(["open_invoice", "compare_items", "correct_invoice"]), reason: state.corrected ? "Doppelte Frühstücksposition korrigiert; Gesamtbetrag 220 EUR." : "Die sachlich korrekte Rechnungskorrektur fehlt." },
    { id: "documentation", points: (reply?.payload?.text?.length || 0) >= 45 ? 2 : state.replied ? 1 : 0, evidence: relevant(["submit_reply"]), reason: state.replied ? "Eine Antwort wurde dokumentiert; Vollständigkeit ist fachlich nachzuprüfen." : "Es liegt keine dokumentierte Kundenantwort vor." },
    { id: "escalation", points: state.corrected && !state.escalated ? 2 : state.escalated ? 1 : 0, evidence: relevant(["escalate", "correct_invoice"]), reason: state.corrected && !state.escalated ? "Der Standardfall wurde korrekt ohne unnötige Eskalation gelöst." : "Eskalationsentscheidung benötigt menschliche Prüfung." },
  ].map(entry => {
    const rubric = RUBRIC.find(r => r.id === entry.id);
    return { ...rubric, ...entry, weighted: Number((entry.points / 2 * rubric.weight).toFixed(1)) };
  });
  return {
    criteria,
    total: criteria.reduce((sum, c) => sum + c.weighted, 0),
    assessed: candidate.length > 0,
    evidenceCount: candidate.length,
    disclaimer: "Demonstrationsrubrik, nicht arbeitspsychologisch validiert. Kein Eignungs- oder Einstellungswahrscheinlichkeitswert. Entscheidung nur durch Menschen.",
  };
}
const CANDIDATE_ACTIONS = new Set(["ask_guest", "verify_identity", "open_invoice", "compare_items", "correct_invoice", "escalate", "submit_reply"]);
export function appendAction(session, action, role, now = new Date().toISOString()) {
  if (!session || !Array.isArray(session.events)) throw new Error("INVALID_SESSION");
  if (!action || typeof action.type !== "string") throw new Error("INVALID_ACTION");
  if (role === "candidate" && !CANDIDATE_ACTIONS.has(action.type)) throw new Error("FORBIDDEN");
  if (role === "coach" && action.type !== "observer_note") throw new Error("FORBIDDEN");
  if (role !== "candidate" && role !== "coach") throw new Error("FORBIDDEN");
  // Retry of an already-committed action must succeed, even after completion or approval.
  const id = typeof action.id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(action.id) ? action.id : crypto.randomUUID();
  if (session.events.some(e => e.id === id)) return session;
  if (session.reviewStatus === "approved") throw new Error("SESSION_FINALIZED");
  if (session.events.length >= 250) throw new Error("EVENT_LIMIT");
  const current = deriveState(session.events);
  if (role === "candidate" && current.replied) throw new Error("ASSESSMENT_COMPLETED");
  if (action.type === "compare_items" && !current.opened) throw new Error("OPEN_INVOICE_FIRST");
  if (action.type === "correct_invoice" && !current.compared) throw new Error("COMPARE_INVOICE_FIRST");
  if (action.type === "submit_reply" && !current.opened) throw new Error("OPEN_INVOICE_FIRST");
  const payload = {};
  if (action.type === "correct_invoice") {
    const amount = Number(action.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000) throw new Error("INVALID_AMOUNT");
    payload.amount = amount;
  }
  if (action.type === "submit_reply" || action.type === "observer_note") {
    const val = String(action.text || "").trim();
    if (val.length < 8 || val.length > 800) throw new Error("INVALID_TEXT");
    payload.text = val;
  }
  const event = { id, sequence: session.events.length + 1, at: now, actor: role === "coach" ? "observer" : "candidate", type: action.type, payload };
  return { ...session, events: [...session.events, event], status: action.type === "submit_reply" ? "completed" : "running" };
}
