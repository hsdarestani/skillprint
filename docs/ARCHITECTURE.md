# Architecture decision — Sprint 0

**ADR-001: Replayable structured assessment events before camera streams or generative scoring.**

The product brief separates observation of *work* from biometric/psychological inference. The first demonstrator therefore chooses a deterministic event stream, a rubric engine and human sign-off.

```text
                         SKILLPRINT LIVE / browser (Vite)
        Employer / Control Room                  Candidate / Test
                     |                                  |
                     +--------------+-------------------+
                                    |
                         REST + WebSocket events
                                    |
                      Cloudflare Worker (router)
                                    |
                         Durable Object / session
                        +------------------------+
                        | Token-based demo roles |
                        | Ordered event ledger   |
                        | Snapshot + live pushes |
                        +------------------------+
                                    |
                          Shared domain engine
                      deriveState() / evaluate()
                                    |
                     Evidence-linked report + human
                           approval (manual)
```

### Event model

An action has a unique `id`, ordered `sequence`, UTC `at`, `actor`, `type` and a **minimal** `payload`. The worker ensures authorized writes and persists events before broadcasting a new snapshot. Repeated action IDs are not appended twice. Browser network retries should use the same action ID.

Synthetic scenario: `hotel_frontdesk_invoice_v1`. Fixed fact set: total 240 EUR, corrected total 220 EUR, duplicated breakfast; rubric `hotel_reception_rubric_1.2`. Changes to criteria must be versioned and approved for **future** sessions before use in an actual recruitment context.

### Authorization in Sprint 0

A newly created session returns two 48-character hex capability secrets: observer and candidate. The server checks them before snapshot, action, approval or WebSocket subscription. Candidate may submit only allowed work actions; observer may add notes or approve after completion. Candidate snapshots omit notes and scores. This is a **demo authorization model only**, not production RBAC, GDPR-compliant access management, tenant isolation or a basis for candidate processing.

### Deliberate non-goals

- Not a hidden screen recorder. The mirrored view is reconstructed from permitted assessment events.
- Not a lie detector, emotion detector, biometric scorer or AI-powered hiring decision.
- Not an actual identity verifier or an AI customer yet.
- Not a claim that 100 demo rubric points equals a probability of successful employment.
- No customer payment data or private application content.

### Acceptance checks (current)

- The candidate can perform a hotel invoice task in a browser.
- Observer sees ordered actions in a separate role view.
- Event evidence IDs can be opened directly from the weighted rubric.
- Opening invoice before simulated verification records the privacy breach.
- The candidate role cannot write observer notes or finalize the outcome.
- Human approval remains unavailable until the candidate completes the assessment.
- A candidate can retry a repeated request with the same event ID without duplicate records.

### Pending before real pilots

1. Authentication, multi-tenant isolation, retention/deletion, data access logs, robust rate limits and intrusion testing.
2. Legal basis and risk analysis per country and hiring context, independent assessment validation, accessibility and fairness audits.
3. Realistic job analysis for Mehmet's actual roles, language-equivalent variants and reviewed scoring anchors.
4. Repeatable e2e tests under network interruptions, load testing, backpressure and operational monitoring.
5. AI role-play bounded by verified scenario facts and independently evaluated for hallucinations.
6. Event replay capable of reconstructing intermediate text/drawing artifacts; current UI replays **action details**, not full document-edit strokes.

**Status:** functional architecture prototype; no claim of compliance, assessment validity or production readiness.
