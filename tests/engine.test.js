import test from "node:test";
import assert from "node:assert/strict";
import { newSession, appendAction, deriveState, evaluate, SCENARIO } from "../src/engine.js";

function act(s, type, extra = {}) { return appendAction(s, { type, ...extra }, "candidate"); }
test("correct hotel process produces evidence and a full illustrative rubric", () => {
  let s = newSession("sl-test");
  s = act(s, "ask_guest");
  s = act(s, "verify_identity");
  s = act(s, "open_invoice");
  s = act(s, "compare_items");
  s = act(s, "correct_invoice", { amount: SCENARIO.correct });
  s = act(s, "submit_reply", { text: "Sehr geehrte Frau Weber, die doppelte Frühstücksposition wurde entfernt. Der Gesamtbetrag ist nun 220 Euro." });
  assert.equal(s.status, "completed");
  assert.equal(evaluate(s.events).total, 100);
  assert.equal(evaluate(s.events).criteria.length, 5);
  assert.equal(deriveState(s.events).privacyBreach, false);
});
test("opening an invoice before verifying identity results in a privacy penalty", () => {
  let s = newSession("sl-test"); s = act(s, "open_invoice"); s = act(s, "verify_identity");
  assert.equal(deriveState(s.events).privacyBreach, true);
  assert.equal(evaluate(s.events).criteria.find(x => x.id === "privacy").points, 0);
});
test("candidate cannot send observer notes", () => assert.throws(() => act(newSession("x"), "observer_note", {text:"test notes"}), /FORBIDDEN/));
test("correcting the bill requires comparison", () => assert.throws(() => act(newSession("x"), "correct_invoice", {amount:220}), /COMPARE_INVOICE_FIRST/));
test("action retry is idempotent", () => {
  let s = newSession("x");
  s = appendAction(s, {type:"verify_identity", id:"retry_test_001"}, "candidate");
  s = appendAction(s, {type:"verify_identity", id:"retry_test_001"}, "candidate");
  assert.equal(s.events.length, 1);
});
test("observer notes require coach role", () => {
  const s = appendAction(newSession("x"), {type:"observer_note", text:"Prüfte Rechnung mit sinnvollem Zwischenschritt."}, "coach");
  assert.equal(s.events[0].actor, "observer");
});

test("completed answer can be safely retried with the same event ID", () => {
  let s = newSession("sl-finish");
  s = act(s, "open_invoice");
  const answer = {type:"submit_reply", id:"submit_retry_001", text:"Wir prüfen die Rechnung und melden uns bei Ihnen."};
  s = appendAction(s,answer,"candidate");
  assert.equal(s.status,"completed");
  s = appendAction(s,answer,"candidate");
  assert.equal(s.events.length,2);
  assert.throws(() => appendAction(s,{type:"verify_identity"},"candidate"),/ASSESSMENT_COMPLETED/);
});
