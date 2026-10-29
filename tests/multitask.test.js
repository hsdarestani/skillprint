import test from "node:test";
import assert from "node:assert/strict";
import {newSession,appendAction,deriveState,evaluate,deriveMultitask,evaluateMultitask} from "../src/engine.js";
const act=(s,type,more={})=>appendAction(s,{id:"act_"+String(s.events.filter(e=>e.actor==="candidate").length+1).padStart(4,"0"),type,...more},"candidate");
test("advanced sessions stage a new checkin and a housekeeping call with ordered immutable events",()=>{
  let s=newSession("test-advanced",new Date().toISOString(),"multitask");
  assert.equal(s.mode,"multitask");
  s=act(s,"ask_guest");
  assert.equal(s.events.length,1);
  s=act(s,"verify_identity");
  assert.equal(s.events.length,3);
  assert.equal(s.events[2].type,"checkin_arrival");
  assert.equal(s.events[2].actor,"system");
  s=act(s,"welcome_checkin");
  s=act(s,"verify_checkin");
  assert.equal(s.events.at(-1).type,"phone_ringing");
  assert.equal(s.events.at(-1).actor,"system");
  assert.deepEqual(s.events.map(e=>e.sequence),[1,2,3,4,5,6]);
  assert.equal(deriveState(s.events).multitask.pending,2);
  assert.throws(()=>act(s,"submit_reply",{text:"Ich prüfe Ihre Rechnung und das Zimmer."}),/SERVICE_QUEUE_INCOMPLETE/);
});
test("full multitask flow preserves base assessment and adds independent evidence rubric",()=>{
  let s=newSession("test-good",new Date().toISOString(),"multitask");
  for(const [type,details] of [
    ["ask_guest",{}],["verify_identity",{}],["welcome_checkin",{}],["verify_checkin",{}],
    ["hold_phone",{}],["answer_phone",{}],["offer_wait",{}],["complete_checkin",{}],
    ["open_invoice",{}],["compare_items",{}],["correct_invoice",{amount:220}],
    ["submit_reply",{text:"Sehr geehrte Frau Weber, die doppelte Frühstücksposition wurde entfernt. Die korrigierte Rechnung beträgt 220 Euro."}],
  ]) s=act(s,type,details);
  assert.equal(s.status,"completed");
  const report=evaluate(s.events,s.mode);
  assert.equal(report.total,100);
  assert.equal(report.multitask.total,100);
  assert.equal(report.multitask.status,"complete");
  assert.equal(report.multitask.criteria.length,3);
  assert.ok(report.multitask.criteria.every(c=>c.evidence.every(id=>s.events.some(e=>e.id===id))));
  assert.equal(deriveMultitask(s.events).checkinResolved,true);
});
test("classic flow remains backwards compatible",()=>{
 let s=newSession("test-legacy");
 assert.equal(s.mode,"classic");
 s=act(s,"verify_identity");
 s=act(s,"open_invoice");
 assert.equal(s.events.length,2);
 assert.equal(evaluate(s.events).multitask,undefined);
 assert.throws(()=>act(s,"welcome_checkin"),/ADVANCED_MODE_REQUIRED/);
});
test("false promise about room and ignored phone lead to lower evidence score",()=>{
 let s=newSession("test-risk",new Date().toISOString(),"multitask");
 for(const type of ["ask_guest","verify_identity","promise_room","welcome_checkin","verify_checkin","ignore_phone","answer_phone","offer_wait","complete_checkin"])s=act(s,type);
 const rubric=evaluateMultitask(s.events);
 assert.ok(rubric.total<100);
 assert.equal(deriveMultitask(s.events).roomPromised,true);
 assert.match(rubric.criteria[0].reason,/Nicht bestätigte/);
});
test("prevent impossible queue actions and duplicate decisions",()=>{
 let s=newSession("test-order",new Date().toISOString(),"multitask");
 assert.throws(()=>act(s,"answer_phone"),/PHONE_NOT_RINGING/);
 assert.throws(()=>act(s,"welcome_checkin"),/GUEST_NOT_ARRIVED/);
 s=act(s,"ask_guest");s=act(s,"verify_identity");
 assert.throws(()=>act(s,"verify_checkin"),/WELCOME_GUEST_FIRST/);
 s=act(s,"welcome_checkin");s=act(s,"verify_checkin");
 assert.throws(()=>act(s,"offer_wait"),/CHECK_ROOM_STATUS_FIRST/);
 s=act(s,"answer_phone");
 assert.throws(()=>act(s,"complete_checkin"),/CHECKIN_NOT_READY/);
 assert.throws(()=>act(s,"answer_phone"),/ACTION_ALREADY_RECORDED/);
});
test("repeated action id does not duplicate system arrivals",()=>{
 let s=newSession("test-retry",new Date().toISOString(),"multitask");
 s=appendAction(s,{type:"ask_guest",id:"repeat_001"},"candidate");
 s=appendAction(s,{type:"verify_identity",id:"repeat_002"},"candidate");
 s=appendAction(s,{type:"verify_identity",id:"repeat_002"},"candidate");
 assert.equal(s.events.filter(e=>e.type==="checkin_arrival").length,1);
 assert.equal(s.events.length,3);
});
