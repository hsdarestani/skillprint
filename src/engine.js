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
  checkin_arrival: "Neuer Gast am Empfang",
  phone_ringing: "Anruf aus dem Housekeeping",
  welcome_checkin: "Anreisenden Gast begrüßt",
  verify_checkin: "Anreisebuchung abgeglichen",
  hold_phone: "Anruf höflich gehalten",
  ignore_phone: "Anruf ohne Antwort",
  answer_phone: "Housekeeping Anruf beantwortet",
  promise_room: "Zimmerbereitschaft ungeprüft versprochen",
  offer_wait: "Wartebereich und Rückmeldung angeboten",
  complete_checkin: "Check-in-Fall gelöst",
  candidate_message: "Nachricht an den KI-Gast",
  guest_message: "Antwort des simulierten Gastes",
  verify_identity: "Gastidentität geprüft",
  open_invoice: "Rechnung geöffnet",
  compare_items: "Rechnungspositionen verglichen",
  correct_invoice: "Rechnung korrigiert",
  escalate: "An Vorgesetzte eskaliert",
  submit_reply: "Antwort dokumentiert",
  observer_note: "Beobachternotiz",
  human_review: "Fachlich freigegeben",
};
export function newSession(id, at = new Date().toISOString(), mode = "classic") {
  const selected = mode === "multitask" ? "multitask" : "classic";
  return { id, createdAt: at, mode:selected, status:"running", reviewStatus:"pending", scenarioId:SCENARIO.id, rubricVersion:SCENARIO.version, events:[] };
}
export const MULTITASK_FACTS = Object.freeze({
  checkinGuest: "Sofia Demir", booking: "CK-311",
  room: "311", roomStatus: "noch nicht freigegeben",
  incomingCall: "Housekeeping", preferredOutcome: "Wartebereich anbieten und Rückmeldung zusagen",
});
export function deriveMultitask(events = []) {
  const find = type => events.find(e => e.type === type && (e.actor === "candidate" || e.actor === "system"));
  const has = type => Boolean(find(type));
  const arrival = find("checkin_arrival"), ringing = find("phone_ringing");
  const phoneAnswered = has("answer_phone"), waiting = has("offer_wait");
  return {
    checkinArrived: Boolean(arrival), phoneRinging: Boolean(ringing),
    checkinWelcomed:has("welcome_checkin"), checkinVerified:has("verify_checkin"),
    phoneHeld:has("hold_phone"), phoneIgnored:has("ignore_phone"),
    phoneAnswered, roomPromised:has("promise_room"),
    roomWaiting:waiting, checkinResolved:has("complete_checkin"),
    pending: (Boolean(arrival) && !has("complete_checkin") ? 1 : 0) + (Boolean(ringing) && !phoneAnswered ? 1 : 0),
  };
}
export function evaluateMultitask(events = []) {
  const s=deriveMultitask(events);
  const refs = types => events.filter(e=>types.includes(e.type)).map(e=>e.id);
  const first = type => events.findIndex(e=>e.type===type);
  const greetedBeforeCall = first("welcome_checkin")!==-1 && (first("answer_phone")===-1 || first("welcome_checkin")<first("answer_phone"));
  const items=[
    {id:"checkin",title:"Anreisenden Gast betreuen",weight:40,points:s.checkinResolved && s.checkinVerified && s.roomWaiting && !s.roomPromised ? 2 : s.checkinWelcomed || s.checkinVerified ? 1 : 0,evidence:refs(["checkin_arrival","welcome_checkin","verify_checkin","offer_wait","complete_checkin","promise_room"]),reason:s.roomPromised?"Nicht bestätigte Zimmerbereitschaft zugesagt.":s.checkinResolved?"Gast begrüßt, Buchung geprüft und sichere Zwischenlösung angeboten.":"Check-in noch nicht vollständig und sicher bearbeitet."},
    {id:"telephone",title:"Housekeeping Kommunikation",weight:30,points:s.phoneAnswered&&!s.phoneIgnored?2:s.phoneAnswered?1:0,evidence:refs(["phone_ringing","hold_phone","ignore_phone","answer_phone"]),reason:s.phoneIgnored?"Anruf zunächst ignoriert.":s.phoneAnswered?"Zimmerstatus durch den Anruf verifiziert.":"Telefonische Rückmeldung fehlt."},
    {id:"prioritization",title:"Priorisieren und unterbrechen",weight:30,points:s.phoneAnswered&&s.checkinResolved&&!s.roomPromised&&greetedBeforeCall&&!s.phoneIgnored?2:s.phoneAnswered||s.checkinWelcomed?1:0,evidence:refs(["checkin_arrival","phone_ringing","welcome_checkin","hold_phone","ignore_phone","answer_phone","offer_wait","promise_room","complete_checkin"]),reason:s.roomPromised?"Eine unbestätigte Zusage ist ein fachlicher Risikofaktor.":s.phoneAnswered&&s.checkinResolved?"Beide Aufgaben bearbeitet; Reihenfolge anhand der Ereignisse prüfen.":"Unterbrechungen noch nicht vollständig bearbeitet."},
  ].map(x=>({...x,weighted:x.points/2*x.weight}));
  return {criteria:items,total:items.reduce((n,x)=>n+x.weighted,0),status:s.checkinResolved&&s.phoneAnswered?"complete":"in_progress",disclaimer:"Illustrative Entscheidungsrubrik; keine validierte Eignungsdiagnostik. Zeitdruck und Priorisierung müssen fachlich geprüft werden."};
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
    asked: Boolean(find("ask_guest") || candidate.some(e => e.type === "candidate_message")),
    guestMessages: events.filter(e => e.actor === "guest" && e.type === "guest_message").length,
    candidateMessages: candidate.filter(e => e.type === "candidate_message").length,
    guestReply: events.filter(e => e.actor === "guest" && e.type === "guest_message").at(-1)?.payload?.text || "",
    verified: Boolean(verified),
    opened: Boolean(opened),
    compared: Boolean(compared),
    corrected: Boolean(corrected),
    replied: Boolean(reply),
    escalated: Boolean(find("escalate")),
    privacyBreach: Boolean(opened && (!verified || candidate.indexOf(opened) < candidate.indexOf(verified))),
    replyText: reply?.payload?.text || "",
    attempts: candidate.filter(e => e.type === "correct_invoice").length,
    multitask: deriveMultitask(events),
  };
}
// Progress is a navigation aid, not a validated candidate competency score.
// Optional actions (hold, escalate, risk choice) do not artificially change completion.
export function journeyProgress(events = [], mode = "classic") {
  const state = deriveState(events);
  const invoiceKeys = ["asked","verified","opened","compared","corrected","replied"];
  const arrived = ["checkinWelcomed","checkinVerified","roomWaiting","checkinResolved"];
  const invoiceDone = invoiceKeys.filter(key => state[key]).length;
  const multi = state.multitask;
  const checkinDone = arrived.filter(key => multi[key]).length;
  const phoneDone = Number(multi.phoneAnswered);
  const advanced = mode === "multitask";
  const segments = [
    {id:"guest-contact",key:"guest",label:"Gast",done:Number(state.asked),total:1},
    {id:"invoice-work",key:"invoice",label:"Rechnung",done:invoiceDone,total:6},
    ...(advanced ? [
      {id:"checkin-task",key:"checkin",label:"Check-in",done:checkinDone,total:4,active:multi.checkinArrived && !multi.checkinResolved},
      {id:"phone-task",key:"phone",label:"Telefon",done:phoneDone,total:1,active:multi.phoneRinging && !multi.phoneAnswered},
    ] : []),
  ];
  const total = advanced ? 11 : 6;
  const done = invoiceDone + (advanced ? checkinDone + phoneDone : 0);
  return {
    done,total,
    percentage:Math.round(done/total*100),
    segments,
    pendingInterruptions:advanced ? multi.pending : 0,
    completed:done === total,
  };
}
export function evaluate(events = [], mode = "classic") {
  const state = deriveState(events);
  const candidate = events.filter(e => e.actor === "candidate");
  const relevant = types => candidate.filter(e => types.includes(e.type)).map(e => e.id);
  const reply = candidate.find(e => e.type === "submit_reply");
  const criteria = [
    { id: "clarification", points: state.asked ? 2 : state.replied ? 1 : 0, evidence: relevant(["ask_guest", "candidate_message", "submit_reply"]), reason: state.asked ? "Das Anliegen wurde aktiv geklärt." : "Keine dokumentierte fachliche Rückfrage." },
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
    ...(mode === "multitask" ? {multitask:evaluateMultitask(events)} : {}),
  };
}
const MULTITASK_ACTIONS = new Set(["welcome_checkin","verify_checkin","hold_phone","ignore_phone","answer_phone","promise_room","offer_wait","complete_checkin"]);
const CANDIDATE_ACTIONS = new Set([...MULTITASK_ACTIONS,"candidate_message", "ask_guest", "verify_identity", "open_invoice", "compare_items", "correct_invoice", "escalate", "submit_reply"]);
export function appendAction(session, action, role, now = new Date().toISOString()) {
  if (!session || !Array.isArray(session.events)) throw new Error("INVALID_SESSION");
  if (!action || typeof action.type !== "string") throw new Error("INVALID_ACTION");
  if (role === "candidate" && !CANDIDATE_ACTIONS.has(action.type)) throw new Error("FORBIDDEN");
  if (role === "coach" && action.type !== "observer_note") throw new Error("FORBIDDEN");
  if (role === "guest" && action.type !== "guest_message") throw new Error("FORBIDDEN");
  if (role !== "candidate" && role !== "coach" && role !== "guest") throw new Error("FORBIDDEN");
  // Retry of an already-committed action must succeed, even after completion or approval.
  const id = typeof action.id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(action.id) ? action.id : crypto.randomUUID();
  if (session.events.some(e => e.id === id)) return session;
  if (session.reviewStatus === "approved") throw new Error("SESSION_FINALIZED");
  if (session.events.length >= 250) throw new Error("EVENT_LIMIT");
  const current = deriveState(session.events);
  if ((role === "candidate" || role === "guest") && current.replied && action.type !== "guest_message") throw new Error("ASSESSMENT_COMPLETED");
  if (action.type === "candidate_message") {
    if (current.candidateMessages >= 12) throw new Error("CHAT_LIMIT_REACHED");
    if (current.candidateMessages > current.guestMessages) throw new Error("GUEST_REPLY_PENDING");
  }
  if (role === "guest" && current.candidateMessages <= current.guestMessages) throw new Error("NO_CHAT_REQUEST");
  if (role === "candidate" && action.type === "submit_reply" && current.candidateMessages > current.guestMessages) throw new Error("GUEST_REPLY_PENDING");
  const advanced = session.mode === "multitask";
  const mt = current.multitask;
  if (MULTITASK_ACTIONS.has(action.type) && !advanced) throw new Error("ADVANCED_MODE_REQUIRED");
  if (advanced && action.type === "submit_reply" && (!mt.checkinResolved || !mt.phoneAnswered)) throw new Error("SERVICE_QUEUE_INCOMPLETE");
  if (action.type === "welcome_checkin" && !mt.checkinArrived) throw new Error("GUEST_NOT_ARRIVED");
  if (action.type === "verify_checkin" && !mt.checkinWelcomed) throw new Error("WELCOME_GUEST_FIRST");
  if (["hold_phone","ignore_phone","answer_phone"].includes(action.type) && !mt.phoneRinging) throw new Error("PHONE_NOT_RINGING");
  if (action.type === "offer_wait" && (!mt.checkinVerified || !mt.phoneAnswered)) throw new Error("CHECK_ROOM_STATUS_FIRST");
  if (action.type === "complete_checkin" && (!mt.checkinVerified || !mt.roomWaiting || !mt.phoneAnswered)) throw new Error("CHECKIN_NOT_READY");
  if (action.type === "promise_room" && !mt.checkinArrived) throw new Error("GUEST_NOT_ARRIVED");
  if (["welcome_checkin","verify_checkin","hold_phone","ignore_phone","answer_phone","promise_room","offer_wait","complete_checkin"].includes(action.type)
     && session.events.some(e=>e.actor==="candidate" && e.type===action.type)) throw new Error("ACTION_ALREADY_RECORDED");
  if (action.type === "compare_items" && !current.opened) throw new Error("OPEN_INVOICE_FIRST");
  if (action.type === "correct_invoice" && !current.compared) throw new Error("COMPARE_INVOICE_FIRST");
  if (action.type === "submit_reply" && !current.opened) throw new Error("OPEN_INVOICE_FIRST");
  const payload = {};
  if (action.type === "correct_invoice") {
    const amount = Number(action.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000) throw new Error("INVALID_AMOUNT");
    payload.amount = amount;
  }
  if (action.type === "submit_reply" || action.type === "observer_note" || action.type === "candidate_message" || action.type === "guest_message") {
    const val = String(action.text || "").trim();
    if (val.length < (action.type === "candidate_message" ? 3 : 8) || val.length > (action.type === "candidate_message" ? 500 : 800)) throw new Error("INVALID_TEXT");
    payload.text = val;
    if (action.type === "guest_message") payload.source = action.source === "ai" ? "ai" : "scripted";
    if (action.type === "candidate_message" || action.type === "guest_message") payload.locale = ["de","tr","en"].includes(action.locale) ? action.locale : "de";
  }
  const event = { id, sequence: session.events.length + 1, at: now, actor: role === "coach" ? "observer" : role === "guest" ? "guest" : "candidate", type: action.type, payload };
  const events=[...session.events,event];
  if (advanced && role === "candidate") {
    // Scenario interruptions are persisted and replayable, never browser-local timers.
    const completedSteps = events.filter(e=>e.actor==="candidate" && e.type!=="submit_reply").length;
    for (const [trigger,type] of [[2,"checkin_arrival"],[4,"phone_ringing"]]) {
      if(completedSteps>=trigger && !events.some(e=>e.type===type)) {
        events.push({id:"sys_"+type,sequence:events.length+1,at:now,actor:"system",type,
          payload:{description:type==="checkin_arrival"?"Sofia Demir wartet mit Buchung CK-311 am Empfang.":"Housekeeping meldet sich zum Zimmerstatus 311."}});
      }
    }
  }
  return { ...session, events, status: action.type === "submit_reply" ? "completed" : "running" };
}
