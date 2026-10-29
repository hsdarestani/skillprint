
import test from "node:test";
import assert from "node:assert/strict";
import {newSession,appendAction,deriveState,deriveLearning,LEARNING_TASKS,drawingStrokes,replayAt,evaluate} from "../src/engine.js";
import {renderDrawingDocument,renderDrawingPanel,renderLearningPanel,renderReplayWidget,renderReportAppendix} from "../src/evidence-lab.js";
const a=(s,type,opts={})=>appendAction(s,{id:"evidence_"+String(s.events.length+1).padStart(5,"0"),type,...opts},"candidate");
const advanced=()=>newSession("sl-evidence",new Date().toISOString(),"multitask");
test("invoice markup is guarded until invoice is open and validates only normalized bounded points",()=>{
 let s=advanced();
 assert.throws(()=>a(s,"drawing_stroke",{points:[[0.1,0.2],[0.3,0.4]]}),/OPEN_INVOICE_FIRST/);
 s=a(s,"open_invoice");
 for(const points of [
  [[0.1,0.2]], [[-1,0.4],[0.1,0.2]], [[0,0],[1.4,1]],[[0,0],["0.5",0.5]],
  Array.from({length:101},(_,i)=>[i/101,i/101])
 ]) assert.throws(()=>a(s,"drawing_stroke",{points}),/INVALID_DRAWING/);
 s=a(s,"drawing_stroke",{points:[[0.1,0.2],[0.4,0.5],[0.47,0.52]]});
 assert.equal(drawingStrokes(s.events).length,1);
 assert.equal(drawingStrokes(s.events)[0].points[1][0],0.4);
 assert.match(renderDrawingDocument(s.events,true),/lab-ink-editable/);
 assert.match(renderDrawingPanel(s.events,true),/1\/40/);
});
test("drawing actions do not incorrectly advance interrupt trigger counters",()=>{
 let s=advanced();
 s=a(s,"open_invoice");
 s=a(s,"drawing_stroke",{points:[[0.2,0.3],[0.3,0.4]]});
 assert.equal(deriveState(s.events).multitask.checkinArrived,false);
 s=a(s,"verify_identity");
 assert.equal(deriveState(s.events).multitask.checkinArrived,true);
});
test("four-phase learning flow persists exact choices and instruction version",()=>{
 let s=advanced();
 assert.equal(deriveLearning(s.events).phase,"baseline");
 assert.throws(()=>a(s,"learning_instruction"),/LEARNING_OUT_OF_ORDER/);
 assert.throws(()=>a(s,"learning_response",{phase:"retry",choice:1}),/LEARNING_OUT_OF_ORDER/);
 s=a(s,"learning_response",{phase:"baseline",choice:LEARNING_TASKS.baseline.correct});
 assert.equal(deriveLearning(s.events).phase,"teach");
 assert.throws(()=>a(s,"learning_response",{phase:"retry",choice:2}),/LEARNING_OUT_OF_ORDER/);
 s=a(s,"learning_instruction");
 assert.equal(s.events.at(-1).payload.version,"hotel_room_status_intro_v1");
 s=a(s,"learning_response",{phase:"retry",choice:LEARNING_TASKS.retry.correct});
 assert.equal(deriveLearning(s.events).phase,"transfer");
 s=a(s,"learning_response",{phase:"transfer",choice:LEARNING_TASKS.transfer.correct});
 assert.equal(deriveLearning(s.events).phase,"complete");
 assert.deepEqual(deriveLearning(s.events).indicator,{baseline:true,retry:true,transfer:true});
 assert.match(renderLearningPanel(s.events),/Vier Phasen dokumentiert/);
 assert.match(renderReportAppendix(s.events),/Manuelle Prüfung/);
 assert.equal(evaluate(s.events,s.mode).multitask.total,0);
});
test("an incorrect baseline remains documented, no automated ability judgment",()=>{
 let s=advanced();
 s=a(s,"learning_response",{phase:"baseline",choice:0});
 s=a(s,"learning_instruction");
 s=a(s,"learning_response",{phase:"retry",choice:2});
 s=a(s,"learning_response",{phase:"transfer",choice:0});
 const state=deriveLearning(s.events);
 assert.equal(state.indicator.baseline,false);
 assert.equal(state.indicator.retry,true);
 assert.equal(state.indicator.transfer,true);
 assert.match(state.disclaimer,/keine psychologische/);
 assert.equal(state.completed,true);
});
test("event-sequence replay reconstructs the state and exact strokes without inventing past work",()=>{
 let s=advanced();
 s=a(s,"verify_identity");
 s=a(s,"open_invoice");
 const before=s.events.at(-1).sequence;
 s=a(s,"drawing_stroke",{points:[[0.1,0.2],[0.15,0.3]]});
 const old=replayAt(s.events,before);
 assert.equal(old.state.opened,true);
 assert.equal(old.strokes.length,0);
 const latest=replayAt(s.events,s.events.at(-1).sequence);
 assert.equal(latest.strokes.length,1);
 assert.match(renderReplayWidget(s.events,before),/EVENT 3 \/ 4|EVENT 2 \/ 4/);
 assert.match(renderReplayWidget(s.events,latest.sequence),/polyline/);
});
test("classic mode cannot masquerade as validated drawing or learning sample",()=>{
 let s=newSession("classic");
 assert.throws(()=>a(s,"drawing_stroke",{points:[[0.1,0.1],[0.2,0.2]]}),/ADVANCED_MODE_REQUIRED/);
 assert.throws(()=>a(s,"learning_response",{phase:"baseline",choice:1}),/ADVANCED_MODE_REQUIRED/);
});
