# Skill: Tactical Readiness Checklist (TRC)

> Evaluates **granular, tactical production concerns** that cause real-world incidents — data migration edge cases, timezone mismatches, rollback gaps, concurrency bugs, etc.
>
> **Activation:** Run once after the Requirement Readiness Gate (RRG) scores Green (meets the calibrated threshold from RRG §3E — default ≥ 80%, adjusted by Phase 1A Criticality Tier and Lifecycle Stage). Never loaded during RRG Amber/Red loops.
>
> **This file is a reference definition.** Consumed by:
> - `/sdd-create-specs` Step 2B (full evaluation — archetype-filtered)
> - `/sdd-fix` Tier 3 (abbreviated — critical-only checks)
>
> **Credit optimisation:** Only load checks tagged for the detected archetype. Skip irrelevant categories entirely.

---

## How It Works

1. **Receive the archetype** from the RRG (Step 2A)
2. **Filter** — load only categories and checks tagged for that archetype
3. **Investigate before asking** — for every check that involves a data entity, schema, shared resource, or integration boundary, **scan the codebase first** to map the blast radius: grep for all references (code, config, queries, tests, documentation) to the affected entity across all projects. Present the scan findings alongside the check — not as a question ("what's the impact?") but as a report ("here are the 14 references I found across 3 modules; which of these are affected?"). Only ask the user for decisions the scan cannot resolve (e.g., intended behaviour, business rules, rollback preferences). For checks with no scannable codebase artifact (e.g., deployment targets, SLA values), fall back to JIRA content, spec Section 4.0, and POD knowledge.
4. **Surface gaps** — present unresolved tactical checks to the user in a single prompt, accompanied by scan evidence where available
5. **Record** — capture findings in spec Section 4.0A (Tactical Readiness)
6. **No scoring loop** — TRC is a single-pass flag-and-record step, not a gating loop. Unresolved tactical items become spec assumptions or open questions, not blockers.

---

## Archetype Applicability Key

Each check is tagged with applicable archetypes. Load only tagged checks.

| Tag | Archetype |
|---|---|
| `API` | Service/API |
| `UI` | UI/Frontend |
| `DP` | Data Pipeline |
| `INT` | Integration |
| `PLAT` | Platform/Infra |
| `PKG` | Packaged Software (SFDC, SAP, etc.) |
| `LIB` | Library/SDK |
| `ALL` | Applies to all archetypes |
| `AI` | AI/ML |

---

## Category 1 — Data Integrity & Migration

**Parent RRG Dimension:** D9 (Data & Entity Relationships)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 1.1 | **Schema change impact** | `ALL` | Adding/renaming/retyping columns — impact on existing records? Null backfill strategy? Default values? Index rebuild time on large tables? |
| 1.2 | **Migration reversibility** | `ALL` | Forward DDL/DML migration exists — is there a matching rollback migration? Has it been tested? |
| 1.3 | **Data backfill strategy** | `API` `DP` `INT` | New column requires historical data — batch job? one-time script? default value? Estimated duration on production data volume? |
| 1.4 | **Cross-service referential integrity** | `API` `INT` `DP` | Entity ID referenced across services — who owns lifecycle? Orphan detection? Cascade behavior? |
| 1.5 | **Soft delete vs hard delete** | `ALL` | Requirement says "delete" — soft (flag) or hard (remove)? Impact on FK constraints, reporting, legal holds, GDPR? |
| 1.6 | **Concurrent write handling** | `API` `UI` `DP` | Two users/processes modify same record — optimistic locking (version field)? Last-write-wins? Merge strategy? |
| 1.7 | **Field length, precision & detail completeness** | `ALL` | Field size in DB vs upstream/downstream systems. Decimal precision for financial amounts (e.g., 2 vs 4 decimal places). Truncation risk? **For every new or modified field**, verify the requirement specifies: exact field name, data type, default value, nullability, and display label. Cross-check against existing code artifacts (JSON schemas, DB migration files, ORM models, UI component prop types, API DTOs, config files). If the requirement uses vague terms ("add a status field") without specifying the exact name/type/values, flag as ⚠️ and ask the user — do not assume. If Phase 1B (Input Fidelity Scan) was not run prior to TRC (e.g., abbreviated mode path), additionally verify each field name is domain-meaningful — not a generic placeholder per RRG §Phase 1B signal S1. |
| 1.8 | **Character encoding** | `API` `UI` `INT` `DP` | UTF-8 throughout? Legacy systems using Latin1/ASCII? Emoji, CJK, special characters handled? |
| 1.9 | **Bulk operation impact** | `DP` `API` `INT` | Batch update/insert of large volumes — table locking? Transaction log growth? Replication lag? Chunking strategy? |
| 1.10 | **Audit trail** | `ALL` | Regulated or business-critical entity — change history captured? Who changed what, when? Immutable audit log? |

