import test from "node:test";
import assert from "node:assert/strict";
import {newSession,appendAction,deriveState,evaluate,journeyProgress,isRelevantClarification} from "../src/engine.js";
import {missionDock,missionProgress} from "../src/mission-ui.js";
const write=(session,type,other={})=>appendAction(session,{type,id:"test_"+(session.events.length+1).toString().padStart(5,"0"),...other},"candidate");
test("short generic acknowledgements are NOT clarification evidence or premature 25 points",()=>{
  let s=newSession("sl-ux",new Date().toISOString(),"multitask");
  s=write(s,"candidate_message",{text:"yes of course",locale:"en"});
  s=appendAction(s,{id:"guest_reply_0001",type:"guest_message",text:"What is the problem with the bill?",locale:"en"},"guest");
  s=write(s,"candidate_message",{text:"no sorry",locale:"en"});
  const score=evaluate(s.events,s.mode);
  assert.equal(score.criteria.find(c=>c.id==="clarification").points,0);
  assert.deepEqual(score.criteria.find(c=>c.id==="clarification").evidence,[]);
  assert.equal(score.total,0);
  const progress=journeyProgress(s.events,s.mode);
  assert.equal(progress.done,0);
  assert.equal(progress.total,11);
});
test("clear German, English and Turkish questions count as provisional clarification evidence",()=>{
  for(const text of [
    "Warum wurde das Frühstück zweimal berechnet?",
    "Could you explain which charge on your hotel bill is wrong?",
    "Faturadaki hangi ücretin yanlış olduğunu açıklar mısınız?"
  ])assert.equal(isRelevantClarification(text),true,text);
  for(const text of ["yes of course","no sorry","Thanks","hello I'm ready","Could you help?"])assert.equal(isRelevantClarification(text),false,text);
});
test("only appropriate candidate message is evidence of clarification",()=>{
  let s=newSession("sl-dialogue");
  s=write(s,"candidate_message",{text:"yes of course",locale:"en"});
  s=appendAction(s,{id:"guest_reply_0001",type:"guest_message",text:"I paid for breakfast once, not twice.",locale:"en"},"guest");
  s=write(s,"candidate_message",{text:"Which breakfast charge on the invoice do you believe is wrong?",locale:"en"});
  const criterion=evaluate(s.events).criteria.find(c=>c.id==="clarification");
  assert.equal(criterion.points,2);
  assert.equal(criterion.evidence.length,1);
  assert.equal(criterion.evidence[0],s.events[2].id);
});
test("multitask progress includes check-in and telephone, not only invoice",()=>{
  let s=newSession("sl-progress",new Date().toISOString(),"multitask");
  for(const type of ["ask_guest","verify_identity","welcome_checkin","verify_checkin","answer_phone","offer_wait","complete_checkin"])s=write(s,type);
  const p=journeyProgress(s.events,s.mode);
  assert.equal(p.total,11);
  assert.equal(p.done,7);
  assert.equal(p.segments.find(x=>x.key==="checkin").done,4);
  assert.equal(p.segments.find(x=>x.key==="phone").done,1);
  assert.equal(p.segments.find(x=>x.key==="invoice").done,2);
  assert.equal(p.pendingInterruptions,0);
  const dock=missionDock(s.events,s.mode);
  assert.match(dock,/data-scroll-to="phone-task"/);
  assert.match(dock,/data-scroll-to="checkin-task"/);
  assert.match(dock,/data-scroll-to="invoice-work"/);
  assert.match(missionProgress(s.events,s.mode),/7 \/ 11 Schritte/);
});
test("classic mode still has six steps and no fixed multi-task bar",()=>{
 const s=newSession("sl-classic");
 assert.equal(journeyProgress(s.events,s.mode).total,6);
 assert.equal(missionDock(s.events,s.mode),"");
});
