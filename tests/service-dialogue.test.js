import test from "node:test";
import assert from "node:assert/strict";
import {newSession,appendAction,deriveState,evaluate} from "../src/engine.js";
import {SERVICE_OPENING,SERVICE_LIMIT,serviceCounts,serviceReply,scriptedServiceResponse} from "../src/service-dialogue.js";
import {renderServiceChat} from "../src/service-ui.js";
import {renderFrontDeskStudio} from "../src/frontdesk-studio.js";

const doAction=(session,type,more={})=>appendAction(session,{id:"test_"+String(session.events.length).padStart(6,"0"),type,...more},"candidate");
function ready(){let s=newSession("test-service",new Date().toISOString(),"multitask");for(const type of ["ask_guest","verify_identity","welcome_checkin","verify_checkin"])s=doAction(s,type);return s}
test("Sofia and Housekeeping appear only after respective interruptions",()=>{
 let s=newSession("test-service-start",new Date().toISOString(),"multitask");
 assert.throws(()=>doAction(s,"service_message",{channel:"arrival",text:"Guten Tag Frau Demir"}),/GUEST_NOT_ARRIVED/);
 assert.throws(()=>doAction(s,"service_message",{channel:"phone",text:"Guten Morgen Housekeeping"}),/PHONE_NOT_RINGING/);
 s=doAction(s,"ask_guest");s=doAction(s,"verify_identity");
 assert.equal(deriveState(s.events).multitask.checkinArrived,true);
 s=doAction(s,"service_message",{channel:"arrival",text:"Good morning, welcome to Hotel Aurora.",locale:"en"});
 assert.equal(serviceCounts(s.events,"arrival").pending,true);
 assert.throws(()=>doAction(s,"service_message",{channel:"arrival",text:"Would you like to wait?"}),/SERVICE_REPLY_PENDING/);
 assert.throws(()=>appendAction(s,{type:"service_reply",channel:"arrival",text:"Welcome to our hotel."},"candidate"),/FORBIDDEN/);
 s=appendAction(s,{id:"service_test_000003",type:"service_reply",channel:"arrival",text:"Thank you. Could you check the room?",locale:"en",source:"scripted"},"service");
 assert.equal(serviceCounts(s.events,"arrival").pending,false);
 assert.equal(s.events.at(-1).actor,"service");
});
test("two channels record independent, role-protected, reviewer-visible evidence",()=>{
 let s=ready();
 s=doAction(s,"service_message",{channel:"arrival",text:"Hello Sofia, please wait here.",locale:"en"});
 s=appendAction(s,{id:"answer_arrival_01",type:"service_reply",channel:"arrival",text:"I can wait in the lobby.",locale:"en",source:"ai"},"service");
 s=doAction(s,"service_message",{channel:"phone",text:"Can you confirm room 311 is available?",locale:"en"});
 s=appendAction(s,{id:"answer_phone_01",type:"service_reply",channel:"phone",text:"Room 311 has not been released.",locale:"en",source:"scripted"},"service");
 assert.equal(serviceCounts(s.events,"arrival").answers,1);
 assert.equal(serviceCounts(s.events,"phone").answers,1);
 assert.equal(evaluate(s.events,s.mode).multitask.status,"in_progress");
 assert.ok(s.events.some(e=>e.payload?.text?.includes("Room 311")));
 assert.equal(s.events.filter(e=>e.type==="service_reply").length,2);
});
test("service channels have separate six-message caps and preserve idempotent writes",()=>{
 let s=ready();
 for(let i=0;i<SERVICE_LIMIT;i++){
  const id="typed_service_"+i;
  s=appendAction(s,{id,type:"service_message",channel:"arrival",text:"Good morning Sofia, can I help you?",locale:"en"},"candidate");
  s=appendAction(s,{id:"reply_"+i,type:"service_reply",channel:"arrival",text:"Please check if my room is ready.",locale:"en"},"service");
 }
 assert.throws(()=>doAction(s,"service_message",{channel:"arrival",text:"May I help you?"}),/SERVICE_CHAT_LIMIT/);
 const before=s.events.length;
 s=appendAction(s,{id:"typed_service_5",type:"service_message",channel:"arrival",text:"Good morning Sofia, can I help you?",locale:"en"},"candidate");
 assert.equal(s.events.length,before);
 assert.equal(serviceCounts(s.events,"phone").questions,0);
});
test("scripted service response respects fixed room facts in German, Turkish, English",()=>{
 const m=deriveState(ready().events);
 assert.match(scriptedServiceResponse("arrival","de",m),/Zimmer/);
 assert.match(scriptedServiceResponse("arrival","tr",m),/oda|Oda|odam/i);
 assert.match(scriptedServiceResponse("phone","en",m),/not released/);
 assert.ok(SERVICE_OPENING.phone.tr.length>12);
});
test("Workers AI roleplay bounded by facts; unsafe or offline output falls back",async()=>{
 const session=ready();
 const events=appendAction(session,{id:"typed_001",type:"service_message",channel:"arrival",text:"Is the room ready?",locale:"en"},"candidate").events;
 const ai={run:async(_model,body)=>{assert.match(body.messages[0].content,/NOT been released/);return {response:"I'm carrying luggage. Could you please check room 311?"};}};
 const good=await serviceReply({events,channel:"arrival",locale:"en",message:"Is the room ready?",ai});
 assert.equal(good.source,"ai");
 const bad=await serviceReply({events,channel:"arrival",locale:"en",message:"Is the room ready?",ai:{run:async()=>({response:"Room 311 is ready now."})}});
 assert.equal(bad.source,"scripted");
 const fail=await serviceReply({events,channel:"arrival",locale:"en",message:"Is the room ready?",ai:{run:async()=>{throw Error("model down")}}});
 assert.equal(fail.source,"scripted");
});
test("new conversation UI renders escaped transcripts and keeps old hotel system controls",()=>{
 let s=ready();
 s=appendAction(s,{id:"arrival_001",type:"service_message",text:"<script>alert(1)</script>",channel:"arrival",locale:"de"},"candidate");
 s=appendAction(s,{id:"arrival_002",type:"service_reply",text:"Vielen Dank, können Sie das Zimmer prüfen?",channel:"arrival",locale:"de"},"service");
 const safe=x=>String(x||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
 const html=renderServiceChat(s.events,"arrival","de",safe);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 const base={id:s.id,mode:s.mode,events:s.events,state:deriveState(s.events),status:s.status};
 const screen=renderFrontDeskStudio(base,{activeTab:"arrival",serviceLocale:"de",safe,euro:n=>n+" EUR",fmt:d=>d.slice(11,16),renderChat:()=>"<div>guest</div>"});
 assert.match(screen,/data-action="service-chat"/);
 assert.match(screen,/data-step="verify_checkin"/);
 assert.match(screen,/service-chat-arrival/);
});
test("classic mode refuses new service conversation, no employment decision is generated",()=>{
 let s=newSession("classic-test");
 assert.throws(()=>doAction(s,"service_message",{channel:"arrival",text:"Hello Sofia"}),/ADVANCED_MODE_REQUIRED/);
});