---

## Category 2 — Temporal Consistency

**Parent RRG Dimension:** Cross-cutting (feeds into D6 Performance, D9 Data, D3 Consumer)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 2.1 | **Storage timezone convention** | `ALL` | All timestamps stored in UTC? Existing data consistent? Mixed conventions? |
| 2.2 | **Display timezone** | `UI` `API` | UI shows user-local time? Server time? Business-rule time (e.g., "end of business day" in which timezone)? |
| 2.3 | **Integration timestamps** | `API` `INT` `DP` | Timestamps sent to/received from partner systems — whose timezone? ISO 8601 enforced? |
| 2.4 | **DST transitions** | `ALL` | Scheduled jobs, SLA calculations, reporting periods — correct across daylight saving changes? |
| 2.5 | **Date-only vs datetime** | `API` `UI` `DP` | "Created date" — is time component significant? Interpretation differences across DB, API, UI? |
| 2.6 | **Clock skew** | `API` `INT` `DP` | Distributed services — event ordering by timestamp unreliable if clocks diverge. NTP configured? |
| 2.7 | **Filter/sort by date** | `UI` `API` | "Today's records" — today in whose timezone? Sort by date — which representation (UTC, local, business)? |

---

## Category 3 — Visualization & Presentation Integrity

**Parent RRG Dimension:** D3 (Consumer Identity)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 3.1 | **Pagination strategy** | `UI` `API` | Offset-based (breaks with concurrent inserts) vs keyset/cursor-based? Total count query on large tables? |
| 3.2 | **Sort stability** | `UI` `API` | Sorting by non-unique field — order inconsistent across pages? Secondary sort key defined? |
| 3.3 | **Filter-sort-paginate interaction** | `UI` `API` | Server-side or client-side filtering? Filters on computed/derived fields? Index-backed? |
| 3.4 | **Number & currency formatting** | `UI` | Locale-specific: `1,234.56` vs `1.234,56`. Currency symbol placement. Decimal precision. |
| 3.5 | **Null/empty/zero display** | `UI` | Null vs empty string vs zero — each means different things. How does UI distinguish? Placeholder text? |
| 3.6 | **Loading, error, empty states** | `UI` | Requirement describes happy path — what does user see on timeout? Empty result? Partial failure? |
| 3.7 | **Stale data indication** | `UI` `API` | Cached data displayed — "last updated" indicator? Auto-refresh interval? Manual refresh? |
| 3.8 | **Export consistency** | `UI` `API` | Excel/CSV/PDF export — same filters, timezone, formatting as screen? Large export handling (async + download link)? |
| 3.9 | **Accessibility (WCAG)** | `UI` | Screen reader support, keyboard navigation, color contrast (WCAG 2.1 AA minimum)? |
| 3.10 | **Browser/device matrix** | `UI` | Supported browsers/versions? Mobile responsive? Minimum viewport width? |

---

## Category 4 — Rollback & Recovery

