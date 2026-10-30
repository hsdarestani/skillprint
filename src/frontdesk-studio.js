
import { SCENARIO, ACTION_LABELS, journeyProgress } from "./engine.js";
import { renderServiceChat } from "./service-ui.js";
import { renderDrawingPanel,renderLearningPanel } from "./evidence-lab.js";

// A presentation layer only. All decisions still use the existing role-protected,
// ordered event ledger and human-reviewed rubric; no new synthetic achievements.
const TABS = [
  {id:"guest",label:"Gast",icon:"◉"},
  {id:"arrival",label:"Check-in",icon:"▣"},
  {id:"phone",label:"Telefon",icon:"⌁"},
  {id:"invoice",label:"Rechnung",icon:"▤"},
  {id:"learning",label:"Lernen",icon:"◈"},
  {id:"handover",label:"Abschluss",icon:"✓"},
];
export const STUDIO_TABS = TABS.map(x=>x.id);
export function studioActiveTab(value) {
  return STUDIO_TABS.includes(value) ? value : "guest";
}
export function studioTabSignals(state) {
  const m=state.multitask;
  return {
    guest:{done:state.asked,urgent:state.candidateMessages>state.guestMessages},
    arrival:{done:m.checkinResolved,urgent:m.checkinArrived&&!m.checkinResolved},
    phone:{done:m.phoneAnswered,urgent:m.phoneRinging&&!m.phoneAnswered},
    invoice:{done:state.corrected,urgent:false},
    learning:{done:state.learning.completed,urgent:false},
    handover:{done:state.replied,urgent:false},
  };
}
const taskButton=(type,label,ready,done=false,risk=false)=>`<button class="fd-action ${done?"fd-done":risk?"fd-risk":!ready?"fd-unavailable":""}" data-step="${type}" ${!ready||done?"disabled":""}>
  <span class="fd-action-symbol">${done?"✓":risk?"!":ready?"→":"·"}</span><span>${label}</span><span class="fd-action-status">${done?"ERLEDIGT":!ready?"GESPERRT":risk?"RISIKO":""}</span></button>`;
