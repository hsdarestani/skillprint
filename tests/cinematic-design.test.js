import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderFrontDeskStudio,renderStudioObserver} from "../src/frontdesk-studio.js";
import {newSession,deriveState} from "../src/engine.js";
const main=readFileSync("src/main.js","utf8"),css=readFileSync("src/cinematic-ui.css","utf8"),html=readFileSync("index.html","utf8");
const block=(from,to)=>main.slice(main.indexOf(from),main.indexOf(to,main.indexOf(from)+from.length));
const mock=()=>{
  const s=newSession("sl-cinematic",new Date().toISOString(),"multitask");
  return {id:s.id,status:s.status,mode:s.mode,events:s.events,state:deriveState(s.events)};
};
test("one primary CTA; legacy demo and links remain tucked into optional tools",()=>{
 const landing=block("function dashboard()","function guestMessage(");
 assert.equal((landing.match(/data-action="create-advanced"/g)||[]).length,1);
 assert.equal((landing.match(/data-action="copy-candidate"/g)||[]).length,1);
 assert.match(landing,/lux-hero/);
 assert.match(landing,/lux-ambient/);
 assert.match(landing,/lux-three/);
 assert.match(landing,/lux-extras/);
 assert.match(landing,/Mehr Optionen/);
 assert.match(landing,/data-action="create"/);
 assert.doesNotMatch(landing,/Kandidatenlink kopieren<\/button>/);
});
test("Control Room has one main report action and accessible icon-only link control",()=>{
 const control=block("function control()","function reportView()");
 assert.match(control,/lux-control-top/);
 assert.match(control,/lux-icon-button/);
 assert.match(control,/aria-label="Kandidatenlink kopieren"/);
 assert.match(control,/lux-next/);
 assert.match(control,/data-panel="control-all-events"/);
 assert.match(control,/data-panel="control-tools"/);
 assert.equal((control.match(/Evidence Report/g)||[]).length,1);
});
test("report preserves human review, PDF, replay and on-demand evidence",()=>{
 const report=block("function reportView()","function loading()");
 assert.match(report,/lux-icon-button/);
 assert.match(report,/aria-label="Als PDF drucken"/);
 assert.match(report,/data-action="approve"/);
 assert.match(report,/renderReplayWidget/);
 assert.match(report,/renderReportAppendix/);
 assert.match(report,/data-evidence/);
});
test("particles and gradients are lightweight, accessible and reduced-motion aware",()=>{
 assert.match(css,/\.lux-ambient::after/);
 assert.match(css,/radial-gradient/);
 assert.match(css,/@keyframes lux-drift/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/touch-action:manipulation|pointer-events:none/);
 assert.doesNotMatch(css,/@import|https?:\/\//);
 assert.match(html,/href="\/src\/cinematic-ui\.css\?v=premium-cinematic-20261030"/);
 assert.doesNotMatch(main,/import\s+["'][^"']+\.css["']/);
});
test("candidate and observer keep original work sample controls despite fewer words",()=>{
 const s=mock();
 const deps={activeTab:"guest",safe:x=>String(x),euro:n=>String(n),fmt:x=>x?.slice(11,16),renderChat:()=>"<div>Chat</div>"};
 const candidate=renderFrontDeskStudio(s,deps),observer=renderStudioObserver(s,deps);
 assert.match(candidate,/fd-cockpit/);
 assert.match(candidate,/Front Desk\./);
 assert.match(candidate,/data-studio-tab="arrival"/);
 assert.match(candidate,/data-studio-tab="phone"/);
 assert.match(candidate,/data-studio-tab="invoice"/);
 assert.match(candidate,/data-studio-tab="handover"/);
 assert.match(observer,/Lena Weber/);
 assert.match(observer,/Housekeeping/);
 assert.match(observer,/Rechnung/);
});