**Parent RRG Dimension:** D10 (Resilience & Response Model)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 4.1 | **Code-schema compatibility** | `ALL` | Previous code version works with new DB schema? (backward-compatible migrations required for zero-downtime) |
| 4.2 | **Data rollback strategy** | `ALL` | Schema rolled back but new-format data exists — transformation script? Data loss acceptable? |
| 4.3 | **Feature flag kill switch** | `API` `UI` `INT` | Feature can be disabled in production without deployment? Flag granularity (global, per-tenant, per-user)? |
| 4.4 | **External side-effect compensation** | `API` `INT` `DP` | Email sent, payment charged, event published — can't unsend. Compensation/reversal mechanism? |
| 4.5 | **Multi-service deployment ordering** | `API` `INT` `PLAT` | DB migration → config → service A → service B — ordering documented? What if step 3 fails? |
| 4.6 | **Rollback procedure tested** | `ALL` | Rollback script/process exists AND has been executed in a non-prod environment? |
| 4.7 | **Progressive rollout** | `API` `UI` `PLAT` | 100% immediate or staged (canary, percentage-based)? Blast radius control? |
| 4.8 | **Rollback window** | `ALL` | How long after deployment is rollback feasible? After data backfill completes, rollback may be destructive. |

---

## Category 5 — Concurrency & Distributed State

**Parent RRG Dimension:** D10 (Resilience), D9 (Data)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 5.1 | **Race conditions** | `API` `DP` `INT` | Two requests to same resource simultaneously — defined behavior? Test coverage? |
| 5.2 | **Distributed locks** | `API` `DP` `INT` | Lock mechanism (Redis, DB advisory, ZooKeeper)? Lock timeout? Deadlock prevention? |
| 5.3 | **Eventual consistency window** | `API` `INT` `DP` | After write, how long until all readers see the update? Acceptable for the use case? |
| 5.4 | **Idempotency** | `API` `INT` `DP` | Retry of same request produces same result? Idempotency key mechanism? Which operations need it? |
| 5.5 | **Event ordering** | `DP` `INT` `API` | Events arrive out of order — consumer handles reordering? Sequence number or timestamp-based? |
| 5.6 | **Duplicate detection** | `DP` `INT` `API` | Same message delivered twice — deduplication window? Dedup key strategy? |
| 5.7 | **State machine validity** | `API` `UI` `DP` | Entity lifecycle transitions — invalid transitions blocked? (e.g., SHIPPED → PENDING) |
| 5.8 | **Long-running transaction impact** | `DP` `API` | Transaction holds locks for extended period — blocking other operations? Timeout configured? |

---

## Category 6 — Backward Compatibility & Versioning

**Parent RRG Dimension:** D11 (Reuse & Discoverability)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 6.1 | **API contract compatibility** | `API` `INT` | Adding required field to request breaks existing consumers. Additive-only changes? |
| 6.2 | **Rolling deployment coexistence** | `API` `INT` `PLAT` | Old and new code run simultaneously during deployment — both work with same DB/config/message format? |
| 6.3 | **Message schema versioning** | `DP` `INT` `API` | Event/message format change — old consumers parse new messages? Schema registry? |
| 6.4 | **Client version skew** | `API` `UI` | Mobile apps can't force-update. API supports old client versions for N months? |
| 6.5 | **Deprecation communication** | `API` `INT` `LIB` | Field/endpoint removal — deprecation notice period? Migration guide? Sunset header? |
| 6.6 | **Config format compatibility** | `PLAT` `API` | Config format changes — old config files still parseable by new code? |

---

## Category 7 — Configuration & Environment Parity

**Parent RRG Dimension:** D4 (Deployment & Hosting)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 7.1 | **All-environment config** | `ALL` | New config value — added to dev AND staging AND prod? Not just local? |
| 7.2 | **Secret rotation impact** | `API` `INT` `PLAT` | Feature uses a secret — auto-reload on rotation or requires restart? |
| 7.3 | **Feature flag lifecycle** | `API` `UI` | Flag introduced for rollout — removal timeline? Owner? Tech debt tracking? |
| 7.4 | **Config drift detection** | `PLAT` | Production config diverged from IaC — deployment will overwrite manual fixes. Drift check? |
| 7.5 | **Transitive dependency risk** | `API` `LIB` `UI` | Transitive dependency upgraded — runtime break not caught at compile time? Lock file committed? |
| 7.6 | **Deployment artifact readiness** | `API` `UI` `DP` `INT` `PLAT` | RRG D4 declares the deployment model and Phase 1A classifies the Deployment Model dimension. Verify the corresponding deployment artifact exists in the project: Dockerfile/Containerfile for Containerized, `manifest.yml` for PaaS, `serverless.yml`/SAM template for Serverless, Helm chart for K8s-managed, Ansible playbook for VM-based. If the required artifact is missing, flag as ⚠️ and route to plan Section 5 as a scaffolding task. For Library/SDK archetype (Deployment Model = Library), skip — no deployment artifact needed. |
| 7.7 | **IaC management model** | `PLAT` `API` `INT` | Infrastructure defined via IaC (Terraform, Pulumi, CloudFormation, Ansible) or manual? If IaC-managed, verify: IaC files in repo match deployed state? Drift detection configured? If manual, flag as risk for configuration drift and document the manual process. Scan for `.tf`, `pulumi.*`, `template.yaml`, `playbook.yml` files in repo. |