const statusLabel=(done,active)=>done?"BEARBEITET":active?"AKTIV":"BEREIT";
function people(state,active,safe){
  const m=state.multitask;
  const guest = `<button type="button" data-studio-tab="guest" class="fd-person fd-person-guest ${active==="guest"?"fd-selected":""}">
    <div class="fd-avatar fd-avatar-lena">LW</div><div class="fd-person-caption"><strong>Lena Weber</strong><small>Reklamation · Rechnung</small></div><i class="fd-person-dot"></i></button>`;
  const arrival = `<button type="button" data-studio-tab="arrival" class="fd-person ${active==="arrival"?"fd-selected":""} ${m.checkinArrived&&!m.checkinResolved?"fd-attention":""}">
    <div class="fd-avatar fd-avatar-sofia">SD</div><div class="fd-person-caption"><strong>Sofia Demir</strong><small>${!m.checkinArrived?"Anreise erwartet":m.checkinResolved?"Check-in dokumentiert":"Wartet am Empfang"}</small></div><i class="fd-person-dot"></i></button>`;
  return guest+arrival;
}
function station(id,title,detail,icon,active,urgent,done){
  return `<button type="button" data-studio-tab="${id}" class="fd-station ${active===id?"fd-current":""} ${urgent?"fd-ringing":""}">
    <span class="fd-station-icon">${icon}</span><span class="fd-station-text"><b>${title}</b><small>${detail}</small></span>
    <span class="fd-station-state">${done?"✓":urgent?"●":"→"}</span></button>`;
}
function guestPanel(s,renderChat) {
 return `<div class="fd-pane" id="fd-pane-guest"><header class="fd-pane-heading"><div><p class="eyebrow">GÄSTEGESPRÄCH</p><h2>Lena Weber</h2><span class="fd-pane-subtitle">Reklamation · Zimmer 208</span></div></header>
   ${renderChat()}
   <div class="fd-verification">
    <div><b>Identität prüfen</b><p>Vor dem Öffnen der Rechnung.</p></div>
    ${taskButton("verify_identity","Identität prüfen (Demo)",!s.verified&&!s.replied,s.verified)}
   </div>
 </div>`;
}
function arrivalPanel(s,chat,expanded) {
 const m=s.multitask;
 return `<div class="fd-pane" id="fd-pane-arrival"><header class="fd-pane-heading"><div><p class="eyebrow">02 / ANREISE</p><h2>Sofia Demir</h2><span class="fd-pane-subtitle">Reservierung CK-311 · Zimmer 311</span></div><span class="fd-context-chip ${m.checkinArrived&&!m.checkinResolved?"fd-context-warn":""}">${statusLabel(m.checkinResolved,m.checkinArrived)}</span></header>
   ${!m.checkinArrived?`<div class="fd-empty-task"><div class="fd-empty-glyph">⌛</div><h3>Der Gast ist noch unterwegs</h3><p>Beginnen Sie mit Lena Weber.</p><button class="outline" data-studio-tab="guest">Zum Gästegespräch →</button></div>`:
    `<div class="fd-task-story"><div class="fd-story-avatar">SD</div><div><b>Ein Gast wartet am Empfang</b><p>„Guten Tag, ich möchte einchecken. Ist mein Zimmer schon fertig?“</p></div></div>
    <div class="fd-fact-strip"><span>BUCHUNG <b>CK-311</b></span><span>ZIMMER <b>311</b></span><span>STATUS <b class="fd-warn-text">Nicht freigegeben</b></span></div>
    ${chat}
    <p class="fd-system-hint">Sichern Sie Ihre Entscheidung im Buchungssystem.</p>
    <details class="fd-ops-details calm-operations" data-panel="candidate-arrival" ${expanded.has("candidate-arrival")?"open":""}><summary>Aktionen im Buchungssystem <span>Öffnen</span></summary><div class="fd-step-stack">
      ${taskButton("welcome_checkin","Gast begrüßen",true,m.checkinWelcomed)}
      ${taskButton("verify_checkin","Reservierung abgleichen",m.checkinWelcomed,m.checkinVerified)}
      ${taskButton("offer_wait","Wartebereich und Rückmeldung anbieten",m.checkinVerified&&m.phoneAnswered,m.roomWaiting)}
      ${taskButton("complete_checkin","Vorgang dokumentieren",m.roomWaiting&&m.phoneAnswered&&m.checkinVerified,m.checkinResolved)}
    </div></details>
    <details class="fd-risk-details"><summary>Alternative Entscheidung prüfen</summary><p>Sie können ein noch nicht freigegebenes Zimmer zusagen. Diese riskante Entscheidung wird als Fehlerbeleg aufgezeichnet.</p>${taskButton("promise_room","Zimmer sofort zusagen (riskant)",!m.roomPromised,false,true)}</details>`}
 </div>`;
}
function phonePanel(s,chat,expanded) {
 const m=s.multitask;
 return `<div class="fd-pane" id="fd-pane-phone"><header class="fd-pane-heading"><div><p class="eyebrow">03 / INTERNER ANRUF</p><h2>Housekeeping</h2><span class="fd-pane-subtitle">Interne Rückfrage · Zimmer 311</span></div><span class="fd-context-chip ${m.phoneRinging&&!m.phoneAnswered?"fd-context-warn":""}">${statusLabel(m.phoneAnswered,m.phoneRinging)}</span></header>
  ${!m.phoneRinging?`<div class="fd-empty-task"><div class="fd-empty-glyph">⌁</div><h3>Leitung frei</h3><p>Der Anruf erscheint im Laufe des Tests.</p><button class="outline" data-studio-tab="guest">Zum Gästegespräch →</button></div>`:
   `<div class="fd-call-screen ${!m.phoneAnswered?"fd-call-active":""}"><div class="fd-call-mark">⌁</div><p>${m.phoneAnswered?"GESPRÄCH BEENDET":"EINGEHENDER ANRUF"}</p><h3>Housekeeping · Zimmer 311</h3><span>${m.phoneAnswered?"Zimmer noch nicht freigegeben. Keine verbindliche Fertigstellungszeit.":"Die Abteilung möchte den Zimmerstatus klären."}</span></div>
   ${chat}
   <p class="fd-system-hint">Bestätigen Sie anschließend die Telefonaktion.</p>
   <details class="fd-ops-details calm-operations" data-panel="candidate-phone" ${expanded.has("candidate-phone")?"open":""}><summary>Telefonaktion bestätigen <span>Öffnen</span></summary><div class="fd-step-stack">
      ${taskButton("hold_phone","Anruf höflich halten",!m.phoneAnswered,m.phoneHeld)}
      ${taskButton("answer_phone","Anruf beantworten",!m.phoneAnswered,m.phoneAnswered)}
   </div></details>
   <details class="fd-risk-details"><summary>Alternative Entscheidung prüfen</summary><p>Den Anruf ohne Antwort lassen. Die Entscheidung wird als Ereignis dokumentiert.</p>${taskButton("ignore_phone","Anruf ignorieren (riskant)",!m.phoneAnswered&&!m.phoneIgnored,m.phoneIgnored,true)}</details>`}
 </div>`;
}
function invoicePanel(s,euro,events=[],finished=false,expanded=new Set()) {
 return `<div class="fd-pane" id="fd-pane-invoice"><header class="fd-pane-heading"><div><p class="eyebrow">04 / RECHNUNGSSYSTEM</p><h2>Rechnung HT-2048</h2><span class="fd-pane-subtitle">Hotel Aurora · Lena Weber</span></div><span class="fd-context-chip">${s.corrected?"KORRIGIERT":s.opened?"OFFEN":"GESCHÜTZT"}</span></header>
  <div class="fd-invoice-layout">
    ${s.opened?`<div class="fd-paper"><div class="fd-paper-head"><b>HOTEL AURORA</b><small>RECHNUNG HT-2048</small></div>
       <div class="fd-paper-row"><span>Übernachtung</span><b>180,00 €</b></div>
       <div class="fd-paper-row"><span>Frühstück</span><b>20,00 €</b></div>
       <div class="fd-paper-row ${s.compared?"fd-paper-error":""}"><span>Frühstück (erneut)</span><b>20,00 €</b></div>
       <div class="fd-paper-row"><span>Servicepauschale</span><b>20,00 €</b></div>
       <div class="fd-paper-total"><span>GESAMTBETRAG</span><strong>${euro(s.corrected?SCENARIO.correct:SCENARIO.billed)}</strong></div>
     </div>`: `<div class="fd-paper fd-paper-locked"><div class="fd-paper-lock">⌑</div><h3>Rechnung geschützt</h3><p>Die Rechnungsdaten sind noch nicht geöffnet. Die Identitätsprüfung sollte zuerst erfolgen.</p></div>`}
   <div class="fd-step-stack">
      ${taskButton("open_invoice","Rechnung öffnen",!s.opened&&!s.replied,s.opened)}
      ${taskButton("compare_items","Positionen vergleichen",s.opened&&!s.compared&&!s.replied,s.compared)}
      <div class="fd-adjust"><label for="amount">Neuen Rechnungsbetrag eingeben</label><div><input id="amount" type="number" step="0.01" min="0" placeholder="220.00" ${!s.compared||s.replied?"disabled":""}/><button class="secondary" data-step="correct_invoice" ${!s.compared||s.replied?"disabled":""}>Speichern</button></div><small>Die Originalpositionen werden nicht von der KI verändert.</small></div>
   </div>
  </div>
  ${s.opened?`<details class="fd-ops-details calm-ink-toggle" data-panel="candidate-ink" ${expanded.has("candidate-ink")?"open":""}><summary>Rechnung markieren (Stift / Touch) <span>Optional</span></summary>${renderDrawingPanel(events,!finished)}</details>`:""}
 </div>`;
}
function handoverPanel(s,m) {
 const ready=s.opened && (!m.checkinArrived||m.checkinResolved) && (!m.phoneRinging||m.phoneAnswered);
 return `<div class="fd-pane" id="fd-pane-handover"><header class="fd-pane-heading"><div><p class="eyebrow">05 / ABSCHLUSS</p><h2>Schichtübergabe</h2><span class="fd-pane-subtitle">Ergebnis festhalten</span></div><span class="fd-context-chip">${s.replied?"ABGEGEBEN":"ENTWURF"}</span></header>
  <div class="fd-handover-review">
    <div><span>${s.corrected?"✓":"○"}</span><p>Rechnung bearbeitet</p></div>
    <div><span>${m.checkinResolved?"✓":"○"}</span><p>Check-in geklärt</p></div>
    <div><span>${m.phoneAnswered?"✓":"○"}</span><p>Housekeeping kontaktiert</p></div>
  </div>
  <div class="calm-optional-learning"><span>Optional: Lernsequenz</span><button type="button" class="outline" data-studio-tab="learning">Öffnen →</button></div>
  ${s.replied?`<div class="completed-reply"><span>✓</span><p>${s.replyText.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</p></div>`:
   `<div class="fd-handover-form"><label for="guest-reply">Dokumentierte Antwort an Lena Weber</label><textarea id="guest-reply" rows="5" placeholder="Guten Tag Frau Weber, ich habe die Rechnung geprüft ..."></textarea>
   <p>Offene Vorgänge zuerst abschließen.</p>
   <div class="fd-handover-actions"><button class="outline" data-step="escalate">An Vorgesetzte eskalieren</button><button class="primary" data-step="submit_reply" ${!ready?"disabled":""}>Antwort dokumentieren →</button></div></div>`}
 </div>`;
}
function latestEvent(events,safe,fmt) {
 const e=events.filter(x=>x.actor==="candidate"||x.actor==="guest"||x.actor==="system"||x.actor==="service").at(-1);
 if(!e)return `<div class="fd-activity-empty">Die Schicht hat begonnen. Ihre ersten Handlungen erscheinen hier.</div>`;
 const title=e.type==="candidate_message"?"Nachricht an Lena Weber":e.type==="guest_message"?"Antwort von Lena Weber":e.type==="service_reply"?"Antwort von "+(e.payload.channel==="phone"?"Housekeeping":"Sofia Demir"):ACTION_LABELS[e.type]||e.type;
 return `<div class="fd-last-event"><span class="fd-mini-dot"></span><div><b>${safe(title)}</b><small>${fmt(e.at)} · ${e.actor==="system"?"Neue Situation":e.actor==="guest"?"KI-Gast":e.actor==="service"?"Rollenspiel":"Ihre Aktion"}</small></div></div>`;
}
export function renderFrontDeskStudio(snapshot,{activeTab,renderChat,renderProgress,safe,euro,fmt,serviceLocale="de",serviceBusy=false,expandedPanels=new Set()}) {
 const state=snapshot.state,m=state.multitask,tab=studioActiveTab(activeTab);
 const signals=studioTabSignals(state),progress=journeyProgress(snapshot.events,snapshot.mode);
 const chat=channel=>renderServiceChat(snapshot.events,channel,serviceLocale,safe,snapshot.status==="completed",serviceBusy);
 const content={guest:()=>guestPanel(state,renderChat),arrival:()=>arrivalPanel(state,chat("arrival"),expandedPanels),phone:()=>phonePanel(state,chat("phone"),expandedPanels),invoice:()=>invoicePanel(state,euro,snapshot.events,snapshot.status==="completed",expandedPanels),learning:()=>`<button type="button" class="calm-back" data-studio-tab="handover">← Zurück zum Abschluss</button>${renderLearningPanel(snapshot.events,snapshot.status==="completed")}`,handover:()=>handoverPanel(state,m)}[tab]();
 const navigation=()=>TABS.map(t=>`<button type="button" class="fd-tab ${t.id===tab?"fd-tab-active":""} ${signals[t.id].done?"fd-tab-done":""}" data-studio-tab="${t.id}" role="tab" aria-selected="${t.id===tab}" tabindex="${t.id===tab?"0":"-1"}"><span class="fd-tab-icon">${t.icon}</span><span>${t.label}</span>${signals[t.id].urgent?'<i class="fd-alert-pip"></i>':""}</button>`).join("");
 return `<div class="fd-studio">
  <div class="fd-topline"><span>SKILLPRINT <b>LIVE</b> <i> / </i> HOTEL AURORA</span><span class="fd-topline-right"><i></i>${snapshot.status==="completed"?"ASSESSMENT ABGESCHLOSSEN":"PRAKTISCHE ARBEITSPROBE"} · DEMO</span></div>
  <div class="fd-heading"><div><p class="eyebrow">HOTEL FRONT OFFICE / SESSION ${safe(snapshot.id)}</p><h1>Ihr Arbeitsplatz.</h1><p>Bearbeiten Sie die Anliegen im Hotel Aurora.</p></div>
    <div class="fd-score-clock"><strong>${String(progress.done).padStart(2,"0")}<span>/ ${progress.total}</span></strong><small>Erledigt</small><div class="fd-score-track"><i style="width:${progress.percentage}%"></i></div></div></div>
  <div class="fd-scene" aria-label="Interaktiver Hotelempfang">
    <div class="fd-scene-atmosphere"><div class="fd-window fd-window-left"></div><div class="fd-window fd-window-right"></div><div class="fd-scene-sign"><span>H</span><b>AURORA</b></div><div class="fd-lamp fd-lamp-left"></div><div class="fd-lamp fd-lamp-right"></div></div>
    <div class="fd-scene-people">${people(state,tab,safe)}</div>
    <div class="fd-counter"><span>RECEPTION / DESK 01</span><span>${m.pending>0?`<b class="fd-counter-alert">${m.pending} OFFENE ANLIEGEN</b>`:"SERVICE ACTIVE"}</span></div>
    <div class="fd-stations">${station("phone","Housekeeping",m.phoneAnswered?"Status geprüft":m.phoneRinging?"Anruf wartet":"Leitung frei","⌁",tab,m.phoneRinging&&!m.phoneAnswered,m.phoneAnswered)}
    ${station("invoice","Rechnung HT-2048",state.corrected?"Korrigiert":state.opened?"In Prüfung":"Noch geschützt","▤",tab,false,state.corrected)}
    ${station("arrival","Anreise CK-311",m.checkinResolved?"Dokumentiert":m.checkinArrived?"Gast wartet":"Erwartet","▣",tab,m.checkinArrived&&!m.checkinResolved,m.checkinResolved)}</div>
  </div>
  <div class="fd-cockpit">
    <aside class="fd-command-rail"><div class="fd-rail-header"><h2>Aufgaben</h2></div>
       <div class="fd-desktop-tabs" role="tablist" aria-label="Arbeitsbereich auswählen">${navigation()}</div>
       <div class="fd-rail-progress"><span>FORTSCHRITT / ${progress.percentage}%</span><div class="fd-score-track"><i style="width:${progress.percentage}%"></i></div><p>${m.pending>0?`${m.pending} aktuelle Unterbrechung${m.pending>1?"en":""}`:"Keine offenen Unterbrechungen"}</p></div>
       <div class="fd-rail-privacy">◈ <span>Nur Testaktionen werden erfasst.</span></div>
    </aside>
    <section class="fd-work-panel" aria-label="Aktiver Arbeitsbereich"><div class="fd-pane-scroll">${content}</div></section>
    <aside class="fd-activity-rail"><p class="eyebrow">LIVE</p><h3>Letzte Aktion</h3>${latestEvent(snapshot.events,safe,fmt)}
      <div class="fd-activity-list">${snapshot.events.filter(e=>e.actor!=="observer").slice(-5).reverse().map(e=>`<div class="fd-activity-item"><span>●</span><div><b>${safe(ACTION_LABELS[e.type]||e.type)}</b><small>${fmt(e.at)}</small></div></div>`).join("")}</div>
      <div class="fd-activity-footer">Nur fiktive Daten · Manuelle Auswertung.</div>
    </aside>
  </div>
  <nav class="fd-mobile-tabs" role="tablist" aria-label="Arbeitsbereich wechseln">${TABS.filter(t=>t.id!=="learning").map(t=>`<button type="button" class="fd-tab ${t.id===tab?"fd-tab-active":""} ${signals[t.id].done?"fd-tab-done":""}" data-studio-tab="${t.id}" role="tab" aria-selected="${t.id===tab}" tabindex="${t.id===tab?"0":"-1"}"><span class="fd-tab-icon">${t.icon}</span><span>${t.label}</span>${signals[t.id].urgent?'<i class="fd-alert-pip"></i>':""}</button>`).join("")}</nav>
 </div>`;
}
export function renderStudioObserver(snapshot,{safe,fmt}) {
 const state=snapshot.state,m=state.multitask;
 const items=[
  {icon:"◉",title:"Lena Weber",detail:state.replied?"Antwort dokumentiert":state.corrected?"Rechnung korrigiert":state.asked?"Im Gespräch":"Reklamation offen",done:state.replied,active:!state.replied},
  {icon:"▣",title:"Sofia Demir",detail:!m.checkinArrived?"Anreise erwartet":m.checkinResolved?"Check-in dokumentiert":"Gast wartet am Empfang",done:m.checkinResolved,active:m.checkinArrived&&!m.checkinResolved},
  {icon:"⌁",title:"Housekeeping",detail:!m.phoneRinging?"Leitung frei":m.phoneAnswered?"Zimmerstatus bestätigt":"Telefon klingelt",done:m.phoneAnswered,active:m.phoneRinging&&!m.phoneAnswered},
  {icon:"▤",title:"Rechnung",detail:state.corrected?"220 € · korrigiert":state.opened?"240 € · in Prüfung":"Geschützt",done:state.corrected,active:state.opened&&!state.corrected}
 ];
 return `<div class="fd-observer-mirror"><div class="fd-observer-banner"><span><i></i> LIVE SERVICE DESK</span><b>HOTEL AURORA / DEMO</b></div><div class="fd-observer-grid">
 ${items.map(x=>`<div class="fd-observer-tile ${x.active?"fd-observer-active":""}"><span class="fd-observer-icon">${x.icon}</span><div><b>${x.title}</b><p>${x.detail}</p></div><span class="fd-observer-tick">${x.done?"✓":x.active?"●":"○"}</span></div>`).join("")}
 </div><div class="fd-observer-footer"><div><small>LETZTES EREIGNIS</small><b>${safe(ACTION_LABELS[snapshot.events.at(-1)?.type]||"Noch keine Handlung")}</b></div><span>${snapshot.events.length} Events</span></div></div>`;
}
