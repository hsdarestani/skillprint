import { MULTITASK_FACTS } from "./engine.js";

// The UI only presents the shared, persisted scenario state. All action validation
// and evidence scoring remain in the domain engine and the Cloudflare Worker.
export function multitaskBanner(state) {
  const m=state.multitask;
  return `<div class="multi-banner"><div><span class="eyebrow accent">LIVE SIMULATION / SERVICE DESK</span><h2>Drei Aufgaben. Ein Empfang.</h2><p>Neue Aufgaben erscheinen während Ihrer Arbeit. Bearbeiten Sie die Warteschlange ohne voreilige Zimmerzusagen.</p></div><div class="multi-metrics"><b>${m.pending}</b><span>offene Unterbrechungen</span></div></div>`;
}
const button=(type,label,enabled,done=false,risk=false)=>`<button class="action-tile ${done?"is-done":risk?"risk-action":""}" data-step="${type}" ${!enabled||done?"disabled":""}><span>${done?"✓":"＋"}</span>${label}</button>`;
export function multitaskWorkspace(s) {
  const m=s.multitask;
  return `<section class="panel multitask-workspace" id="service-queue">
    <div class="panel-top"><div><p class="eyebrow">LIVE SERVICE QUEUE / SITUATIONSÜBUNG</p><h2>Anreise & Telefon</h2></div><span class="tag ${m.pending?"live":"muted"}">${m.pending?"LIVE UNTERBRECHUNGEN":"SIMULATION"}</span></div>
    <div class="multitask-cards">
      <article id="checkin-task" class="task-card ${m.checkinArrived&&!m.checkinResolved?"task-alert":""}">
        <div class="task-label"><span>01 / FRONT DESK</span><span>${!m.checkinArrived?"KOMMT GLEICH":m.checkinResolved?"ERLEDIGT":"GAST WARTET"}</span></div>
        <h3>${m.checkinArrived?"Sofia Demir · Check-in":"Nächste Anreise"}</h3>
        <p>${m.checkinArrived?"Ein Gast erscheint mit Reservierung CK-311. Zimmer 311 darf erst zugeteilt werden, wenn das Housekeeping es freigibt.":"Ein weiterer Gast kommt im Verlauf der laufenden Reklamation an den Empfang."}</p>
        ${m.checkinArrived?`<div class="task-action-grid">
          ${button("welcome_checkin","Gast begrüßen",true,m.checkinWelcomed)}
          ${button("verify_checkin","Buchung abgleichen",m.checkinWelcomed,m.checkinVerified)}
          ${button("offer_wait","Wartebereich & Rückmeldung anbieten",m.checkinVerified&&m.phoneAnswered,m.roomWaiting)}
          ${button("complete_checkin","Fall dokumentieren",m.roomWaiting&&m.phoneAnswered&&m.checkinVerified,m.checkinResolved)}
          ${button("promise_room","Zimmer sofort zusagen (riskant)",!m.roomPromised,false,true)}
        </div>`:""}
      </article>
      <article id="phone-task" class="task-card ${m.phoneRinging&&!m.phoneAnswered?"task-alert":""}">
        <div class="task-label"><span>02 / TELEFON</span><span>${!m.phoneRinging?"NOCH RUHIG":m.phoneAnswered?"BEARBEITET":"ANRUF AKTIV"}</span></div>
        <h3>${m.phoneRinging?"Housekeeping ruft an":"Interne Rückmeldung"}</h3>
        <p>${m.phoneAnswered?"Housekeeping bestätigt: Zimmer 311 ist noch nicht freigegeben. Eine verbindliche Fertigstellungszeit liegt nicht vor.":m.phoneRinging?"Ein Anruf unterbricht die Arbeit. Koordinieren Sie das Telefon und den wartenden Gast.":"Der nächste Arbeitsstrang wird nach weiteren Aktionen aktiviert."}</p>
        ${m.phoneRinging?`<div class="task-action-grid">
          ${button("hold_phone","Anruf höflich halten",!m.phoneAnswered,m.phoneHeld)}
          ${button("answer_phone","Housekeeping antworten",true,m.phoneAnswered)}
          ${button("ignore_phone","Anruf ignorieren (riskant)",!m.phoneAnswered,m.phoneIgnored,false,true)}
        </div>`:""}
      </article>
    </div>
    <p class="queue-notice">Alle Entscheidungen und Unterbrechungen werden als Ereignisse mit Zeitstempel für die manuelle Beurteilung gespeichert.</p>
  </section>`;
}
export function multitaskControl(s,report,finished=false) {
  const m=s.multitask;
  return `<section class="panel multi-control"><div class="panel-top"><div><p class="eyebrow accent">E / MULTITASK EVIDENCE</p><h2>Unterbrechungen & Prioritäten</h2></div><span class="tag ${report.status==="complete"?"connected":"live"}">${report.status==="complete"?"BEARBEITET":"IN ARBEIT"}</span></div>
    <div class="multitask-status-grid">
      <div><small>ANREISE</small><b>${!m.checkinArrived?"Nicht eingetroffen":m.checkinResolved?"Dokumentiert":"Gast wartet"}</b></div>
      <div><small>HOUSEKEEPING</small><b>${!m.phoneRinging?"Noch kein Anruf":m.phoneAnswered?"Zimmerstatus bekannt":"Anruf offen"}</b></div>
      <div><small>ZUSATZRUBRIK (DEMO)</small><b>${finished?report.total+" / 100":"Nach Abschluss"}</b></div>
    </div>
    ${finished?`<div class="rubric-mini">${report.criteria.map(c=>`<div class="rubric-mini-row"><span>${c.title}</span><div class="mini-track"><i style="width:${c.points/2*100}%"></i></div><b>${c.points} / 2</b></div>`).join("")}</div>`:`<p class="fd-scoring-pending">Aufgaben und Entscheidungen werden live erfasst. Die illustrative Bewertung erscheint erst nach Abgabe der gesamten Arbeitsprobe.</p>`}
  </section>`;
}
export function multitaskReport(report) {
  return `<section class="panel multitask-report"><div class="panel-top"><div><p class="eyebrow accent">03 / MULTITASK DECISION REVIEW</p><h2>Unterbrechungen nachvollziehen</h2></div><strong>${report.total} / 100 · Demo</strong></div><div class="multitask-review-grid">
    ${report.criteria.map(c=>`<article class="criterion"><div class="criterion-header"><h3>${c.title}</h3><strong>${c.points} / 2</strong></div><p>${c.reason}</p><div class="criterion-footer"><span>${c.weighted} / ${c.weight} Zusatzpunkte</span>${c.evidence.length?`<button class="evidence-link" data-evidence="${c.evidence.find(id=>!id.startsWith("sys_"))||c.evidence[0]}">Evidenz öffnen · ${c.evidence.length}</button>`:"Keine Belege"}</div></article>`).join("")}
  </div><p class="subtle-note">${report.disclaimer}</p></section>`;
}