---

## Category 8 — Integration Chain Resilience

**Parent RRG Dimension:** D10 (Resilience), D2 (Larger Context)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 8.1 | **Timeout chain alignment** | `API` `INT` | Client → Gateway → Service → DB — timeouts must decrease downstream. Verified? |
| 8.2 | **Circuit breaker config** | `API` `INT` | Downstream fails — circuit breaker present? Fallback behavior? Half-open retry interval? |
| 8.3 | **Retry storm prevention** | `API` `INT` `DP` | Exponential backoff + jitter on retries? Retry budget (max N retries across all clients)? |
| 8.4 | **Partial failure in batch** | `DP` `API` `INT` | 100 records, 3 fail — whole batch rejected or partial success? Error reporting granularity? |
| 8.5 | **Downstream SLA alignment** | `API` `INT` | Your SLA ≥ dependency SLA? If not, redundancy/cache/fallback planned? |
| 8.6 | **Contract testing in CI** | `API` `INT` `LIB` | Consumer-producer schema agreement verified automatically? Pact, Spring Cloud Contract, etc.? |
| 8.7 | **Payload size limits** | `API` `INT` | Gateway/LB limit vs service limit — large payload rejected silently at edge? |
| 8.8 | **Caching strategy** | `API` `UI` `INT` | Feature reads data that could benefit from caching — is a caching layer planned? Cache type (CDN, edge, application-level, database query cache)? Invalidation strategy (TTL, event-driven, manual)? Cache stampede prevention? Stale-while-revalidate policy? If caching exists, verify cache key design prevents cross-tenant data leakage (ref: Phase 1A Multi-tenancy classification). |

---

## Category 9 — Compliance & Audit

**Parent RRG Dimension:** D12 (Platform Constraints)

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 9.1 | **PII in logs** | `ALL` | Request/response logging contains PII (SSN, email, card number)? Masking/redaction configured? |
| 9.2 | **Data retention policy** | `ALL` | How long is data kept? Auto-purge job? Legal hold override mechanism? |
| 9.3 | **Right to deletion** | `API` `UI` `DP` | User requests full data deletion — achievable across DB, backups, caches, logs, analytics, downstream copies? |
| 9.4 | **Non-prod data masking** | `ALL` | Production data copied to staging/dev — PII masked? Synthetic data alternative? |
| 9.5 | **License compliance** | `ALL` | New library/dependency — license compatible? (GPL contamination risk, commercial restrictions) |
| 9.6 | **Change management** | `PLAT` `PKG` | CAB approval needed? Change window restrictions? Emergency change process? |

---

## Category 10 — Operational Readiness

**Parent RRG Dimension:** D8 (Observability) — extends beyond into Day-2 ops

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 10.1 | **Monitoring & alerting** | `ALL` | New endpoint/job/flow — monitored? Alert thresholds defined? Escalation path? |
| 10.2 | **Runbook** | `API` `DP` `INT` `PLAT` | Failure scenario documented? Recovery steps for ops/L2 support? |
| 10.3 | **Backup coverage** | `DP` `PLAT` `API` | New data store introduced — included in backup schedule? Restore tested? |
| 10.4 | **Disaster recovery** | `API` `PLAT` `DP` | RPO/RTO defined? DR environment updated to include new component? |
| 10.5 | **Graceful shutdown** | `API` `DP` `INT` | SIGTERM during in-flight request — complete or drop? Drain timeout configured? |
| 10.6 | **Resource exhaustion** | `API` `DP` `INT` | Connection pool, thread pool, file handles, disk — limits configured? Alerts on thresholds? |
| 10.7 | **Log volume** | `ALL` | New verbose logging — disk/aggregator capacity? Log level configurable at runtime? |
| 10.8 | **Capacity planning** | `API` `DP` `PLAT` | Data growth projection → storage/compute needs at 6/12/24 months? |
| 10.9 | **Support handover** | `ALL` | L1/L2/L3 support briefed? Escalation path documented? Known-issue list updated? |

