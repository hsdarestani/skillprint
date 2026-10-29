import test from "node:test";
import assert from "node:assert/strict";
import { newSession, appendAction, deriveState, evaluate } from "../src/engine.js";
import { generateGuestReply, fallbackGuest, normalizeLocale, OPENING } from "../src/guest.js";

test("guest conversation is recorded as events visible in evidence and rubric", () => {
  let s = newSession("sl-talk");
  s = appendAction(s,{id:"candidate_01",type:"candidate_message",text:"Warum wurde das Frühstück zweimal berechnet?",locale:"de"},"candidate");
  assert.equal(deriveState(s.events).candidateMessages,1);
  assert.equal(evaluate(s.events).criteria.find(c=>c.id==="clarification").points,2);
  assert.throws(()=>appendAction(s,{id:"candidate_02",type:"candidate_message",text:"Noch eine Frage",locale:"de"},"candidate"),/GUEST_REPLY_PENDING/);
  s=appendAction(s,{id:"guest_candidate_01",type:"guest_message",text:"Ich habe nur einmal gefrühstückt.",locale:"de",source:"scripted"},"guest");
  assert.equal(deriveState(s.events).guestMessages,1);
  assert.equal(s.events.at(-1).actor,"guest");
  assert.deepEqual(s.events.map(e=>e.sequence),[1,2]);
  assert.equal(s.events.at(-1).payload.source,"scripted");
  assert.throws(()=>appendAction(s,{id:"guest_orphan_01",type:"guest_message",text:"Another fake guest reply",locale:"de"},"guest"),/NO_CHAT_REQUEST/);
});
test("unauthorized actors cannot forge guest messages",()=>{
  const session = newSession("sl-role");
  assert.throws(()=>appendAction(session,{type:"guest_message",text:"Fake guest response"},"candidate"),/FORBIDDEN/);
  assert.throws(()=>appendAction(session,{type:"guest_message",text:"Fake guest response"},"coach"),/FORBIDDEN/);
});
test("cannot finish an assessment while AI guest reply pending",()=>{
  let s=newSession("sl-pending");
  s=appendAction(s,{type:"open_invoice"},"candidate");
  s=appendAction(s,{id:"pending_001",type:"candidate_message",text:"Hallo, was ist falsch?",locale:"de"},"candidate");
  assert.throws(()=>appendAction(s,{type:"submit_reply",text:"Frau Weber, ich bearbeite Ihre Rechnung."},"candidate"),/GUEST_REPLY_PENDING/);
});
test("hard per-session message limit prevents unbounded inference",()=>{
  let s=newSession("sl-quota");
  for(let i=0;i<12;i++){
    s=appendAction(s,{id:"candidate_"+String(i).padStart(3,"0"),type:"candidate_message",text:"Guten Tag, können Sie helfen?",locale:"de"},"candidate");
    s=appendAction(s,{id:"guest_"+String(i).padStart(3,"0"),type:"guest_message",text:"Ja, bitte prüfen Sie meine Rechnung.",locale:"de"},"guest");
  }
  assert.equal(deriveState(s.events).candidateMessages,12);
  assert.throws(()=>appendAction(s,{type:"candidate_message",text:"Noch eine Frage",locale:"de"},"candidate"),/CHAT_LIMIT_REACHED/);
});
test("scripted fallback is localized and does not invent corrected totals",()=>{
  assert.match(fallbackGuest("breakfast?","tr"),/Kahvaltı/);
  assert.match(fallbackGuest("Frühstück","de"),/frühstückt/);
  assert.equal(normalizeLocale("fr"),"de");
  assert.ok(OPENING.en.startsWith("Hello"));
});
test("AI response uses bounded roleplay and records source",async()=>{
  const ai={run:async(model,config)=>{
    assert.match(model,/llama/);
    assert.equal(config.messages[0].role,"system");
    return {response:"I only ate breakfast once. Could you please check the charges?"};
  }};
  let s=newSession("sl-ai");
  s=appendAction(s,{type:"candidate_message",text:"Could you explain your complaint?",locale:"en"},"candidate");
  const ans=await generateGuestReply({events:s.events,locale:"en",message:"Could you explain your complaint?",ai});
  assert.equal(ans.source,"ai");
  assert.match(ans.text,/breakfast/);
});
test("AI hallucinated private amount before verification is replaced with fallback",async()=>{
  let s=newSession("sl-hallucination");
  s=appendAction(s,{type:"candidate_message",text:"Can you share the booking?",locale:"en"},"candidate");
  const result=await generateGuestReply({events:s.events,locale:"en",message:"Can you share the booking?",ai:{run:async()=>({response:"Your corrected bill is 220 EUR, room 208 booking HT-2048."})}});
  assert.equal(result.source,"scripted");
  assert.doesNotMatch(result.text,/HT-2048|220/);
});
test("AI outage falls back and is explicitly marked as scripted",async()=>{
  const s=newSession("sl-outage");
  const result=await generateGuestReply({events:s.events,locale:"de",message:"Guten Tag",ai:{run:async()=>{throw Error("quota")}}});
  assert.equal(result.source,"scripted");
  assert.ok(result.text.length>15);
});
