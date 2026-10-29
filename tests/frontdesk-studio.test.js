
import test from "node:test";
import assert from "node:assert/strict";
import { newSession, appendAction, deriveState, evaluate } from "../src/engine.js";
import { renderFrontDeskStudio, renderStudioObserver, studioActiveTab, studioTabSignals } from "../src/frontdesk-studio.js";

const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const deps={safe:esc,euro:n=>n+" EUR",fmt:at=>at.slice(11,19),renderChat:()=>'<div class="dialogue-messages">Gästegespräch</div>',activeTab:"guest"};
const session=()=>newSession("sl-studio",new Date().toISOString(),"multitask");
const state=s=>({events:s.events,state:deriveState(s.events),status:s.status,mode:s.mode,id:s.id});
const action=(s,type,more={})=>appendAction(s,{id:"candidate_"+(s.events.length+1).toString().padStart(6,"0"),type,...more},"candidate");

test("studio renders one active workspace and operational lobby stations",()=>{
 const html=renderFrontDeskStudio(state(session()),deps);
 assert.match(html,/HOTEL AURORA/);
 assert.match(html,/fd-scene-people/);
 assert.match(html,/fd-cockpit/);
 assert.match(html,/fd-pane-guest/);
 assert.doesNotMatch(html,/id="fd-pane-arrival"/);
 assert.equal((html.match(/class="fd-tab /g)||[]).length,12);
 assert.match(html,/data-studio-tab="phone"/);
 assert.match(html,/data-studio-tab="handover"/);
 assert.match(html,/11/);
});
test("arriving guest and ringing phone produce actionable, separate active panels",()=>{
 let s=session();
 for(const type of ["ask_guest","verify_identity","welcome_checkin","verify_checkin"])s=action(s,type);
 assert.equal(deriveState(s.events).multitask.checkinArrived,true);
 assert.equal(deriveState(s.events).multitask.phoneRinging,true);
 const checkin=renderFrontDeskStudio(state(s),{...deps,activeTab:"arrival"});
 assert.match(checkin,/id="fd-pane-arrival"/);
 assert.match(checkin,/data-step="offer_wait"/);
 assert.match(checkin,/Buchung CK-311|Reservierung CK-311/);
 assert.doesNotMatch(checkin,/id="fd-pane-phone"/);
 const phone=renderFrontDeskStudio(state(s),{...deps,activeTab:"phone"});
 assert.match(phone,/id="fd-pane-phone"/);
 assert.match(phone,/data-step="answer_phone"/);
 assert.match(phone,/EINGEHENDER ANRUF/);
 assert.doesNotMatch(phone,/id="fd-pane-arrival"/);
 const signals=studioTabSignals(deriveState(s.events));
 assert.equal(signals.phone.urgent,true);
 assert.equal(signals.arrival.urgent,true);
});
test("invoice and handover panels retain existing domain actions and field ids",()=>{
 let s=session();
 for(const type of ["ask_guest","verify_identity","welcome_checkin","verify_checkin","answer_phone","offer_wait","complete_checkin","open_invoice","compare_items"])s=action(s,type);
 const invoice=renderFrontDeskStudio(state(s),{...deps,activeTab:"invoice"});
 assert.match(invoice,/id="fd-pane-invoice"/);
 assert.match(invoice,/data-step="correct_invoice"/);
 assert.match(invoice,/id="amount"/);
 assert.match(invoice,/240 EUR/);
 const handover=renderFrontDeskStudio(state(s),{...deps,activeTab:"handover"});
 assert.match(handover,/id="guest-reply"/);
 assert.match(handover,/data-step="submit_reply"/);
 assert.match(handover,/data-step="escalate"/);
});
test("completed tasks are not misrepresented as additional scores",()=>{
 let s=session();
 for(const type of ["ask_guest","verify_identity","welcome_checkin","verify_checkin","answer_phone","offer_wait","complete_checkin"])s=action(s,type);
 const html=renderFrontDeskStudio(state(s),{...deps,activeTab:"arrival"});
 assert.match(html,/ERLEDIGT/);
 assert.equal(evaluate(s.events,s.mode).multitask.status,"complete");
});
test("observer mirror reflects actual events without inferring candidate personality",()=>{
 let s=session();
 s=action(s,"ask_guest");
 s=action(s,"verify_identity");
 const html=renderStudioObserver(state(s),{safe:esc,fmt:deps.fmt});
 assert.match(html,/LIVE SERVICE DESK/);
 assert.match(html,/Sofia Demir/);
 assert.match(html,/Gast wartet am Empfang/);
 assert.doesNotMatch(html,/Eignungswahrscheinlichkeit|Persönlichkeitsprofil|100 % geeignet/);
});
test("invalid active tab fails closed to guest, role-specific UI remains delegated to app",()=>{
 assert.equal(studioActiveTab("evil"),"guest");
 assert.equal(studioActiveTab("phone"),"phone");
 const html=renderFrontDeskStudio(state(session()),{...deps,activeTab:"invalid"});
 assert.match(html,/fd-pane-guest/);
});
