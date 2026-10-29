import assert from "node:assert/strict";
// Synthetic-only production check. Tests candidate role, bounded roleplay, and observer evidence.
const BASE=(process.env.SKILLPRINT_LIVE_API||"https://skillprint-live-api.hsdf7rb.workers.dev").replace(/\/$/,"");
async function req(path,body,method="POST") {
 const res=await fetch(BASE+path,{
  method,headers:body===undefined?undefined:{"content-type":"application/json"},
  body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000),
 });
 const data=await res.json().catch(()=>null);
 return {status:res.status,data};
}
const created=await req("/api/sessions",{mode:"multitask"});
assert.equal(created.status,201,"Could not create advanced session");
const {id,candidateToken,coachToken}=created.data;
const candidate=route=>"/api/sessions/"+id+"/"+route+"?token="+candidateToken;
const observer=route=>"/api/sessions/"+id+"/"+route+"?token="+coachToken;
async function action(type) {
 const res=await req(candidate("action"),{id:crypto.randomUUID(),type});
 assert.equal(res.status,200,type+" "+JSON.stringify(res.data));return res.data;
}
await action("ask_guest");
await action("verify_identity");
await action("welcome_checkin");
await action("verify_checkin");
const spoof=await req(candidate("action"),{id:crypto.randomUUID(),type:"service_reply",channel:"phone",text:"I am a fake housekeeper"});
assert.equal(spoof.status,403);
const service=async(channel,text,locale)=>{
 const res=await req(candidate("service-chat"),{id:crypto.randomUUID(),channel,text,locale});
 assert.equal(res.status,200,channel+" "+JSON.stringify(res.data));
 const question=res.data.events.filter(e=>e.type==="service_message"&&e.payload.channel===channel);
 const answer=res.data.events.filter(e=>e.type==="service_reply"&&e.payload.channel===channel);
 assert.equal(question.length,1);
 assert.equal(answer.length,1);
 assert.ok(answer[0].payload.text.length>=10);
 assert.ok(["ai","scripted"].includes(answer[0].payload.source));
 return answer[0];
};
const a=await service("arrival","Guten Morgen, ich prüfe Ihre Reservierung. Haben Sie Gepäck dabei?","de");
const p=await service("phone","Can you confirm whether room 311 is released for check-in?","en");
const coach=await req(observer("snapshot"),undefined,"GET");
assert.equal(coach.status,200);
assert.equal(coach.data.role,"coach");
assert.equal(coach.data.events.filter(e=>e.type==="service_message").length,2);
assert.equal(coach.data.events.filter(e=>e.type==="service_reply").length,2);
assert.equal(coach.data.report.multitask.status,"in_progress");
const sources=[a.payload.source,p.payload.source];
console.log("PASS two-channel live roleplay, authorization and observer evidence. Sources:",sources.join(","));
assert.ok(sources.includes("ai"),"No AI roleplay response was produced. Verify Cloudflare Workers AI binding and model quota.");
console.log("ALL PASS — advanced synthetic hotel service dialogues, evidence visibility, AI model");
