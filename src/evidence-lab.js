
import {LEARNING_TASKS,deriveLearning,drawingStrokes,replayAt,ACTION_LABELS} from "./engine.js";
const escapeText=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const markup=events=>drawingStrokes(events).map(stroke=>'<polyline data-stroke-id="'+escapeText(stroke.id)+'" points="'+stroke.points.map(p=>(p[0]*720).toFixed(1)+","+(p[1]*360).toFixed(1)).join(" ")+'" fill="none" stroke="#c55745" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>').join("");
export function renderDrawingDocument(events=[],editable=false) {
  return '<div class="lab-document"><div class="lab-document-head"><b>HOTEL AURORA / RECHNUNG HT-2048</b><small>'+drawingStrokes(events).length+' Markierungen</small></div>'
  +'<svg id="'+(editable?"lab-ink":"lab-ink-readonly")+'" class="lab-invoice-svg '+(editable?"lab-ink-editable":"")+'" viewBox="0 0 720 360" role="img" aria-label="Simulierte Hotelrechnung mit Markierungen">'
  +'<rect width="720" height="360" rx="12" fill="#f0ede4"/>'
  +'<text x="30" y="45" fill="#334650" font-size="19" font-weight="bold">HOTEL AURORA</text>'
  +'<text x="525" y="45" fill="#667782" font-size="12">RECHNUNG HT-2048</text>'
  +'<line x1="30" x2="690" y1="66" y2="66" stroke="#b8c4c4"/>'
  +'<text x="32" y="104" font-size="13" fill="#42545c">Übernachtung</text><text x="612" y="104" font-size="13" text-anchor="end" fill="#42545c">180,00 €</text>'
  +'<line x1="30" x2="690" y1="122" y2="122" stroke="#d1d5d1"/>'
  +'<text x="32" y="152" font-size="13" fill="#42545c">Frühstück</text><text x="612" y="152" font-size="13" text-anchor="end" fill="#42545c">20,00 €</text>'
  +'<line x1="30" x2="690" y1="172" y2="172" stroke="#d1d5d1"/>'
  +'<rect x="26" y="177" width="640" height="43" rx="4" fill="#f0e1d8"/>'
  +'<text x="32" y="201" font-size="13" fill="#42545c">Frühstück (erneut)</text><text x="612" y="201" font-size="13" text-anchor="end" fill="#42545c">20,00 €</text>'
  +'<line x1="30" x2="690" y1="227" y2="227" stroke="#d1d5d1"/>'
  +'<text x="32" y="255" font-size="13" fill="#42545c">Servicepauschale</text><text x="612" y="255" font-size="13" text-anchor="end" fill="#42545c">20,00 €</text>'
  +'<line x1="30" x2="690" y1="276" y2="276" stroke="#9baaa9"/>'
  +'<text x="32" y="314" font-size="13" font-weight="bold" fill="#344750">GESAMT</text><text x="612" y="314" font-size="19" font-weight="bold" text-anchor="end" fill="#344750">240,00 €</text>'
  +'<g id="lab-saved-strokes">'+markup(events)+'</g><g id="lab-current-stroke"></g></svg>'
  +'<p class="lab-hint">'+(editable?"Mit Finger, Stift oder Maus markieren. Jede abgeschlossene Linie wird als eigener Zeitstempel gespeichert.":"Markierungen bis zum ausgewählten Zeitpunkt; keine Videoaufzeichnung.")+'</p></div>';
}
export function renderDrawingPanel(events=[],editable=false) {
  return '<section class="lab-drawing-panel"><div class="lab-title"><div><p class="eyebrow">LIVE DOCUMENT / PENCIL</p><h3>Fehler direkt auf der Rechnung markieren</h3></div><b>'+drawingStrokes(events).length+'/40</b></div>'
   +'<p>Markieren Sie die doppelte Position auf dem Beleg. Die gezeichnete Linie ist ein Beobachtungsbeleg, keine automatische fachliche Bewertung.</p>'
   +renderDrawingDocument(events,editable)+'</section>';
}
export function renderLearningPanel(events=[],finished=false) {
  const s=deriveLearning(events),phase=s.phase,task=LEARNING_TASKS[phase];
  const progress=(s.responses.baseline?1:0)+(s.taught?1:0)+(s.responses.retry?1:0)+(s.responses.transfer?1:0);
  const stageNames=["Ausgangslage","Anleitung","Parallelaufgabe","Transfer"];
  const stages='<div class="lab-stage-track">'+stageNames.map((name,i)=>'<span class="'+(i<progress?"lab-stage-done":i===progress?"lab-stage-active":"")+'">'+(i+1)+' · '+name+'</span>').join("")+'</div>';
  let content="";
  if(phase==="complete") {
    content='<div class="lab-learning-complete"><strong>Vier Phasen dokumentiert</strong><p>Antworten sind mit realen Ereignissen verbunden. Das ist kein wissenschaftlich validierter Lernfähigkeitstest.</p>'
    +Object.entries(s.indicator).map(([key,ok])=>'<div><span>'+escapeText(LEARNING_TASKS[key].title)+'</span><b>'+(ok?"Sollregel erfüllt":"Abweichende Entscheidung")+'</b></div>').join("")+'</div>';
  } else if(phase==="teach") {
    content='<div class="lab-lesson"><small>STANDARDISIERTE ANLEITUNG · V1</small><h3>Zimmerstatus zuerst prüfen</h3>'
     +'<p>Wenn die Zimmerfreigabe noch nicht bestätigt ist, darf die Rezeption keine verbindliche Zusage geben. Zuerst die zuständige Stelle fragen, den Status korrekt kommunizieren, eine Warteoption anbieten und Rückmeldung vereinbaren.</p>'
     +'<p>Alle Teilnehmenden erhalten dieselbe Anleitung. Die nachfolgenden Situationen haben andere Formulierungen und Räume.</p>'
     +'<button class="primary" data-learning-instruction '+(finished?"disabled":"")+'>Anleitung gelesen · Weiter →</button></div>';
  } else {
    content='<div class="lab-task"><p class="eyebrow">SITUATION / '+escapeText(task.title)+'</p><h3>'+escapeText(task.context)+'</h3><p>Welche Handlung wählen Sie?</p>'
     +'<div class="lab-choices">'+task.choices.map((choice,i)=>'<button type="button" data-learning-choice="'+i+'" data-learning-phase="'+phase+'" '+(finished?"disabled":"")+'><span>'+String.fromCharCode(65+i)+'</span>'+escapeText(choice)+'</button>').join("")+'</div>'
     +'<small>Eine Antwort pro Phase. Entscheidungen bleiben für den Beobachter nachvollziehbar.</small></div>';
  }
  return '<div class="fd-pane lab-learning-pane" id="fd-pane-learning"><header class="fd-pane-heading"><div><p class="eyebrow">OPTIONALES LERNMODUL / DEMO</p><h2>Teach · Retry · Transfer</h2><span class="fd-pane-subtitle">Berufliche Arbeitsschritte statt unbewiesener Psychometrie</span></div><span class="fd-context-chip">'+progress+'/4</span></header>'+stages+content+'</div>';
}
export function renderReplayWidget(events=[],sequence=0) {
  const last=events.length?events.at(-1).sequence:0;
  const current=Math.max(0,Math.min(last,Number.isInteger(Number(sequence))?Number(sequence):last));
  const frame=replayAt(events,current);
  const event=events.find(e=>e.sequence===current);
  const state=frame.state,mt=state.multitask;
  const row=(key,value)=>'<div><span>'+key+'</span><b>'+value+'</b></div>';
  return '<section class="panel lab-replay" id="evidence-replay"><div class="panel-top"><div><p class="eyebrow">EVIDENCE REPLAY / ORIGINAL EVENTS</p><h2>Vom Bericht zur Handlung zurückgehen</h2></div><span class="lab-status">EVENT '+current+' / '+last+'</span></div>'
  +'<p>Aufgabenstatus und gezeichnete Linien werden ausschließlich aus den bis hier gespeicherten Ereignissen rekonstruiert. Keine simulierte Videoaufnahme.</p>'
  +'<div class="lab-replay-controls"><button data-replay-nav="-1" '+(current<=0?"disabled":"")+'>← Zurück</button><input type="range" id="replay-range" min="0" max="'+last+'" step="1" value="'+current+'" aria-label="Replay Position" '+(!last?"disabled":"")+'/><button data-replay-nav="1" '+(current>=last?"disabled":"")+'>Weiter →</button></div>'
  +'<div class="lab-replay-body"><div class="lab-replay-summary"><small>REKONSTRUIERTER WORKSPACE</small>'
  +row("Identität",state.verified?"Geprüft":"Offen")
  +row("Rechnung",state.corrected?"Korrigiert":state.opened?"Geöffnet":"Geschützt")
  +row("Anreise",mt.checkinResolved?"Dokumentiert":mt.checkinArrived?"Gast wartet":"Noch nicht eingetroffen")
  +row("Telefon",mt.phoneAnswered?"Beantwortet":mt.phoneRinging?"Klingelt":"Ruhig")
  +row("Lernphase",escapeText(state.learning.phase))
  +'<div class="lab-replay-event"><small>GEWÄHLTE AKTION</small><b>'+(event?escapeText(ACTION_LABELS[event.type]||event.type):"Sitzungsbeginn")+'</b><p>'+(event?escapeText(event.at):"Noch kein Ereignis")+'</p></div></div>'
  +renderDrawingDocument(frame.events,false)+'</div><small>Nur Daten aus der Testoberfläche; keine privaten Apps.</small></section>';
}
export function renderReportAppendix(events=[]) {
  const learning=deriveLearning(events),strokes=drawingStrokes(events);
  return '<section class="panel lab-report-appendix"><div class="panel-top"><div><p class="eyebrow">BELEGBARE ZUSATZAUFGABEN</p><h2>Markierungen und Lernsequenz</h2></div></div>'
   +'<div class="lab-report-facts"><div><small>GEZEICHNETE LINIEN</small><b>'+strokes.length+'</b></div><div><small>TEACH–RETRY–TRANSFER</small><b>'+(learning.completed?"Dokumentiert":"Nicht vollständig")+'</b></div><div><small>EINORDNUNG</small><b>Manuelle Prüfung</b></div></div>'
   +(learning.completed?'<div class="lab-learning-evidence">'+Object.entries(learning.responses).map(([phase,e])=>'<div><span>'+escapeText(phase)+'</span><b>'+escapeText(LEARNING_TASKS[phase].choices[e.payload.choice])+'</b><button data-evidence="'+escapeText(e.id)+'">Event #'+e.sequence+' anzeigen</button></div>').join("")+'</div>':'<p>Keine vollständige Lernsequenz vorhanden.</p>')
   +'<p>Aufgaben sind illustrative Designvorlagen, keine validierte, psychometrisch vergleichbare Diagnostik.</p></section>';
}
