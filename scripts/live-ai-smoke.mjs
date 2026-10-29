import assert from "node:assert/strict";
const BASE = (process.env.SKILLPRINT_LIVE_API || "https://skillprint-live-api.hsdf7rb.workers.dev").replace(/\/$/,"");
async function request(path,body) {
  const res=await fetch(BASE+path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(40000)});
  const data=await res.json().catch(()=>null);
  assert.ok(res.ok, "API "+path+" returned "+res.status+" "+JSON.stringify(data));
  return data;
}
const newSession=await request("/api/sessions",{});
assert.match(newSession.candidateToken,/^[a-f0-9]{48}$/);
const {id,candidateToken,coachToken}=newSession;
async function chat(locale,text) {
  return request("/api/sessions/"+id+"/chat?token="+candidateToken,{id:crypto.randomUUID(),locale,text});
}
const first=await chat("de","Guten Tag, bitte erklären Sie mir, welche Position auf der Rechnung falsch ist.");
assert.equal(first.role,"candidate");
assert.equal(first.state.candidateMessages,1);
assert.equal(first.state.guestMessages,1);
const g1=first.events.find(e=>e.type==="guest_message");
assert.ok(g1);
assert.ok(["ai","scripted"].includes(g1.payload.source));
console.log("PASS German simulated guest:",g1.payload.source);
const second=await chat("tr","Teşekkür ederim. Kahvaltı ücretini kontrol eder misiniz?");
assert.equal(second.state.candidateMessages,2);
assert.equal(second.state.guestMessages,2);
const guest=second.events.filter(e=>e.type==="guest_message");
assert.equal(guest.length,2);
assert.ok(guest.every(e=>e.payload.text.length>9));
assert.ok(!guest.some(e=>/HT-2048/.test(e.payload.text)),"Private booking reference disclosed without verification");
const coach=await fetch(BASE+"/api/sessions/"+id+"/snapshot?token="+coachToken).then(x=>x.json());
assert.equal(coach.events.filter(e=>e.type==="candidate_message").length,2);
assert.equal(coach.events.filter(e=>e.type==="guest_message").length,2);
const guestModes=guest.map(e=>e.payload.source);
console.log("PASS Turkish guest chat, evidence history and role visibility. Modes:",guestModes.join(", "));
assert.ok(guestModes.includes("ai"),"Cloudflare model produced only scripted fallback; check AI binding/quotas and logs");
console.log("ALL PASS — live Cloudflare Workers AI roleplay and evidence-backed guest conversation");
