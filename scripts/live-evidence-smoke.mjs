import assert from "node:assert/strict";
import {replayAt,deriveLearning,drawingStrokes} from "../src/engine.js";
const BASE=(process.env.SKILLPRINT_LIVE_API||"https://skillprint-live-api.hsdf7rb.workers.dev").replace(/\/$/,"");
async function query(path,method="GET",payload) {
  const response=await fetch(BASE+path,{
    method,headers:payload?{"content-type":"application/json"}:undefined,
    body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000)
  });
  const body=await response.json().catch(()=>null);
  return {status:response.status,body};
}
const created=await query("/api/sessions","POST",{mode:"multitask"});
assert.equal(created.status,201);
const {id,candidateToken,coachToken}=created.body;
const url=(role,action)=>"/api/sessions/"+id+"/"+action+"?token="+(role==="coach"?coachToken:candidateToken);
async function act(type,data={}) {
  const result=await query(url("candidate","action"),"POST",{id:crypto.randomUUID(),type,...data});
  assert.equal(result.status,200,type+": "+JSON.stringify(result.body));
  return result.body;
}
await act("open_invoice");
const bad=await query(url("candidate","action"),"POST",{id:crypto.randomUUID(),type:"drawing_stroke",points:[[2,0],[0,1]]});
assert.equal(bad.status,400);
await act("drawing_stroke",{points:[[0.2,0.3],[0.34,0.4],[0.56,0.6]]});
await act("learning_response",{phase:"baseline",choice:0});
await act("learning_instruction");
await act("learning_response",{phase:"retry",choice:2});
await act("learning_response",{phase:"transfer",choice:0});
const snapshot=await query(url("coach","snapshot"));
assert.equal(snapshot.status,200);
const events=snapshot.body.events;
assert.equal(drawingStrokes(events).length,1);
assert.equal(deriveLearning(events).completed,true);
assert.equal(deriveLearning(events).indicator.baseline,false);
assert.equal(deriveLearning(events).indicator.retry,true);
const stroke=events.find(x=>x.type==="drawing_stroke");
assert.ok(stroke.id&&stroke.at&&stroke.sequence);
const before=replayAt(events,stroke.sequence-1);
const after=replayAt(events,stroke.sequence);
assert.equal(before.strokes.length,0);
assert.equal(after.strokes.length,1);
assert.ok(events.some(e=>e.type==="learning_instruction"&&e.payload.version==="hotel_room_status_intro_v1"));
const coachOnly=await query(url("coach","action"),"POST",{id:crypto.randomUUID(),type:"drawing_stroke",points:[[0,0],[1,1]]});
assert.equal(coachOnly.status,400);
console.log("ALL PASS — live Pencil evidence, ordered learning, human observer replay and security");