---

## Category 11 — Requirement Clarity Artifacts

**Parent RRG Dimension:** Cross-cutting (improves fill quality of all dimensions)

This category is different — it doesn't check production concerns but ensures the requirement is expressed clearly enough to avoid misinterpretation.

| # | Check | Applies To | When to Request |
|---|---|---|---|
| 11.1 | **Data flow diagram** | `API` `INT` `DP` | Requirement references 3+ systems and no visual flow exists |
| 11.2 | **State transition diagram** | `API` `UI` `DP` | Entity has lifecycle states (e.g., order, claim, ticket) |
| 11.3 | **Sequence diagram** | `API` `INT` | Multi-service interaction with conditional branching |
| 11.4 | **Wireframe/mockup** | `UI` | UI change described only in words — no visual reference |
| 11.5 | **Decision matrix** | `ALL` | Multiple valid approaches — ask user to rank priorities (speed, cost, quality, risk) |
| 11.6 | **Edge case inventory** | `ALL` | Ask: "What should happen when input is null / empty / max value / concurrent / out of order?" |
| 11.7 | **Negative requirements** | `ALL` | Ask: "What should the system explicitly NOT do?" (prevents gold-plating) |
| 11.8 | **Requirement precision** | `ALL` | When the requirement uses an ambiguous action verb (transform, process, handle, manage, normalize, clean, enrich, massage) or omits key parameters (sort by what? recent means what time window? threshold means what value?), demand a precise definition — ideally as input → rule → expected output. Do not assume the most common interpretation. When the requirement includes inline URLs or system references, verify they are domain-real per RRG §Phase 1B signal S2 — not reserved-domain placeholders (`example.com`, `test.com`) or structurally mismatched tool URLs. |
| 11.9 | **Sample data as specification** | `ALL` | When the requirement describes data transformation, mapping, validation, filtering, or formatting, demand representative sample input and expected output. These become golden test cases. If the user cannot provide samples, co-create them and get confirmation. |
| 11.10 | **Process re-runnability & recovery** | `DP` `INT` `API` | For any batch, import, migration, sync, or scheduled operation — demand: what happens on re-run (resume vs restart)? How are duplicates detected? What if a previous run partially completed? What is the conflict resolution rule when new data contradicts existing data? |
| 11.11 | **Human-in-the-loop completeness** | `ALL` | When the requirement includes a human decision, approval, review, or manual step — demand: routing rules (who?), channel (how are they notified?), timeout (what if no response?), escalation (what if timeout expires?), delegation (can someone else act?), and interim state (what is the entity's status while waiting?). |

**Handling:** If a clarity artifact is needed but not provided, the agent should **offer to co-create it** (e.g., generate a Mermaid diagram from the requirement text for user review, generate sample data for confirmation) rather than blocking.

---

## Category 12 — Domain-Specific Tactical Checks

**Parent RRG Dimension:** D12 (Platform Constraints)

Activate based on domain tags in JIRA labels, project metadata, or user indication. Only one domain block loads per evaluation.

### Financial / Banking
| # | Check | What to Verify |
|---|---|---|
| 12.F1 | **Decimal precision & rounding** | Precision (2 vs 4 decimal places), rounding mode (HALF_UP, HALF_EVEN), currency-specific rules |
| 12.F2 | **Double-entry consistency** | Every debit has a matching credit? Reconciliation check? |
| 12.F3 | **Transaction isolation** | Isolation level (READ_COMMITTED, SERIALIZABLE)? Phantom reads acceptable? |
| 12.F4 | **Regulatory reporting** | New data field impacts regulatory reports? Format compliance (ISO 20022, SWIFT)? |
| 12.F5 | **Reconciliation strategy** | End-of-day/real-time reconciliation between systems? Mismatch handling? |

### E-commerce / Retail
| # | Check | What to Verify |
|---|---|---|
| 12.E1 | **Inventory consistency** | Oversell prevention? Reservation mechanism? Stock sync across channels? |
| 12.E2 | **Payment idempotency** | Duplicate charge prevention? Payment gateway retry handling? |
| 12.E3 | **Order state machine** | Valid transitions enforced? Concurrent state changes handled? |
| 12.E4 | **Price calculation precision** | Tax, discount, promotion stacking — order of operations defined? Rounding at which step? |
| 12.E5 | **Tax jurisdiction** | Tax rules per region/country? Nexus determination? |

### Insurance
| # | Check | What to Verify |
|---|---|---|
| 12.I1 | **Effective dating** | Policy version effective date — past-dated changes? Future-dated? Overlapping periods? |
| 12.I2 | **Claims workflow** | State machine for claims lifecycle? Reopening closed claims? |
| 12.I3 | **Premium recalculation** | Change triggers recalculation? Mid-term adjustments? Pro-rata logic? |
| 12.I4 | **Document generation** | Policy documents regenerated on change? Version control? |

### Telecom
| # | Check | What to Verify |
|---|---|---|
| 12.T1 | **Provisioning idempotency** | Service activation retried — duplicate provisioning prevented? |
| 12.T2 | **CDR processing order** | Call detail records arrive out of order — handled? |
| 12.T3 | **Usage metering precision** | Rounding of usage units (bytes, seconds, messages)? Billing disputes? |
| 12.T4 | **Service dependency chain** | Activating service B requires service A active — dependency enforcement? |

### Manufacturing / IoT
| # | Check | What to Verify |
|---|---|---|
| 12.M1 | **Ingestion backpressure** | Sensor data rate exceeds processing — buffer? Drop? Alert? |
| 12.M2 | **Machine state management** | State transitions from sensor data — stale sensor readings handled? |
| 12.M3 | **Firmware compatibility** | New backend compatible with older firmware versions on devices? |
| 12.M4 | **Edge vs cloud processing** | What runs at edge, what in cloud? Network partition handling? |

### Logistics
| # | Check | What to Verify |
|---|---|---|
| 12.L1 | **Geospatial precision** | Coordinate precision (decimal places)? Projection/datum consistency? |
| 12.L2 | **Route recalculation triggers** | What events trigger rerouting? Real-time vs scheduled? |
| 12.L3 | **Tracking update frequency** | Real-time GPS vs periodic polling? Battery/bandwidth impact? |
| 12.L4 | **Delivery window timezones** | "Deliver by 5 PM" — whose timezone? Sender, recipient, warehouse? |

### Packaged Software (SFDC / SAP / ServiceNow)
| # | Check | What to Verify |
|---|---|---|
| 12.P1 | **Governor limits** | SOQL row limits, API call caps, CPU time limits, heap size? |
| 12.P2 | **Trigger recursion** | Trigger fires on update → updates same object → infinite loop? Recursion guard? |
| 12.P3 | **Sharing model impact** | Record visibility changes? OWD, sharing rules, role hierarchy affected? |
| 12.P4 | **Managed package conflicts** | Namespace collisions? Dependency on managed package version? |
| 12.P5 | **Bulk API limits** | Bulk data load — batch size limits? Parallel processing limits? |

---

## Category 13 — AI & Data Engineering

**Parent RRG Dimension:** D7 (Scalability), D8 (Observability), D9 (Data)
**Activation:** Only loaded when Phase 1A AI/ML Component ≠ `None`. Skip entirely for non-AI workloads.

| # | Check | Applies To | What to Verify |
|---|---|---|---|
| 13.1 | **Model hosting & serving** | `AI` `API` | Model served via API endpoint, embedded in app, or edge deployment? Inference latency target? Model size vs available memory? Cold start impact for serverless model hosting? |
| 13.2 | **GPU / accelerator requirement** | `AI` | Training or inference requires GPU/TPU? GPU type and VRAM requirement specified? Local dev GPU availability vs cloud GPU? Cost implications of GPU compute? Fallback to CPU (with acceptable latency) for local testing? |
| 13.3 | **Reproducibility** | `AI` `DP` | ML experiment reproducibility: random seed pinned? Environment (Python version, CUDA version, library versions) locked? Training data snapshot versioned? Model output deterministic or probabilistic — and is the variance acceptable? |
| 13.4 | **Eval & guardrails** | `AI` | Model evaluation metrics defined (accuracy, F1, BLEU, perplexity)? Guardrails for harmful/incorrect output (content filtering, output validation, confidence thresholds)? Human-in-the-loop review for critical decisions? A/B testing or shadow-mode evaluation before full rollout? |
| 13.5 | **Drift monitoring** | `AI` | Data drift detection configured (input distribution monitoring)? Model performance drift alerting (accuracy degradation over time)? Retraining trigger criteria defined? Monitoring dashboard for model health? |
| 13.6 | **Pipeline orchestration** | `AI` `DP` | ETL/ELT/CDC pipeline — orchestration tool (Airflow, Dagster, Prefect, cron, cloud-native)? DAG/workflow definition exists? Retry and failure handling for individual pipeline stages? Data quality checks between stages? Pipeline idempotency (re-run safety)? |
| 13.7 | **Data format & schema evolution** | `AI` `DP` | Data serialization format (Parquet, Avro, JSON, CSV, Delta Lake)? Schema evolution strategy (backward/forward compatible)? Schema registry? Data lineage tracking (where did this data come from, what transformations applied)? |
| 13.8 | **Model versioning & rollback** | `AI` | Model versions tracked (MLflow, Weights & Biases, DVC, model registry)? Rollback to previous model version possible without code deployment? A/B or canary model deployment supported? Model artifacts stored durably (not just on developer's machine)? |

---

## Spec Integration: Section 4.0A

TRC findings are recorded in `specs.md` as **Section 4.0A — Tactical Readiness** immediately after Section 4.0 (Requirement Readiness Assessment):

```markdown
## Tactical Readiness

| Field | Value |
|---|---|
| Categories Evaluated | {N} of 13 (archetype-filtered) |
| Checks Evaluated | {N} |
| Flags Raised | {N} |
| Auto-Resolved | {N} |
| Evaluation Date | {YYYY-MM-DD} |

### Flagged Items
| # | Category | Check | Status | Detail |
|---|---|---|---|---|
| 1 | Data Integrity | 1.1 Schema change impact | ⚠️ Open | Adding column `status` to `orders` — 50M existing rows need default value |
| 2 | Temporal | 2.2 Display timezone | ✅ Resolved | User-local time; UTC in API; confirmed by user |
| 3 | Rollback | 4.3 Feature flag | ✅ Resolved | [AUTO-RESOLVED] Feature flag framework exists — POD knowledge |
| 4 | Clarity | 11.2 State diagram | 📎 Attached | Agent-generated Mermaid diagram reviewed by user |

### Items Flowing to Spec Sections
| TRC Check | Flows To |
|---|---|
| 1.1 Schema impact | §4.8 Impacted Areas, §4.7 NFR (Data) |
| 2.2 Display timezone | §4.5 FR (timezone handling requirement) |
| 4.3 Feature flag | §4.7 NFR (Deployment) |
| 11.2 State diagram | §4.3 Background (embedded diagram) |
```

### Handling Rules

- **⚠️ Open items** → become Open Questions in spec §4.9 or Assumptions (if a safe default exists)
- **✅ Resolved items** → flow into their target spec sections (FR, NFR, Impacted Areas)
- **📎 Attached artifacts** → embedded in §4.3 (Background) or linked from §4.5 (FRs)
- **Skipped items** → not recorded (they were filtered out by archetype tag)

---

## Abbreviated Mode (for `/sdd-fix` Tier 3)

When invoked from Tier 3 enhancements:

1. **Load only categories where parent RRG dimension had weight ≥ 2** for the archetype
2. **Within each loaded category, evaluate only checks marked `ALL` or matching the archetype**
3. **Limit output to top 5 flagged items** (vs unlimited in full mode)
4. **No clarity artifacts requested** (Category 11 skipped) — enhancement scope is too narrow
5. **Domain-specific checks (Category 12) skipped** unless the JIRA issue explicitly references domain-specific concerns
