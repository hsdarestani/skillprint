import {journeyProgress} from "./engine.js";

// Persistent navigation only: it never mutates session state or rubric scores.
export function missionProgress(events, mode) {
  const progress=journeyProgress(events,mode);
  return `<div class="candidate-progress mission-progress">
    <div class="progress-top"><b>${mode==="multitask"?"Gesamter Arbeitsablauf":"Fortschritt"}</b><span>${progress.done} / ${progress.total} Schritte</span></div>
    <div class="progress-track" role="progressbar" aria-label="Aufgabenfortschritt" aria-valuemin="0" aria-valuemax="${progress.total}" aria-valuenow="${progress.done}">
      <span style="width:${progress.percentage}%"></span>
    </div>
    ${mode==="multitask" ? `<p class="mission-progress-note">${progress.pendingInterruptions ? `<span class="mission-priority-dot"></span>${progress.pendingInterruptions} offene Unterbrechung${progress.pendingInterruptions===1?"":"en"} · `:""}Rechnung, Check-in und Telefon werden getrennt erfasst.</p>`:""}
  </div>`;
}
export function missionDock(events, mode) {
  if(mode!=="multitask")return "";
  const p=journeyProgress(events,mode);
  const tabs=[
    {id:"guest-contact",label:"Gespräch",symbol:"◌",on:p.segments[0].done>0},
    {id:"checkin-task",label:"Check-in",symbol:"▣",on:p.segments[2].done>=4,urgent:p.segments[2].active},
    {id:"phone-task",label:"Telefon",symbol:"⌁",on:p.segments[3].done>=1,urgent:p.segments[3].active},
    {id:"invoice-work",label:"Rechnung",symbol:"▤",on:p.segments[1].done>=6},
  ];
  return `<nav class="mission-dock" aria-label="Arbeitsbereiche">
    ${tabs.map(t=>`<button type="button" class="mission-tab ${t.on?"mission-done":""}" data-scroll-to="${t.id}" aria-label="Zu ${t.label} wechseln">
      <span class="mission-tab-icon">${t.symbol}${t.urgent?'<i class="mission-notification"></i>':""}</span>
      <span>${t.label}</span>
    </button>`).join("")}
  </nav>`;
}

// Distinguish an action completed by the candidate from one disabled by prerequisites.
export function invoiceActionStates(state) {
  return [
    {type:"verify_identity",label:"Identität prüfen (Demo)",done:state.verified,disabled:state.verified},
    {type:"open_invoice",label:"Rechnung öffnen",done:state.opened,disabled:state.opened},
    {type:"compare_items",label:"Positionen vergleichen",done:state.compared,disabled:!state.opened||state.compared},
  ];
}
