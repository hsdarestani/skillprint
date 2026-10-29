import assert from "node:assert/strict";
// Runs after deploying the Worker. Only synthetic demo information is sent.
const BASE=(process.env.SKILLPRINT_LIVE_API || "https://skillprint-live-api.hsdf7rb.workers.dev").replace(/\/$/,"");
async function req(path,method="GET",payload) {
  const res=await fetch(BASE+path,{method,headers:payload===undefined?undefined:{"content-type":"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
  const data=await res.json().catch(()=>null);
  return {code:res.status,data};
}
const created=await req("/api/sessions","POST",{mode:"multitask"});
assert.equal(created.code,201);
const {id,candidateToken,coachToken}=created.data;
assert.equal(created.data.mode,"multitask");
const candidate=(route)=>"/api/sessions/"+id+"/"+route+"?token="+candidateToken;
const observer=(route)=>"/api/sessions/"+id+"/"+route+"?token="+coachToken;
async function act(type,extra={}) {
  const r=await req(candidate("action"),"POST",{id:crypto.randomUUID(),type,...extra});
  assert.equal(r.code,200, "Action "+type+" failed: "+JSON.stringify(r.data));
  return r.data;
}
let view=await req(observer("snapshot"));
assert.equal(view.code,200);
assert.equal(view.data.mode,"multitask");
await act("ask_guest");
let result=await act("verify_identity");
assert.ok(result.events.some(e=>e.actor==="system" && e.type==="checkin_arrival"));
await act("welcome_checkin");
result=await act("verify_checkin");
assert.ok(result.events.some(e=>e.actor==="system" && e.type==="phone_ringing"));
const blocked=await req(candidate("action"),"POST",{id:crypto.randomUUID(),type:"submit_reply",text:"Guten Tag, ich prüfe die Rechnung."});
assert.equal(blocked.code,400);
assert.equal(blocked.data.error,"SERVICE_QUEUE_INCOMPLETE");
for(const step of ["hold_phone","answer_phone","offer_wait","complete_checkin","open_invoice","compare_items"])await act(step);
await act("correct_invoice",{amount:220});
result=await act("submit_reply",{text:"Sehr geehrte Frau Weber, die doppelte Frühstücksposition wurde entfernt. Der korrekte Gesamtbetrag beträgt 220 Euro."});
assert.equal(result.status,"completed");
const report=await req(observer("snapshot"));
assert.equal(report.code,200);
assert.equal(report.data.report.total,100);
assert.equal(report.data.report.multitask.total,100);
assert.equal(report.data.report.multitask.criteria.length,3);
assert.equal(report.data.report.multitask.status,"complete");
assert.ok(report.data.report.multitask.criteria.every(c=>c.evidence.length>0 && c.evidence.every(id=>report.data.events.some(e=>e.id===id))));
const finish=await req(observer("finalize"),"POST",{});
assert.equal(finish.data.reviewStatus,"approved");
console.log("PASS — published advanced multitask scenario: interruptions, safe sequencing, evidence rubric, review");
