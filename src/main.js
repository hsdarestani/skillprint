import { SCENARIO, ACTION_LABELS, appendAction, newSession, deriveState, evaluate } from "./engine.js";
import { OPENING, fallbackGuest, normalizeLocale } from "./guest.js";
import { multitaskBanner, multitaskWorkspace, multitaskControl, multitaskReport } from "./multitask-ui.js";
import { missionProgress, missionDock, invoiceActionStates } from "./mission-ui.js";
import { renderFrontDeskStudio, renderStudioObserver, studioActiveTab } from "./frontdesk-studio.js";
import { renderReplayWidget,renderReportAppendix,renderDrawingDocument } from "./evidence-lab.js";
import { scriptedServiceResponse } from "./service-dialogue.js";

const root = document.getElementById("app");
// The deployed, healthy demo Worker URL is set in public/config.js; it is a safe
// public fallback when Pages build variables were omitted or entered incorrectly.
const API = String(window.SKILLPRINT_API_BASE || import.meta.env?.VITE_SKILLPRINT_API_BASE || "https://skillprint-live-api.hsdf7rb.workers.dev").trim().replace(/\/$/, "");
const REMOTE = Boolean(API);
let apiHealth = REMOTE ? "checking" : "local";
const STORE = "skillprint:sprint0:session:";
const DETAILS = "skillprint:sprint0:active";
let active = JSON.parse(sessionStorage.getItem(DETAILS) || "null");
let snapshot = null;
let chosenEvidence = null;
let socket = null;
let refreshId = 0;
let notification = "";
let guestLocale = normalizeLocale(sessionStorage.getItem("skillprint:guestLocale"));
let chatBusy = false;
let serviceBusy = false;
let studioTab = "guest";
let replaySequence = null;
let activeStroke = null;
const openPanels = new Set();
let lastStudioSession = "";
const studioDrafts = Object.create(null);
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("skillprint-demo") : null;
const safe = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
const fmt = at => at ? new Date(at).toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit", second:"2-digit" }) : "—";
const euro = n => new Intl.NumberFormat("de-DE", { style:"currency", currency:"EUR" }).format(n);
const randomToken = () => [...crypto.getRandomValues(new Uint8Array(24))].map(x => x.toString(16).padStart(2,"0")).join("");
const href = (view, id, token) => "#/" + view + "/" + id + "?token=" + encodeURIComponent(token);
const fullURL = (view, id, token) => location.origin + location.pathname + href(view, id, token);
const current = () => {
  const [path, query = ""] = (location.hash || "#/dashboard").slice(1).split("?");
  const [, view = "dashboard", id = ""] = path.split("/");
  return { view, id, token: new URLSearchParams(query).get("token") || "" };
};
const tokenFor = r => r.token || (r.view === "candidate" ? active?.candidateToken : active?.coachToken) || "";
function localEntry(id) {
  try { return JSON.parse(localStorage.getItem(STORE + id) || "null"); } catch { return null; }
}
function localSnapshot(id, token) {
  const entry = localEntry(id);
  if (!entry) throw Error("Diese Demo-Sitzung wurde in diesem Browser nicht gefunden.");
  const role = token === entry.coachToken ? "coach" : token === entry.candidateToken ? "candidate" : null;
  if (!role) throw Error("Sitzungslink ist ungültig.");
  const s = entry.session;
  const events = role === "coach" ? s.events : s.events.filter(e => e.actor === "candidate" || e.actor === "guest" || e.actor === "system" || e.actor === "service");
  const base = { id, scenarioId:s.scenarioId, rubricVersion:s.rubricVersion, mode:s.mode||"classic", status:s.status, reviewStatus:s.reviewStatus, role, events, state:deriveState(events) };
  return role === "coach" ? { ...base, report:evaluate(s.events,s.mode) } : base;
}
async function startSession(mode = "classic") {
  studioTab = "guest";
  for (const id of Object.keys(studioDrafts)) delete studioDrafts[id];
  let data;
  if (REMOTE) {
    const response = await fetch(API + "/api/sessions", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({mode}) });
    if (!response.ok) throw Error("Die Sitzung konnte nicht erstellt werden.");
    data = await response.json();
  } else {
    const id = "sl-" + crypto.randomUUID().slice(0,8);
    data = { id, mode, coachToken:randomToken(), candidateToken:randomToken() };
    localStorage.setItem(STORE + id, JSON.stringify({ ...data, session:newSession(id,new Date().toISOString(),mode) }));
  }
  active = data;
  sessionStorage.setItem(DETAILS, JSON.stringify(active));
  location.hash = href("control", data.id, data.coachToken);
}
async function getSnapshot(r) {
  const token = tokenFor(r);
  if (!r.id || !token) throw Error("Bitte zuerst eine Sitzung im Dashboard starten.");
  if (!REMOTE) return localSnapshot(r.id,token);
  const response = await fetch(API + "/api/sessions/" + encodeURIComponent(r.id) + "/snapshot?token=" + encodeURIComponent(token), { cache:"no-store" });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Sitzung nicht erreichbar");
  return result;
}
async function sendAction(r, action, finalize = false) {
  const token = tokenFor(r);
  if (REMOTE) {
    const path = finalize ? "finalize" : "action";
    const response = await fetch(API + "/api/sessions/" + r.id + "/" + path + "?token=" + encodeURIComponent(token), { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(action || {}) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Aktion nicht möglich");
    snapshot = result;
  } else {
    const entry = localEntry(r.id);
    if (!entry) throw Error("Sitzung nicht gefunden");
    const role = token === entry.coachToken ? "coach" : token === entry.candidateToken ? "candidate" : null;
    if (!role) throw Error("UNAUTHORIZED");
    if (finalize) {
      if (role !== "coach") throw Error("FORBIDDEN");
      if (entry.session.status !== "completed") throw Error("ASSESSMENT_NOT_COMPLETED");
      entry.session.reviewStatus = "approved";
      entry.session.events.push({ id:crypto.randomUUID(), sequence:entry.session.events.length+1, at:new Date().toISOString(), actor:"observer", type:"human_review", payload:{ decision:"rubric_reviewed" } });
    } else {
      entry.session = appendAction(entry.session,action,role);
    }
    localStorage.setItem(STORE + r.id, JSON.stringify(entry));
    channel?.postMessage({ id:r.id });
    snapshot = localSnapshot(r.id,token);
  }
  draw();
}
async function sendGuestChat(r, text) {
  if (chatBusy) return;
  if (!r.id || !tokenFor(r)) throw Error("Sitzungslink fehlt.");
  const msg = String(text || "").trim();
  if (msg.length < 3 || msg.length > 500) throw Error("Bitte 3 bis 500 Zeichen eingeben.");
  const id = crypto.randomUUID();
  chatBusy = true;
  try {
    if (REMOTE) {
      const response = await fetch(API + "/api/sessions/" + encodeURIComponent(r.id) + "/chat?token=" + encodeURIComponent(tokenFor(r)), {
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({id,text:msg,locale:guestLocale}),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Der simulierte Gast ist nicht erreichbar.");
      snapshot = result;
    } else {
      const entry = localEntry(r.id);
      if (!entry || tokenFor(r) !== entry.candidateToken) throw Error("UNAUTHORIZED");
      entry.session = appendAction(entry.session,{id,type:"candidate_message",text:msg,locale:guestLocale},"candidate");
      const reply = fallbackGuest(msg,guestLocale,deriveState(entry.session.events));
      entry.session = appendAction(entry.session,{id:"guest_"+id,type:"guest_message",text:reply,locale:guestLocale,source:"scripted"},"guest");
      localStorage.setItem(STORE + r.id, JSON.stringify(entry));
      channel?.postMessage({id:r.id});
      snapshot = localSnapshot(r.id,tokenFor(r));
    }
    const field = document.getElementById("guest-chat");
    if (field) field.value = "";
    studioDrafts["guest-chat"] = "";
  } finally {
    chatBusy = false;
    draw();
  }
}
async function sendServiceChat(r, serviceChannel, value) {
  if(serviceBusy) return;
  if(!["arrival","phone"].includes(serviceChannel)) throw Error("Unbekannte Gesprächssituation");
  const text=String(value||"").trim();
  if(text.length<3||text.length>500) throw Error("Bitte 3 bis 500 Zeichen eingeben.");
  const id=crypto.randomUUID();
  serviceBusy=true;
  draw();
  try {
    if(REMOTE) {
      const response=await fetch(API+"/api/sessions/"+encodeURIComponent(r.id)+"/service-chat?token="+encodeURIComponent(tokenFor(r)),{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,channel:serviceChannel,text,locale:guestLocale}),
      });
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"Gespräch vorübergehend nicht verfügbar");
      snapshot=result;
    } else {
      const entry=localEntry(r.id);
      if(!entry || entry.candidateToken!==tokenFor(r)) throw Error("UNAUTHORIZED");
      entry.session=appendAction(entry.session,{id,type:"service_message",text,channel:serviceChannel,locale:guestLocale},"candidate");
      const reply=scriptedServiceResponse(serviceChannel,guestLocale,deriveState(entry.session.events));
      entry.session=appendAction(entry.session,{id:"service_"+id,type:"service_reply",text:reply,channel:serviceChannel,locale:guestLocale,source:"scripted"},"service");
      localStorage.setItem(STORE+r.id,JSON.stringify(entry));
      channel?.postMessage({id:r.id});
      snapshot=localSnapshot(r.id,tokenFor(r));
    }
    const field=document.getElementById("service-chat-"+serviceChannel);
    if(field)field.value="";
    studioDrafts["service-chat-"+serviceChannel]="";
  } finally {
    serviceBusy=false;
    draw();
  }
}
function connect(r) {
  if (socket) { socket.close(); socket = null; }
  if (!REMOTE || !r.id || !tokenFor(r)) return;
  const url = API.replace(/^http/, "ws") + "/api/sessions/" + r.id + "/stream?token=" + encodeURIComponent(tokenFor(r));
  try {
    socket = new WebSocket(url);
    socket.onmessage = ev => {
      const payload = JSON.parse(ev.data);
      if (payload.type === "snapshot" && current().id === r.id) { snapshot = payload.data; draw(); }
    };
    socket.onclose = () => { /* Refresh works even when streaming is unavailable. */ };
  } catch { /* REST snapshot remains available. */ }
}
async function navigate() {
  const r = current(), requestId = ++refreshId;
  if (r.id !== lastStudioSession) {
    lastStudioSession = r.id;
    studioTab = "guest";
    replaySequence=null;
    for (const id of Object.keys(studioDrafts)) delete studioDrafts[id];
  }
  if (socket) { socket.close(); socket = null; }
  if (r.view === "dashboard") { snapshot = null; draw(); return; }
  snapshot = null;
  draw();
  try {
    const result = await getSnapshot(r);
    if (requestId !== refreshId) return;
    snapshot = result;
    draw();
    connect(r);
  } catch (e) { if (requestId === refreshId) { notification = e.message; draw(); } }
}
async function refresh() {
  const r = current(); if (!r.id || !tokenFor(r)) return;
  try { snapshot = await getSnapshot(r); draw(); } catch {}
}
function tag(text, kind = "") { return `<span class="tag ${kind}">${safe(text)}</span>`; }
function icon(name) {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
    play: '<path d="m9 6 9 6-9 6z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-1.6 1.6M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7L12.6 19"/>',
    sparkle: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18"/>',
    file: '<path d="M6 2h8l5 5v15H6zM14 2v6h5M9 13h7M9 17h7"/>',
  };
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.sparkle}</svg>`;
}
function header(r) {
  const coach = active?.id && active?.coachToken ? href("control",active.id,active.coachToken) : "#/dashboard";
  const report = active?.id && active?.coachToken ? href("report",active.id,active.coachToken) : "#/dashboard";
  return `<header class="topbar"><a class="brand" href="#/dashboard" aria-label="SKILLPRINT LIVE"><span class="brand-mark">S<span class="brand-star">✦</span></span><span class="brand-name"><b>SKILLPRINT</b><span>LIVE</span></span></a><nav aria-label="Hauptnavigation"><a href="#/dashboard" class="${r.view==="dashboard"?"active":""}">Übersicht</a><a href="${coach}" class="${r.view==="control"?"active":""}">Control Room</a><a href="${report}" class="${r.view==="report"?"active":""}">Evidence Report</a></nav><span class="header-right">${tag(!REMOTE?"LOKALE VORSCHAU":apiHealth==="online"?"BACKEND ONLINE":apiHealth==="checking"?"VERBINDUNG WIRD GEPRÜFT":"BACKEND OFFLINE",apiHealth==="online"?"connected":apiHealth==="offline"?"live":"muted")}</span></header>`;
}
function sidebar(r) {
  const selected = r.view;
  const coach = active?.id && active?.coachToken ? href("control",active.id,active.coachToken) : "#/dashboard";
  const report = active?.id && active?.coachToken ? href("report",active.id,active.coachToken) : "#/dashboard";
  return `<aside class="sidebar"><p class="eyebrow">WORKSPACE / 01</p><a class="nav-item ${selected==="dashboard"?"chosen":""}" href="#/dashboard"><span class="nav-glyph">◫</span> Übersicht</a><a class="nav-item ${selected==="control"?"chosen":""}" href="${coach}"><span class="nav-glyph">◉</span> Live Control Room</a><a class="nav-item ${selected==="report"?"chosen":""}" href="${report}"><span class="nav-glyph">▤</span> Evidence Report</a><div class="sidebar-bottom"><span class="tiny-orbit">✳</span><p>Evidence over intuition.</p><small>ENGINE / HOTEL V1.2</small></div></aside>`;
}
function footer() { return `<footer class="footer"><span>SKILLPRINT LIVE</span><span>Demo · Nur fiktive Daten</span></footer>`; }
function dashboard() {
  const hasSession = Boolean(active?.id && active?.coachToken);
  return \`<div class="dashboard calm-dashboard">
    <section class="calm-hero">
      <div class="calm-hero-content">
        <p class="eyebrow accent">SKILLPRINT LIVE · HOTEL FRONT OFFICE</p>
        <h1>Zeigen, was jemand <em>wirklich kann.</em></h1>
        <p>Ein praktischer Hoteltest. Live beobachten. Entscheidungen nachvollziehen.</p>
        <button class="primary calm-primary" data-action="create-advanced" aria-label="Live Multitasking Demo starten">Demo starten \${icon("arrow")}</button>
        \${hasSession?\`<div class="calm-resume"><span>Letzte Demo</span><a href="\${href("control",active.id,active.coachToken)}">Fortsetzen \${icon("arrow")}</a><button class="outline" data-action="copy-candidate">Kandidatenlink kopieren</button></div>\`:""}
      </div>
      <div class="calm-hero-art" aria-hidden="true"><div class="calm-hotel-symbol">H</div><span>HOTEL AURORA</span><div class="calm-hero-strokes"><i></i><i></i><i></i></div></div>
    </section>
    <section class="calm-how">
      <h2>So funktioniert die Demo</h2>
      <div class="calm-three">
        <div><span>01</span><h3>Test starten</h3><p>Kandidatenlink öffnen.</p></div>
        <div><span>02</span><h3>Live beobachten</h3><p>Entscheidungen und Gespräche sehen.</p></div>
        <div><span>03</span><h3>Belege prüfen</h3><p>Jeden Schritt im Bericht wiederfinden.</p></div>
      </div>
    </section>
    <details class="calm-details calm-dashboard-extra"><summary>Weitere Möglichkeiten <span>Details anzeigen</span></summary>
      <p>Der Test ist eine Demo mit fiktiven Hotelgästen. Es werden keine echten Bewerberdaten benötigt.</p>
      <button class="outline" data-action="create">Einfache Rechnungssimulation starten</button>
      <p class="calm-disclaimer">Die Ergebnisse sind nicht als wissenschaftlich validierte Eignungsdiagnostik zu verstehen.</p>
    </details>
  </div>\`;
}
function guestMessage(state) {
  return state.guestReply || (state.asked ? "Ich habe nur einmal gefrühstückt. Bitte prüfen Sie die doppelte Berechnung." : OPENING.de);
}
function guestChatPanel(events, state) {
  const items = [
    {actor:"guest",payload:{text:OPENING[guestLocale],source:"scripted"}},
    ...events.filter(e => e.type === "candidate_message" || e.type === "guest_message"),
  ];
  const pending = state.candidateMessages > state.guestMessages;
  return `<div class="dialogue-toolbar">
    <div><span class="dialogue-live"><i></i> LIVE ROLEPLAY</span><span class="dialogue-identity">Lena Weber · Hotelgast</span></div>
    <label for="guest-locale">Gesprächssprache</label>
    <select id="guest-locale" aria-label="Gesprächssprache auswählen">
      <option value="de" ${guestLocale==="de"?"selected":""}>Deutsch</option>
      <option value="tr" ${guestLocale==="tr"?"selected":""}>Türkçe</option>
      <option value="en" ${guestLocale==="en"?"selected":""}>English</option>
    </select>
  </div>
  <div class="dialogue-messages" role="log" aria-label="Gesprächsverlauf" aria-live="polite">
    ${items.map(e => `<div class="dialogue-bubble ${e.actor==="guest"?"guest":"candidate"}">
      <span>${e.actor==="guest"?"LENA WEBER":"SIE"} ${e.payload?.source==="scripted"?"· REGELBASIERT":e.payload?.source==="ai"?"· AI":""}</span>
      <p>${safe(e.payload?.text)}</p>
    </div>`).join("")}
    ${pending?`<div class="dialogue-bubble guest"><span>LENA WEBER</span><p>Antwort wird vorbereitet …</p></div>`:""}
  </div>
  <div class="chat-composer"><label class="field-label" for="guest-chat">Antwort oder Rückfrage an den Gast</label>
    <textarea id="guest-chat" maxlength="500" rows="2" placeholder="Guten Tag Frau Weber, was stimmt an der Rechnung nicht?" ${state.replied || state.candidateMessages>=12 || pending || chatBusy?"disabled":""}></textarea>
    <div class="chat-actions"><small>Max. 12 Nachrichten · KI-Antworten werden nicht als Eignungsurteil bewertet</small>
    <button class="secondary" data-action="chat" ${state.replied || state.candidateMessages>=12 || pending || chatBusy?"disabled":""}>Nachricht senden ${icon("arrow")}</button></div>
  </div>`;
}
function candidateView() {
  if (!snapshot) return loading();
  if (snapshot.role !== "candidate") return denied("Für die Aufgabenansicht wird der separate Kandidatenlink benötigt.");
  if (snapshot.mode === "multitask") {
    return renderFrontDeskStudio(snapshot,{
      activeTab:studioTab,
      renderChat:()=>guestChatPanel(snapshot.events,snapshot.state),
      serviceLocale:guestLocale,serviceBusy,
      safe,euro,fmt
    });
  }
  const s = snapshot.state;
  const actions = invoiceActionStates(s);
  return `<div class="candidate-page">
    <div class="page-heading"><div><p class="eyebrow">ASSESSMENT / FRONT OFFICE AGENT</p><h1>Ihr praktischer Arbeitstest</h1><p>Ein simuliertes Gästegespräch mit einer fehlerhaften Rechnung. Arbeiten Sie so, wie Sie es im Hotel tun würden.</p></div>${tag(snapshot.status==="completed"?"ABSCHLOSS ERFOLGT":"SIMULATION LÄUFT",snapshot.status==="completed"?"connected":"live")}</div>
    ${missionProgress(snapshot.events,snapshot.mode)}
    ${snapshot.mode==="multitask"?multitaskBanner(s):""}
    <div class="candidate-grid">
      <div class="candidate-main">
        <section class="panel client-conversation" id="guest-contact"><div class="panel-top"><div><p class="eyebrow">01 / GÄSTEKONTAKT</p><h2>Nachricht von Lena Weber</h2></div><span class="avatar">LW</span></div>
          ${guestChatPanel(snapshot.events,s)}
          <div class="action-grid">${actions.map(a=>`<button class="action-tile ${a.done?"is-done":a.disabled?"is-blocked":""}" data-step="${a.type}" ${a.disabled?"disabled":""}><span>${a.done?"✓":a.disabled?"·":"＋"}</span>${a.label}</button>`).join("")}</div>
        </section>
        ${snapshot.mode==="multitask"?multitaskWorkspace(s):""}
        <section class="panel" id="invoice-work"><div class="panel-top"><div><p class="eyebrow">02 / RECHNUNG</p><h2>Rechnungsprüfung</h2></div>${tag(s.corrected?"KORRIGIERT":s.opened?"IN BEARBEITUNG":"GESCHÜTZT",s.corrected?"connected":"muted")}</div>
          ${s.opened ? `<div class="invoice"><div class="invoice-top"><b>HOTEL AURORA</b><span>RECHNUNG / ${SCENARIO.booking}</span></div><div class="invoice-row"><span>Übernachtung</span><b>180,00 €</b></div><div class="invoice-row"><span>Frühstück</span><b>20,00 €</b></div><div class="invoice-row ${s.compared?"flagged":""}"><span>Frühstück (erneut)</span><b>20,00 €</b></div><div class="invoice-row"><span>Servicepauschale</span><b>20,00 €</b></div><div class="invoice-total"><span>Rechnungsbetrag ${s.corrected?"(korrigiert)":""}</span><strong>${euro(s.corrected?SCENARIO.correct:SCENARIO.billed)}</strong></div></div>` : `<div class="locked"><div class="locked-icon">⌑</div><h3>Rechnung noch geschlossen</h3><p>Prüfen Sie zuerst die Identität, bevor Sie personenbezogene Rechnungsdaten ansehen. Die Demo protokolliert auch abweichende Entscheidungen.</p></div>`}
          <div class="input-row"><label for="amount">Korrigierten Gesamtbetrag eingeben</label><div class="amount-line"><input id="amount" type="number" step="0.01" min="0" placeholder="z. B. 220.00" ${!s.compared||s.replied?"disabled":""}/><button class="secondary" data-step="correct_invoice" ${!s.compared||s.replied?"disabled":""}>Korrektur speichern</button></div><small>Nur die fachlich korrekte Änderung wird in der Rubrik berücksichtigt.</small></div>
        </section>
        <section class="panel" id="reply-work"><div class="panel-top"><div><p class="eyebrow">03 / ABSCHLUSS</p><h2>Antwort an den Gast</h2></div></div>
          ${s.replied ? `<div class="completed-reply">${icon("check")} <p>${safe(s.replyText)}</p></div>` : `<label class="field-label" for="guest-reply">Dokumentierte Antwort</label><textarea id="guest-reply" rows="4" placeholder="Guten Tag Frau Weber, ich habe Ihre Rechnung geprüft ..."></textarea><div class="form-actions"><button class="outline" data-step="escalate">Fachlich eskalieren</button><button class="primary" data-step="submit_reply" ${!s.opened?"disabled":""}>Antwort abgeben ${icon("arrow")}</button></div>`}
        </section>
      </div>
      <aside class="candidate-rail"><div class="rail-card"><p class="eyebrow">IHRE ARBEITSSITUATION</p><h3>Front Office / Morgenservice</h3><p>Ein Gast reklamiert eine Rechnung. Hinterfragen Sie den Sachverhalt, prüfen Sie die Dokumente und dokumentieren Sie Ihre Lösung.</p><div class="rail-divider"></div><div class="rail-stat"><span>Buchungsreferenz</span><b>${SCENARIO.booking}</b></div><div class="rail-stat"><span>Zimmer</span><b>${SCENARIO.room}</b></div><div class="rail-stat"><span>Anspruch</span><b>Fachlich korrekt handeln</b></div></div><div class="privacy-note">${icon("shield")} <p>Nur Aktionen innerhalb dieses Tests werden erfasst. Keine Kamera, kein Mikrofon, keine Analyse von Emotionen oder persönlichen Eigenschaften.</p></div>${snapshot.status==="completed" ? `<div class="success-rail"><b>Test beendet</b><p>Ihre Antwort wurde gespeichert. Ein Mensch prüft die Ergebnisse.</p></div>` : ""}</aside>
    </div>
    ${missionDock(snapshot.events,snapshot.mode)}
  </div>`;
}
function eventLine(e, interactive = false) {
  const actor = e.actor === "candidate" ? "KANDIDAT" : e.actor === "guest" ? "KI-GAST" : e.actor === "service" ? "SERVICE-ROLLE" : e.actor === "system" ? "SITUATION" : "BEOBACHTER";
  const detail = e.type === "correct_invoice" ? " · " + euro(e.payload.amount) : e.payload?.text ? " · " + safe(e.payload.text.slice(0,120)) : e.payload?.description ? " · " + safe(e.payload.description) : "";
  return `<${interactive?"button":"div"} class="timeline-event ${chosenEvidence===e.id?"highlight":""}" ${interactive?'data-evidence="'+safe(e.id)+'"':""}><span class="timeline-marker"></span><span class="event-time">${fmt(e.at)}</span><span class="event-label"><b>${safe(ACTION_LABELS[e.type] || e.type)}</b><small>${actor}${detail}</small></span></${interactive?"button":"div"}>`;
}
function mirror(s) {
  const steps = [
    ["Gast kontaktiert",s.asked], ["Identität verifiziert",s.verified],["Rechnung geöffnet",s.opened],["Positionen verglichen",s.compared],["Betrag korrigiert",s.corrected],["Antwort gesendet",s.replied]
  ];
  return `<div class="mirror"><div class="mirror-top"><span>SIMULIERTE KANDIDATENANSICHT</span><span class="light-dot">● LIVE</span></div><div class="mirror-inner"><div class="mirror-guest"><span class="avatar small">LW</span><div><small>GAST / LENA WEBER</small><p>${safe(guestMessage(s))}</p></div></div><div class="mirror-steps">${steps.map(([label,on],i)=>`<div class="mirror-step ${on?"done":""}"><span>${on?"✓":String(i+1).padStart(2,"0")}</span>${label}</div>`).join("")}</div><div class="mirror-invoice"><span>RECHNUNGSSTAND</span><b>${s.opened?euro(s.corrected?220:240):"Nicht geöffnet"}</b></div></div></div>`;
}
function control() {
  if (!snapshot) return loading();
  if (snapshot.role !== "coach") return denied("Dieser Bereich ist nur über den Beobachterlink erreichbar.");
  const s=snapshot.state,report=snapshot.report,finished=snapshot.status==="completed";
  const reportUrl=href("report",snapshot.id,tokenFor(current()));
  const liveEvents=snapshot.events.slice(-4).reverse();
  return \`<div class="control-page calm-control">
    <div class="page-heading calm-page-heading">
      <div><p class="eyebrow">HOTEL AURORA · \${safe(snapshot.id)}</p><h1>Control Room</h1><p>Verfolgen Sie die Arbeit live. Jeder Schritt bleibt nachvollziehbar.</p></div>
      <div class="heading-controls">
        \${tag(finished?"Abgeschlossen":"Live",finished?"connected":"live")}
        <button class="secondary" data-action="copy-candidate">\${icon("link")} Kandidatenlink</button>
      </div>
    </div>
    <div class="calm-control-top">
      <div class="calm-status-line"><span><i class="calm-live-dot"></i> \${finished?"Test beendet":"Test läuft"}</span><b>\${snapshot.events.length} Ereignisse</b><a href="\${reportUrl}">Bericht ansehen \${icon("arrow")}</a></div>
      <section class="panel calm-observer-main">
        <div class="panel-top"><div><p class="eyebrow">LIVE ÜBERSICHT</p><h2>Was passiert gerade?</h2></div></div>
        \${snapshot.mode==="multitask"?renderStudioObserver(snapshot,{safe,fmt}):mirror(s)}
        \${snapshot.mode==="multitask"&&s.opened?\`<details class="calm-details calm-observer-drawing" data-panel="live-drawing" \${openPanels.has("live-drawing")?"open":""}><summary>Markierungen auf der Rechnung ansehen <small>\${s.drawingCount} Linien</small></summary><div class="lab-observer-live-document">\${renderDrawingDocument(snapshot.events,false)}</div></details>\`:""}
      </section>
    </div>
    <section class="calm-recent">
      <div class="calm-section-header"><div><p class="eyebrow">EREIGNISSE</p><h2>Letzte Aktionen</h2></div><span>\${snapshot.events.length} gesamt</span></div>
      \${liveEvents.length?\`<div class="calm-feed">\${liveEvents.map(e=>eventLine(e,true)).join("")}</div>\`:\`<p class="calm-empty">Noch keine Aktion. Öffnen Sie den Kandidatenlink auf einem zweiten Gerät.</p>\`}
      <details class="calm-details" data-panel="control-all-events" \${openPanels.has("control-all-events")?"open":""}>
        <summary>Alle Ereignisse anzeigen <small>\${snapshot.events.length}</small></summary>
        <div class="event-list calm-expanded-feed">\${snapshot.events.slice().reverse().map(e=>eventLine(e,true)).join("")}</div>
      </details>
    </section>
    <div class="calm-control-next"><div><h2>\${finished?"Test abgeschlossen":"Bereit zur Auswertung?"}</h2><p>\${finished?"Der Bericht zeigt die Schritte und ihre Belege.":"Der Bericht ist jederzeit verfügbar; Bewertungen erst nach Abschluss."}</p></div><a class="primary" href="\${reportUrl}">Evidence Report \${icon("arrow")}</a></div>
    <details class="calm-details calm-tools" data-panel="control-tools" \${openPanels.has("control-tools")?"open":""}>
      <summary>Beobachternotiz und Bewertungsdetails <small>Optional</small></summary>
      \${report.multitask?multitaskControl(s,report.multitask,finished):""}
      <div class="control-lower"><section class="panel rubric-panel"><div class="panel-top"><div><h2>Bewertungsübersicht</h2></div></div>
        \${finished?\`<div class="rubric-mini">\${report.criteria.map(c=>\`<div class="rubric-mini-row"><span>\${safe(c.title)}</span><div class="mini-track"><i style="width:\${c.points/2*100}%"></i></div><b>\${c.points} / 2</b></div>\`).join("")}</div>\`:'<p>Die Rubrik wird nach Abschluss angezeigt.</p>'}
      </section><section class="panel note-panel"><div class="panel-top"><div><h2>Beobachtung notieren</h2></div></div>
        <label class="field-label" for="observer-note">Konkrete Handlung dokumentieren</label><textarea id="observer-note" placeholder="Was haben Sie beobachtet?" rows="3"></textarea>
        <button class="secondary" data-action="note">Notiz speichern</button>
      </section></div>
    </details>
  </div>\`;
}
function reportView() {
  if (!snapshot) return loading();
  if (snapshot.role !== "coach") return denied("Nur autorisierte Beobachter können den Ergebnisbericht öffnen.");
  const report = snapshot.report;
  const reportReady=snapshot.status==="completed";
  const selected = snapshot.events.find(e=>e.id===chosenEvidence);
  return `<div class="report-page"><div class="page-heading"><div><p class="eyebrow">EVIDENCE REPORT / ${safe(snapshot.id)}</p><h1>Jede Aussage. <em>Ein Beleg.</em></h1><p>Die Rubrik ist eine vorläufige Demonstration. Die Entscheidung über Eignung oder Einstellung liegt ausschließlich beim Menschen.</p></div><div class="heading-controls"><button class="outline" data-action="print">${icon("file")} Drucken / PDF</button><button class="secondary" data-action="approve" ${snapshot.status!=="completed"||snapshot.reviewStatus==="approved"?"disabled":""}>${icon("check")} ${snapshot.reviewStatus==="approved"?"Freigabe erteilt":"Fachlich freigeben"}</button></div></div>
    <div class="report-hero"><div><p class="eyebrow">BEOBACHTETE LEISTUNG / DEMO</p><div class="score-number">${reportReady?report.total:"—"}<span>${reportReady?" / 100":" · Nach Abschluss"}</span></div><p>Gewichteter Aufgabenwert, keine Eignungswahrscheinlichkeit.</p></div><div class="report-status"><div class="status-ribbon"><span>REPORT STATUS</span>${tag(snapshot.reviewStatus==="approved"?"HUMAN REVIEWED":"HUMAN REVIEW REQUIRED",snapshot.reviewStatus==="approved"?"connected":"gold")}</div><div class="status-ribbon"><span>JOB FAMILY</span><strong>HOTEL FRONT OFFICE</strong></div><div class="status-ribbon"><span>RUBRIC VERSION</span><strong>${safe(snapshot.rubricVersion)}</strong></div><div class="status-ribbon"><span>EVIDENCE EVENTS</span><strong>${report.evidenceCount}</strong></div></div></div>
    <div class="report-grid"><section class="panel"><div class="panel-top"><div><p class="eyebrow">01 / BEWERTUNGSMATRIX</p><h2>Kriterien mit Belegverknüpfung</h2></div></div><div class="criterion-list">${report.criteria.map(c=>`<article class="criterion"><div class="criterion-header"><div><h3>${safe(c.title)}</h3><span>GEWICHT ${c.weight}%</span></div><strong>${reportReady?c.points+" / 2":"Ausstehend"}</strong></div><p>${safe(c.reason)}</p><div class="criterion-footer"><span>${c.weighted} gewichtete Punkte</span>${c.evidence.length?`<button class="evidence-link" data-evidence="${safe(c.evidence[0])}">${icon("link")} Beleg öffnen · ${c.evidence.length} Ereignis(se)</button>`:"<span class='no-evidence'>Nicht beurteilbar / kein Beleg</span>"}</div></article>`).join("")}</div></section>
    <aside class="panel report-timeline"><div class="panel-top"><div><p class="eyebrow">02 / REPLAY INDEX</p><h2>Zeitgestempelte Handlungen</h2></div></div><div class="event-list">${snapshot.events.length?snapshot.events.map(e=>eventLine(e,true)).join(""):"<p>Keine Ereignisse vorhanden.</p>"}</div>${selected?`<div class="evidence-detail"><p class="eyebrow accent">AUSGEWÄHLTER BELEG</p><h3>${safe(ACTION_LABELS[selected.type]||selected.type)}</h3><p>${fmt(selected.at)} · ${safe(selected.actor)} · Event #${selected.sequence}</p><pre>${safe(JSON.stringify(selected.payload,null,2))}</pre></div>`:"<div class='evidence-detail placeholder'>Klicken Sie auf einen Rubrik-Beleg oder einen Timeline-Eintrag, um die Originalaktion zu sehen.</div>"}</aside></div>
    ${report.multitask?multitaskReport(report.multitask):""}
    ${snapshot.mode==="multitask"?renderReplayWidget(snapshot.events,replaySequence??snapshot.events.at(-1)?.sequence??0):""}
    ${snapshot.mode==="multitask"?renderReportAppendix(snapshot.events):""}
    <div class="warning-banner">${icon("shield")}<p><b>Verantwortungsvolle Bewertung.</b> Kein Emotion-Scoring, keine automatisierte Einstellung oder Ablehnung, kein Zugriff auf private Apps und keine Aussage über allgemeine Intelligenz oder Persönlichkeit. Fachliche Validierung, Datenschutzprüfung und echte Nutzerabnahme stehen noch aus.</p></div>
  </div>`;
}
function loading() { return '<div class="loading-screen"><div class="loader"></div><h2>Sitzung wird geladen</h2><p>Die freigegebenen Testdaten werden abgerufen.</p></div>'; }
function denied(text) { return `<div class="loading-screen"><div class="error-symbol">!</div><h2>Zugriff nicht möglich</h2><p>${safe(text)}</p><a class="primary" href="#/dashboard">Zur Übersicht</a></div>`; }
function draw() {
  const r = current();
  let body = r.view === "dashboard" ? dashboard() : r.view === "candidate" ? candidateView() : r.view === "control" ? control() : r.view === "report" ? reportView() : denied("Unbekannter Bereich");
  const isCandidate = r.view === "candidate";
  const editable = {};
  const focused = document.activeElement?.id;
  for (const id of ["guest-chat","guest-reply","observer-note","amount","service-chat-arrival","service-chat-phone"]) {
    const input = document.getElementById(id);
    if (input && "value" in input) {
      editable[id]=input.value;
      if (r.view === "candidate" && snapshot?.mode === "multitask") studioDrafts[id]=input.value;
    }
  }
  root.innerHTML = `${header(r)}<div class="app-grid">${isCandidate?"":sidebar(r)}<main class="${isCandidate?"full-width":""}">${apiHealth==="offline"?'<div class="notice" role="alert">Realtime-Backend nicht erreichbar. Bitte Cloudflare Worker prüfen.</div>':""}${notification?`<div class="notice" role="alert">${safe(notification)} <button data-action="dismiss">×</button></div>`:""}${body}${footer()}</main></div>`;
  const restore = r.view === "candidate" && snapshot?.mode === "multitask" ? studioDrafts : editable;
  for (const [id,value] of Object.entries(restore)) {
    const input = document.getElementById(id);
    if (input && !input.disabled) input.value=value;
  }
  if (focused && document.getElementById(focused) && editable[focused] !== undefined) {
    document.getElementById(focused).focus({preventScroll:true});
  }
}
async function onClick(event) {
  const element = event.target.closest("[data-studio-tab], [data-action], [data-step], [data-evidence], [data-scroll-to], [data-learning-instruction], [data-learning-choice], [data-replay-nav]");
  if (!element) return;
  if (element.hasAttribute("data-replay-nav")) {
    const latest=snapshot?.events.at(-1)?.sequence??0;
    const from=replaySequence??latest;
    replaySequence=Math.max(0,Math.min(latest,from+Number(element.dataset.replayNav)));
    draw();document.getElementById("evidence-replay")?.scrollIntoView({block:"nearest"});return;
  }
  if (element.hasAttribute("data-learning-instruction") || element.hasAttribute("data-learning-choice")) {
    try {
      if(element.hasAttribute("data-learning-instruction")) await sendAction(current(),{id:crypto.randomUUID(),type:"learning_instruction"});
      else await sendAction(current(),{id:crypto.randomUUID(),type:"learning_response",phase:element.dataset.learningPhase,choice:Number(element.dataset.learningChoice)});
    } catch(e){notification=e.message||"Lernaufgabe konnte nicht gespeichert werden";draw();}
    return;
  }
  if (element.dataset.studioTab) {
    const next=studioActiveTab(element.dataset.studioTab);
    if (next !== studioTab) { studioTab=next; draw(); }
    return;
  }
  if (element.dataset.scrollTo) {
    document.getElementById(element.dataset.scrollTo)?.scrollIntoView({behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});
    return;
  }
  if (element.dataset.evidence) {
    chosenEvidence = element.dataset.evidence;
    const picked=snapshot?.events.find(e=>e.id===chosenEvidence);
    replaySequence=picked?.sequence??replaySequence;
    draw();
    (document.querySelector("#evidence-replay")||document.querySelector(".evidence-detail"))?.scrollIntoView({ behavior:"smooth", block:"nearest" });
    return;
  }
  const action = element.dataset.action;
  const r = current();
  try {
    notification = "";
    if (action === "create" || action === "create-advanced") { element.disabled = true; await startSession(action==="create-advanced"?"multitask":"classic"); return; }
    if (action === "chat") {
      await sendGuestChat(r,document.getElementById("guest-chat")?.value || "");return;
    }
    if (action === "service-chat") {
      const channel=element.dataset.channel;
      await sendServiceChat(r,channel,document.getElementById("service-chat-"+channel)?.value||"");
      return;
    }
    if (action === "dismiss") { notification = ""; draw(); return; }
    if (action === "copy-candidate") {
      if (!active?.candidateToken) throw Error("Bitte zuerst eine Sitzung starten.");
      const value = fullURL("candidate",active.id,active.candidateToken);
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else window.prompt("Kandidatenlink kopieren",value);
      notification = REMOTE ? "Kandidatenlink kopiert — auf anderen Geräten verwendbar." : "Link kopiert — lokale Vorschau funktioniert nur in diesem Browser.";
      draw(); return;
    }
    if (action === "print") { window.print(); return; }
    if (action === "approve") { await sendAction(r,{},true); return; }
    if (action === "note") {
      await sendAction(r,{ type:"observer_note", text:document.getElementById("observer-note")?.value || "", id:crypto.randomUUID() }); return;
    }
    if (element.dataset.step) {
      const step = element.dataset.step;
      const payload = { type:step, id:crypto.randomUUID() };
      if (step === "correct_invoice") payload.amount = document.getElementById("amount")?.value;
      if (step === "submit_reply") payload.text = document.getElementById("guest-reply")?.value;
      await sendAction(r,payload);
      if (step === "correct_invoice") studioDrafts.amount = "";
      if (step === "submit_reply") studioDrafts["guest-reply"] = "";
      return;
    }
  } catch (e) { notification = e.message || "Aktion fehlgeschlagen"; draw(); }
}

// Pointer Events are supported by iPad Pencil, touchscreens and desktop mice.
// Capture each completed stroke as a bounded, normalized evidence event.
function inkPoint(svg,event) {
  const rect=svg.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  return [Math.round(Math.min(1,Math.max(0,(event.clientX-rect.left)/rect.width))*10000)/10000,
          Math.round(Math.min(1,Math.max(0,(event.clientY-rect.top)/rect.height))*10000)/10000];
}
root.addEventListener("pointerdown",event=>{
  const svg=event.target.closest?.("#lab-ink");
  if(!svg||activeStroke||event.button>0||snapshot?.role!=="candidate"||snapshot?.status==="completed")return;
  const point=inkPoint(svg,event);
  if(!point)return;
  event.preventDefault();
  const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
  line.setAttribute("fill","none");line.setAttribute("stroke","#c55745");
  line.setAttribute("stroke-width","4");line.setAttribute("stroke-linecap","round");line.setAttribute("stroke-linejoin","round");
  svg.querySelector("#lab-current-stroke")?.appendChild(line);
  activeStroke={id:event.pointerId,svg,line,points:[point]};
  svg.setPointerCapture(event.pointerId);
});
root.addEventListener("pointermove",event=>{
  if(!activeStroke||event.pointerId!==activeStroke.id)return;
  const point=inkPoint(activeStroke.svg,event);
  const last=activeStroke.points.at(-1);
  if(!point||Math.hypot(point[0]-last[0],point[1]-last[1])<0.004)return;
  if(activeStroke.points.length<100)activeStroke.points.push(point);
  activeStroke.line.setAttribute("points",activeStroke.points.map(p=>(p[0]*720)+","+(p[1]*360)).join(" "));
});
async function finishInk(event,cancel=false) {
  if(!activeStroke||event.pointerId!==activeStroke.id)return;
  const drawing=activeStroke;activeStroke=null;
  try {if(drawing.svg.hasPointerCapture(event.pointerId))drawing.svg.releasePointerCapture(event.pointerId);}catch{}
  if(cancel||drawing.points.length<2){drawing.line.remove();return;}
  try {
    await sendAction(current(),{id:crypto.randomUUID(),type:"drawing_stroke",points:drawing.points});
  } catch(e){drawing.line.remove();notification=e.message||"Zeichnung konnte nicht gespeichert werden";draw();}
}
root.addEventListener("pointerup",event=>{void finishInk(event);});
root.addEventListener("pointercancel",event=>{void finishInk(event,true);});
root.addEventListener("click",onClick);
root.addEventListener("change",e=>{
  if(e.target?.id==="replay-range") {
    replaySequence=Number(e.target.value);
    draw();
  }
});
root.addEventListener("input",e=>{
  if (current().view==="candidate" && snapshot?.mode==="multitask" && ["guest-chat","guest-reply","amount","service-chat-arrival","service-chat-phone"].includes(e.target?.id)) studioDrafts[e.target.id]=e.target.value;
});
root.addEventListener("change",e=>{
  if(["guest-locale","service-locale"].includes(e.target?.id)){
    guestLocale=normalizeLocale(e.target.value);
    sessionStorage.setItem("skillprint:guestLocale",guestLocale);
    draw();
  }
});
root.addEventListener("keydown",e=>{
  const tab=e.target?.closest?.(".fd-tab");
  if (tab && ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)) {
    e.preventDefault();
    const origin=tab.closest(".fd-mobile-tabs")?".fd-mobile-tabs":".fd-desktop-tabs";
    const order=["guest","arrival","phone","invoice","learning","handover"];
    const index=order.indexOf(studioTab);
    studioTab=order[(index+(e.key==="ArrowLeft"||e.key==="ArrowUp"?-1:1)+order.length)%order.length];
    draw();
    root.querySelector(origin+" .fd-tab.fd-tab-active")?.focus();
    return;
  }
  if (["service-chat-arrival","service-chat-phone"].includes(e.target?.id) && e.key==="Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    root.querySelector('[data-action="service-chat"][data-channel="'+e.target.id.slice("service-chat-".length)+'"]')?.click();
  }
  if(e.target?.id==="guest-chat" && e.key==="Enter" && !e.shiftKey && !e.isComposing){
    e.preventDefault();
    root.querySelector("[data-action=chat]")?.click();
  }
});
window.addEventListener("hashchange",navigate);
window.addEventListener("storage",e=>{ if (e.key?.startsWith(STORE)) refresh(); });
channel?.addEventListener("message",e=>{ if (e.data?.id===current().id) refresh(); });
async function checkBackend() {
  if (!REMOTE) return;
  try {
    const response = await fetch(API + "/api/health", { cache:"no-store" });
    const data = await response.json();
    apiHealth = response.ok && data.ok === true ? "online" : "offline";
  } catch { apiHealth = "offline"; }
  draw();
}
navigate();
checkBackend();
