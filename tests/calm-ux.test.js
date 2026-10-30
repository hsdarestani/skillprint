import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main=readFileSync("src/main.js","utf8");
const studio=readFileSync("src/frontdesk-studio.js","utf8");
const css=readFileSync("src/style.css","utf8");
const between=(a,b)=>main.slice(main.indexOf(a),main.indexOf(b,main.indexOf(a)));
test("landing has one visible primary start, secondary demo is optional",()=>{
 const dashboard=between("function dashboard()","function guestMessage(");
 assert.equal((dashboard.match(/data-action="create-advanced"/g)||[]).length,1);
 assert.equal((dashboard.match(/data-action="create"/g)||[]).length,1);
 assert.match(dashboard,/Demo starten/);
 assert.match(dashboard,/<details class="calm-details/);
 assert.doesNotMatch(dashboard,/feature-grid|demo-brief|hero-proof/);
});
test("top navigation is not duplicated in a sidebar",()=>{
 const draw=between("function draw()","async function onClick(");
 assert.doesNotMatch(draw,/sidebar\(r\)/);
 assert.match(draw,/calm-app-grid/);
 const header=between("function header(r)","function sidebar(r)");
 assert.match(header,/>Live<\/a>/);
 assert.match(header,/>Bericht<\/a>/);
});
test("Control Room highlights four events but retains full timeline and notes",()=>{
 const control=between("function control()","function reportView()");
 assert.match(control,/events.slice\(-4\).reverse\(\)/);
 assert.match(control,/data-panel="control-all-events"/);
 assert.match(control,/data-panel="control-tools"/);
 assert.match(control,/data-action="note"/);
 assert.match(control,/copy-candidate/);
 assert.match(control,/renderStudioObserver/);
});
test("report keeps evidence links, replay, human review and printing",()=>{
 const report=between("function reportView()","function loading()");
 assert.match(report,/data-evidence/);
 assert.match(report,/data-panel="report-replay"/);
 assert.match(report,/renderReplayWidget/);
 assert.match(report,/renderReportAppendix/);
 assert.match(report,/data-action="print"/);
 assert.match(report,/data-action="approve"/);
});
test("drawing and operational sections survive live updates",()=>{
 assert.match(studio,/data-panel="candidate-ink"/);
 assert.match(studio,/expanded.has\("candidate-arrival"\)/);
 assert.match(studio,/expanded.has\("candidate-phone"\)/);
 assert.match(main,/root.addEventListener\("toggle"/);
 assert.match(main,/expandedPanels:openPanels/);
});
test("mobile view follows quiet hierarchy and readable five-way navigation",()=>{
 assert.match(studio,/TABS.filter\(t=>t.id!=="learning"\)/);
 assert.match(studio,/data-studio-tab="learning"/);
 assert.match(css,/.calm-three/);
 assert.match(css,/\.fd-mobile-tabs\{grid-template-columns:repeat\(5/);
});
