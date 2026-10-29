# Requirement Readiness Gate (RRG)

> A pre-spec interrogation layer that dynamically evaluates requirement completeness across **12 context dimensions**, scores it quantitatively, and gates entry into the design/plan phase.
>
> **This is Layer 1 (Strategic).** After this gate passes Green, Layer 2 — the Tactical Readiness Checklist (`sdd-tactical-readiness-checklist`) — runs a single-pass evaluation of granular production concerns (data migration, timezone handling, rollback, concurrency, backward compatibility, etc.).
>
> **This file is a reference definition.** It is consumed by:
> - `/sdd-create-specs` Step 2A (full evaluation — includes Phase 1B)
> - `/sdd-fix` Tier 3 Step 4A-pre (abbreviated evaluation — Phase 1B abbreviated)

---

## Phase 1 — Classify the Change Archetype

Before interrogating, classify the incoming requirement into a **change archetype**. The archetype determines which dimensions are mandatory and their weights.

Infer the archetype from the JIRA issue content and user's chat message. If ambiguous, ask the user to confirm.

| Archetype | Examples |
|---|---|
| **Service/API** | REST endpoint, gRPC service, webhook, microservice |
| **UI/Frontend** | New screen, component, dashboard, workflow |
| **Data Pipeline** | ETL, streaming job, batch processor, data migration |
| **Integration** | 3rd-party connector, internal service mesh, adapter |
| **Platform/Infra** | Deployment config, scaling, infrastructure migration |
| **Packaged Software** | Salesforce, SAP, ServiceNow customisation |
| **Library/SDK** | Shared module, internal package, utility library |
| **AI/ML** | LLM application, ML model training/inference, computer vision, NLP pipeline, recommender system |

---

## Phase 1A — Software Classification

After classifying the archetype, classify the software along **13 mandatory dimensions** grouped into 4 categories. Every dimension must be filled — no dimension may be skipped or assumed. Each is detected from evidence (codebase scan, JIRA content, POD knowledge, user input). If evidence is insufficient, ask the user — do not assume.

These classifications are recorded in spec Section 4.0 alongside the RRG scores and consumed by downstream skills (TRC, sdd-create-plan, sdd-create-specs, sdd-execute, sdd-fix).

### Group A — Identity & Criticality

| # | Dimension | Options | How to Detect | Downstream Consumer |
|---|---|---|---|---|
| A1 | **Criticality Tier** | `Mission-critical` — outage = business loss or safety risk / `Business-critical` — outage = significant operational impact / `Best-effort` — outage = inconvenience, workaround exists | JIRA priority, SLA tier from D6, business impact statements in description. If not explicit, ask. | RRG §3E threshold calibration; Plan test-strategy depth; Execute verification strictness |
| A2 | **Data Sensitivity** | `Public` — no restrictions / `Internal` — org-internal only / `Confidential` — access-controlled, PII/PHI / `Restricted` — regulated (financial, health, classified) | D5 (Security & Access) data classification answer; scan codebase for PII annotations, encryption patterns, data masking utilities. | TRC Cat 9 (all checks mandatory if Confidential/Restricted); Spec §4.7 NFRs (Security); Execute §8 (no PII in logs) |
| A3 | **Lifecycle Stage** | `Prototype` — throwaway/experimental / `MVP` — first viable release / `Production` — live, serving users / `Legacy` — maintained but not actively developed / `Deprecated` — scheduled for decommission | Check JIRA labels, POD knowledge, repo README, commit frequency, deployment history. New repo with no CI = likely Prototype. Established repo with SLA = Production. | RRG §3E threshold calibration; Fix ceremony level (Prototype → always Tier 1); Plan skip heavy infra for Prototype/MVP |
| A4 | **Multi-tenancy** | `Single-tenant` — one customer/org per instance / `Multi-tenant` — shared infrastructure, tenant-isolated data / `Not-applicable` — no tenant concept (library, tooling, infra) | Scan codebase for tenant ID in models/DTOs, tenant filters in queries, tenant-scoped auth tokens, tenant config. Check POD knowledge for tenancy model. | TRC Cat 5 (tenant isolation in concurrent writes); TRC Cat 9 (data segregation); Spec §4.7 NFRs (isolation); D5 probes (tenant-scoped auth) |

### Group B — Architecture & State

| # | Dimension | Options | How to Detect | Downstream Consumer |
|---|---|---|---|---|
| B1 | **Topology** | `Standalone` — single deployable unit, no interlocks / `Distributed` — central app + one or more interlocks | Count interlocks identified during D2 and D9. Zero interlocks = Standalone. | Plan §2C.1 workspace topology; Contract generation (skip if Standalone with no interlocks) |
| B2 | **Workspace Scope** | For each component: `Local` — source in workspace / `Remote` — hosted externally | Scan `ai/submodules/` and workspace root for each component's codebase. | Plan §2C.1 test strategy (Local→real instance, Remote→mock/stub); Plan §6 local simulation |
| B3 | **Layer Profile** | `UI` / `Service` / `Data` / `Integration` — one or more | Infer from archetype + JIRA description + impacted file types (controllers, services, repositories, UI components). | Fix §3C error-layer classification; TRC check filtering; Spec §4.8 impacted areas structure |
| B4 | **Statefulness** | `Stateless` — no server-side session/state between requests / `Stateful` — maintains session, cache, or in-memory state / `Mixed` — some components stateful, some stateless | Scan codebase for session stores, in-memory caches, WebSocket connections, sticky session config, state management libraries (Redux, MobX). Check deployment config for session affinity. | TRC Cat 4 (rollback: stateful needs state migration); TRC Cat 5 (concurrency: mandatory for stateful); Plan scaling strategy (stateless→horizontal easy, stateful→needs session replication) |
| B5 | **Runtime Model** | `Real-time` — synchronous request/response / `Batch` — scheduled bulk processing / `Streaming` — continuous event processing / `Scheduled` — cron/timer-triggered / `On-demand` — triggered by external event / `Mixed` | Scan for cron expressions, scheduler configs, message consumer annotations, REST controllers, event listeners. Check JIRA description for processing patterns. | TRC Cat 2 (DST: critical for Scheduled); TRC Cat 10 (monitoring: Batch→job completion, Real-time→latency); Plan test strategy (Batch→sample data, Streaming→event simulation) |

### Group C — Deployment & Infrastructure

| # | Dimension | Options | How to Detect | Downstream Consumer |
|---|---|---|---|---|
| C1 | **Deployment Model** | `Containerized` (Docker/K8s/Podman) / `PaaS` (PCF/Heroku) / `Serverless` (Lambda/Functions) / `VM` (Ansible/Packer) / `Library` (published artifact, no deployment) / `Hybrid` | Scan for Dockerfile, Containerfile, manifest.yml, serverless.yml, Helm charts, Ansible playbooks, build publish configs. Check D4 answer and POD knowledge (`ai/knowledge/deployment-spec.md`). | TRC 7.6 (deployment artifact readiness); Plan §2A deployment concern; Execute §8 artifact existence gate |
| C2 | **Security Testability** | `Local-testable` — auth can be mocked/overridden locally / `Restricted` — requires production-like credentials, corporate IdP, or org-issued certs | Scan D5 answer and codebase auth patterns. Corporate SSO, vault with production-only policies, mTLS with org certs → Restricted. Mock auth config present → Local-testable. | Plan §2C security test contingency; Plan §5 test strategy ([REQUIRES_AUTH_SETUP] markers) |

### Group D — Data & AI

| # | Dimension | Options | How to Detect | Downstream Consumer |
|---|---|---|---|---|
| D-1 | **Data Volume Tier** | `Small` (<1 GB) / `Medium` (1–100 GB) / `Large` (100 GB–1 TB) / `Massive` (>1 TB) / `Not-applicable` (no persistent data) | Check DB size indicators: table row counts in migrations/seed data, data retention policies, volume estimates in JIRA/POD knowledge. Scan for pagination configs, bulk processing chunk sizes. If unknown, ask. | TRC 1.3 (backfill strategy: Large/Massive→chunking mandatory); TRC 1.9 (bulk impact weighted by volume); Plan test data sizing and performance test planning |
| D-2 | **AI/ML Component** | `None` / `LLM` (large language model) / `Classical-ML` (regression, classification, clustering) / `Computer-Vision` / `NLP` / `Recommender` / `Data-Pipeline-Only` (ETL/ELT/CDC with no ML) | Scan for ML frameworks (TensorFlow, PyTorch, scikit-learn, Hugging Face, LangChain, OpenAI SDK), model files (.pt, .onnx, .pkl, .safetensors), training scripts, inference endpoints, pipeline orchestration (Airflow, Dagster). Check JIRA labels and description. | TRC Cat 13 (AI & Data Engineering checks — activated if not None); Plan GPU/accelerator requirements; Plan model hosting strategy; RRG D4/D7 weights adjusted for AI workloads |

### Classification Output Format

Present all 13 dimensions:

```
=== Software Classification ===

Identity & Criticality:
  Criticality Tier:     {Mission-critical / Business-critical / Best-effort}
  Data Sensitivity:     {Public / Internal / Confidential / Restricted}
  Lifecycle Stage:      {Prototype / MVP / Production / Legacy / Deprecated}
  Multi-tenancy:        {Single-tenant / Multi-tenant / Not-applicable}

Architecture & State:
  Topology:             {Standalone / Distributed}
  Workspace Scope:
    - {component}:      {Local (path) / Remote (url)}
  Layer Profile:        {UI, Service, Data, Integration}
  Statefulness:         {Stateless / Stateful / Mixed}
  Runtime Model:        {Real-time / Batch / Streaming / Scheduled / On-demand / Mixed}

Deployment & Infrastructure:
  Deployment Model:     {Containerized / PaaS / Serverless / VM / Library / Hybrid}
  Security Testability: {Local-testable / Restricted}

Data & AI:
  Data Volume Tier:     {Small / Medium / Large / Massive / Not-applicable}
  AI/ML Component:      {None / LLM / Classical-ML / CV / NLP / Recommender / Data-Pipeline-Only}
```

### Evidence Rule

Every classification value MUST cite its evidence source:
- `[DETECTED from {file/config/pattern}]` — found in codebase
- `[RESOLVED from JIRA]` — stated in issue description/labels
- `[RESOLVED from POD knowledge]` — found in ai/knowledge/ specs
- `[USER-PROVIDED]` — explicitly stated by user
- `[ASKED — awaiting response]` — evidence insufficient, question presented to user

Never assign a classification value without an evidence citation. If no evidence exists and the user has not been asked, the dimension must be flagged for user input.

---

## Phase 1B — Input Fidelity Scan

After Phase 1A classification, scan **all raw requirement inputs** (JIRA description, acceptance criteria, user's chat message, inline artifacts) for content that is placeholder, dummy, or template data rather than genuine requirement detail. This prevents non-authentic content from being consumed as valid input during Phase 2 interrogation and auto-resolution.

### Scan Scope

| Source | What to Scan |
|---|---|
| JIRA description | Full text including inline code, tables, lists |
| JIRA acceptance criteria | All AC text (Gherkin or free-form) |
| User's chat message | Full text including pasted content |
| Inline attachments | JSON, YAML, XML, SQL, or config snippets embedded in the above |

### Fidelity Signal Categories

Detect the following signal categories using **heuristic pattern recognition** — not a fixed blocklist. The examples are illustrative; the agent must generalise to any content exhibiting the same pattern.

#### S1 — Placeholder Identifiers
Identifiers following generic/sequential naming rather than domain-meaningful names:
- `field1`, `field2`, `columnA`, `testField`, `myField`, `attr1`
- Metasyntactic: `foo`, `bar`, `baz`, `qux`, `quux`, `waldo`, `fred`
- Generic entities: `Entity1`, `ObjectA`, `RecordType1`
- Generic paths: `/api/v1/resource1`, `/endpoint/thing`

**Heuristic:** Matches `{generic_word}{digit}`, `{letter}{digit}`, or well-known metasyntactic variable — AND has no domain context AND does not exist as a real identifier in the codebase.

#### S2 — Placeholder URLs & References
URLs or references pointing to non-real destinations:
- Reserved domains: `example.com`, `example.org`, `test.com`, `placeholder.url`, `your-domain.com`
- Hostname mismatch: URL claimed to be JIRA but doesn't match `JIRA_BASE_URL` from `local.config`; URL claimed to be Confluence/Figma/GitLab but structure doesn't match that tool's known pattern
- Incomplete: `http://...`, `https://TODO`, URLs containing `xxx`, `tbd`, `changeme`

**Heuristic:** Cross-reference every URL against known base URLs from `local.config` and `AGENTS.md`. Flag `example.*`, `test.*`, `placeholder.*`, `your-*.*` domains unconditionally.

#### S3 — Placeholder Values & Filler Content
Values that are clearly not real:
- Filler: `lorem ipsum`, `asdf`, `test123`, `xxx`, `TBD`, `TODO`, `N/A` (as a value, not a deliberate skip)
- Stock samples: `John Doe`, `Jane Smith`, `Acme Corp`, `user@example.com`, `password123`, `changeme`, `your-api-key-here`
- Sequential pattern data: `value1, value2, value3` where real domain values are expected

**Heuristic:** Value does not appear in the existing codebase AND matches a known placeholder pattern OR is clearly non-domain-specific in context.

**Production-grade enforcement:** When the consuming skill has determined `Delivery Scope = Full Production` (or Lifecycle Stage is Production, MVP, Legacy, or Deprecated), all S3 signals containing `TBD`, `TODO`, `N/A` (as placeholder value), `To be confirmed`, `Will confirm later`, `TBC`, or `Not yet decided` are classified as **🔶 Fidelity** (must resolve), never **⚪ Review**. TBD is not a valid answer for production-grade requirements. Under `Proof of Concept` scope, these remain classifiable as ⚪ Review at the agent's discretion.

#### S4 — Placeholder Structured Data
Embedded schemas, JSON, YAML, or table definitions using generic names:
- JSON with keys like `"key1"`, `"field"`, `"value"` and values like `"string"`, `"any"`, `"TBD"`
- Table definitions with columns named `col1`, `column_a`, `new_field`
- Config with dummy values: `host: your-host`, `port: 0000`, `password: changeme`

**Heuristic:** More than 30% of identifiers in a structured block match placeholder patterns (S1/S3). A single generic name in an otherwise real schema is acceptable; a majority signals template data.

#### S5 — Cross-Source Inconsistency
Same entity referenced differently across sources:
- JIRA description says `orderStatus` but AC says `order_state`
- Description references `POST /api/orders` but AC references `POST /api/v2/order`
- A field name in the requirement doesn't match how the same field appears in the existing codebase

**Heuristic:** Extract all named entities from each source, normalise casing, flag any entity appearing in two or more forms that are not just casing variants.

### Execution Rules

1. **Scan before interrogation** — Phase 1B runs after Phase 1A but before Phase 2. Placeholder content must be flagged before auto-resolution consumes it as valid input.
2. **Classify, don't block** — Each flagged item is `🔶 Fidelity` (likely placeholder, must resolve) or `⚪ Review` (ambiguous, presented but non-blocking).
3. **Context-aware** — `test` in a test framework requirement is legitimate. `localhost` in a local dev setup requirement is legitimate. Use domain context to avoid false positives.
4. **Codebase cross-check** — Before flagging, check if the identifier/value exists in the codebase. If `field1` is an actual column in an existing DB migration, it's a real name — do not flag.
5. **Batch presentation** — Present all fidelity flags in a single prompt.

### Fidelity Report

```
=== Input Fidelity Scan ===

Sources scanned: {N}
Signals detected: {N} 🔶 Fidelity | {N} ⚪ Review

🔶 Fidelity — must resolve before proceeding:
  1. [S1] Field name `field1` in JIRA description — placeholder. What is the actual field name?
  2. [S2] URL `https://jira.example.com/browse/PROJ-123` — reserved domain. Provide real URL or confirm intentional.
  3. [S4] JSON schema in AC-3 has keys `key1`, `key2` — 3/4 keys appear generic. Provide real field names.

⚪ Review — please confirm intentional:
  1. [S3] Email `admin@test.com` in AC-2 — real test account or placeholder?
  2. [S5] Field as `orderStatus` in description but `status` in AC-4 — same field?

{If zero flags: "No fidelity concerns detected. Proceeding to Phase 2."}
```

**WAIT for user response on 🔶 items.** ⚪ items the user skips are recorded as `[USER-CONFIRMED]`.

### Spec Output: Section 4.0B — Input Fidelity

Phase 1B findings are recorded in `specs.md` as **Section 4.0B** immediately after Section 4.0A (Tactical Readiness):

```markdown
## Input Fidelity

| Field | Value |
|---|---|
| Sources Scanned | {N} |
| 🔶 Fidelity Flags | {N} |
| ⚪ Review Flags | {N} |
| Resolved | {N} |
| Evaluation Date | {YYYY-MM-DD} |

### Flagged Items
| # | Signal | Category | Item | Status | Resolution |
|---|---|---|---|---|---|
| 1 | S1 | Placeholder Identifier | `field1` in JIRA description | ✅ Resolved | Replaced with `entitlementStatus` — user clarification |
| 2 | S2 | Placeholder URL | `https://jira.example.com/...` | ✅ Resolved | Real URL: `https://jira.company.com/browse/PROJ-123` |
```

Downstream skills (`/sdd-create-plan`, `/sdd-execute`) read Section 4.0B to verify fidelity resolution. They do not re-run the scan.

### Abbreviated Mode (for `/sdd-fix` Tier 3)

When invoked from abbreviated RRG:
1. Run only **S1** and **S2** — skip S3, S4, S5
2. Flag only 🔶 items — skip ⚪ Review
3. Limit to top 3 flags
4. Non-blocking — record in abbreviated spec §4.0B and warn the user

---

## Phase 2 — Interrogate Across 12 Context Dimensions

For each dimension where `weight > 0` for the detected archetype, generate **contextual questions dynamically** based on the requirement text. The probes listed below are illustrative — the LLM adapts them to the specific requirement.

| # | Dimension | Intent | Illustrative Probes |
|---|---|---|---|
| **D1** | **Business Purpose** | *Why does this exist?* | What business outcome does this enable? What happens if we don't build it? Who requested it and what KPI does it move? |
| **D2** | **Larger Context** | *What's the iceberg below?* | Is this part of a larger initiative? What upstream/downstream systems are affected? What's the roadmap around this? |
| **D3** | **Consumer Identity** | *Who uses this and how?* | Internal team or external client? Human or machine consumer? Access patterns (batch, real-time, ad-hoc)? |
| **D4** | **Deployment & Hosting** | *Where does this live?* | Cloud provider/region? On-prem? Containerised? Serverless? Which environment pipeline? Internal or internet-facing? Data residency/sovereignty requirements (geo-location restrictions, data must stay in specific region/country)? Network topology (VPC, service mesh, API gateway, ingress/egress rules, DNS, load balancer)? IaC tooling (Terraform, Pulumi, CloudFormation, Ansible, manual)? |
| **D5** | **Security & Access** | *Who's allowed in and how?* | Auth mechanism (OAuth2, mTLS, API key, SSO)? Authorisation model (RBAC, ABAC)? Data classification (PII, PHI, financial)? Token/credential management portal? |
| **D6** | **Performance & SLA** | *How fast, how much?* | p95/p99 latency target? Throughput (req/sec, records/hour)? SLA tier? Peak vs steady-state load? |
| **D7** | **Scalability & Capacity** | *How does it grow?* | Expected growth rate? Horizontal vs vertical scaling? Rate limiting? Circuit breaker needs? Thread/connection pool sizing? Compute profile (CPU-bound, memory-bound, GPU-bound, IO-bound)? Resource quotas or cost constraints? Caching strategy (CDN, edge cache, application cache, invalidation policy)? |
| **D8** | **Observability** | *Can we see what's happening?* | Logging standard (structured JSON, ELK, Splunk)? Distributed tracing (OpenTelemetry, Jaeger)? Metrics/dashboards? Alerting thresholds? Request/response audit logging? |
| **D9** | **Data & Entity Relationships** | *What data is touched and what breaks?* | Which entities are read/written? Cascading effects on related entities? Same entity referenced elsewhere? Schema migration impact? Referential integrity? Storage type (relational, NoSQL, object store, file system, cache, in-memory)? Persistence model (persistent, ephemeral, cache-only)? Estimated current and projected data volume? Consistency model (strong, eventual, causal)? |
| **D10** | **Resilience & Response Model** | *What happens when things fail?* | Sync or async response? Retry/dead-letter strategy? Idempotency? Timeout handling? Graceful degradation? Reprocessing architecture for failures? |
| **D11** | **Reuse & Discoverability** | *Does this already exist somewhere?* | Internal API marketplace/registry? Existing services that overlap? Shared libraries? Documentation/wiki integration? API versioning strategy? |
| **D12** | **Platform Constraints** | *What rules does the platform impose?* | Packaged software governance limits (SOQL limits, API call caps)? Framework-specific patterns? Org-specific coding standards? Regulatory/compliance requirements (GDPR, SOX, HIPAA)? |

### Interrogation Rules

1. **Dynamic, not static** — generate questions contextually from the requirement text, not from a fixed questionnaire. The 12 dimensions are the skeleton; the questions are the muscle that adapts.
2. **Batch questions** — present all applicable dimension questions in a single structured prompt to the user. Do not ask one dimension at a time.
3. **Auto-resolve where possible** — if the JIRA issue, POD knowledge, or codebase already answers a dimension, mark it as filled (1.0) with `[AUTO-RESOLVED]` and cite evidence. Only ask the user about genuinely unknown dimensions.
4. **Respect existing context** — if the user's message or JIRA description already addresses a dimension, extract and score it — do not re-ask.

---

## Phase 3 — Score: Requirement Readiness Score (RRS)

### 3A — Dimension Weight Matrix

Each archetype assigns a weight (0–3) to each dimension. Weight `0` means not applicable.

| Dimension | Service/API | UI/Frontend | Data Pipeline | Integration | Platform/Infra | Packaged SW | Library/SDK | AI/ML |
|---|---|---|---|---|---|---|---|---|
| D1 Business Purpose | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 3 |
| D2 Larger Context | 2 | 2 | 3 | 3 | 2 | 3 | 1 | 2 |
| D3 Consumer Identity | 3 | 3 | 2 | 2 | 1 | 2 | 3 | 2 |
| D4 Deployment & Hosting | 3 | 2 | 3 | 2 | 3 | 1 | 1 | 3 |
| D5 Security & Access | 3 | 3 | 2 | 3 | 2 | 3 | 1 | 2 |
| D6 Performance & SLA | 3 | 2 | 3 | 2 | 2 | 2 | 1 | 3 |
| D7 Scalability & Capacity | 3 | 1 | 3 | 2 | 3 | 2 | 0 | 3 |
| D8 Observability | 2 | 1 | 3 | 2 | 2 | 2 | 1 | 3 |
| D9 Data & Entity | 2 | 2 | 3 | 2 | 1 | 3 | 1 | 3 |
| D10 Resilience & Response | 3 | 1 | 3 | 3 | 2 | 2 | 0 | 2 |
| D11 Reuse & Discoverability | 2 | 2 | 2 | 2 | 1 | 3 | 3 | 2 |
| D12 Platform Constraints | 1 | 1 | 1 | 1 | 2 | 3 | 2 | 2 |

> **Calibration:** These weights are defaults. Teams may adjust per their organisation by editing this table. The weights reflect relative importance in enterprise production environments.

### 3B — Fill Level per Dimension

After interrogation (combining user answers, JIRA content, POD knowledge, and codebase evidence), assign each applicable dimension a fill score:

| Fill Level | Score | Criteria |
|---|---|---|
| **Fully answered** | 1.0 | All critical probes for this dimension addressed with specifics |
| **Partially answered** | 0.5 | Some context given but material gaps remain |
| **Not addressed** | 0.0 | Dimension entirely missing or only vague platitudes |

> **TBD = Not addressed:** A dimension answer containing `TBD`, `TODO`, `N/A` (as placeholder value), `To be confirmed`, `Will confirm later`, `TBC`, or other non-committal language scores **0.0** (Not addressed), regardless of whether other details in the answer appear partially complete. This prevents TBD content from inflating the RRS. A concrete, specific answer is required for 0.5 or 1.0.

### 3C — Calculate RRS

```
RRS = ( Σ (weight_i × fill_i) / Σ weight_i ) × 100

where i iterates over dimensions with weight > 0 for the detected archetype.
```

### 3D — Gate Decision

| RRS Range | Signal | Action |
|---|---|---|
| **≥ 80%** | 🟢 Green | Proceed to spec generation |
| **55–79%** | 🟡 Amber | Present Gap Report → user must clarify → re-score → loop until Green |
| **< 55%** | 🔴 Red | Requirement rejected as incomplete → halt with full Gap Report |

### 3E — Threshold Calibration (Phase 1A-driven)

All non-PoC software is production-grade. Look up the actual threshold from this table using the Phase 1A Criticality Tier:

| Criticality Tier | Lifecycle Stage | Green Threshold | Amber Floor | Rationale |
|---|---|---|---|---|
| Mission-critical | Any (except Prototype-PoC) | **≥ 85%** | 60% | Failures have business/safety impact — highest bar |
| Business-critical | Any (except Prototype-PoC) | **≥ 80%** | 55% | Standard enterprise production — no MVP relaxation |
| Best-effort | Any (except Prototype-PoC) | **≥ 80%** | 55% | Production-grade regardless of impact tier |
| Any | Prototype + confirmed PoC | **≥ 60%** | 40% | Experimental — user explicitly confirmed PoC scope |

> **Design principle:** If Delivery Scope = Full Production (which applies to all lifecycle stages except user-confirmed Prototype-PoC), the requirement quality bar must match production rigor. There is no threshold relaxation for MVP, Legacy, or Best-effort — scope can be reduced via Section 4.4, but requirement clarity on the in-scope items is non-negotiable.

**Application:** After calculating RRS in §3C, look up the threshold from this table using the Phase 1A Criticality Tier. Use that threshold instead of the default 80%/55% when making the gate decision in §3D.

**Override:** If the user explicitly requests a specific threshold, use theirs. Document the override in spec Section 4.0.

---

## Phase 4 — Gap Report

When the score is below Green, produce a structured gap report sorted by weighted impact (highest gap first):

```markdown
=== Requirement Readiness Report ===

Archetype: {detected archetype}
RRS:       {score}% {🟢/🟡/🔴}

Gaps (by weighted impact):
| # | Dimension            | Weight | Fill | Gap Description                              |
|---|----------------------|--------|------|----------------------------------------------|
| 1 | D5 Security & Access | 3      | 0.0  | No auth mechanism specified                  |
| 2 | D6 Performance & SLA | 3      | 0.0  | No SLA or latency target                     |
| 3 | D4 Deployment        | 3      | 0.0  | Deployment target unknown                    |

Top Clarifications Needed:
1. {specific question for highest-impact gap}
2. {specific question for next gap}
3. ...
```

After the user provides answers, re-score. Repeat until RRS meets the calibrated Green threshold from §3E (default ≥ 80%).

---

## Abbreviated Mode (for `/sdd-fix` Tier 3)

Enhancements have narrower scope than new features. Use abbreviated evaluation:

1. **Evaluate only dimensions with weight ≥ 2** for the detected archetype (skip weight 0–1 dimensions entirely)
2. **Gate threshold lowered to ≥ 65%** (vs 80% for full mode)
3. **Gap Report limited to top 3 gaps** (vs unlimited in full mode)
4. **If the abbreviated check reveals the change needs full dimensional coverage** (e.g., touches shared contracts, requires DB migration, involves auth logic) → **escalate to Tier 4** and hand off to `/sdd-sdlc`

---

## Spec Integration: Section 4.0

The RRG evaluation result is recorded in `specs.md` as **Section 4.0 — Requirement Readiness Assessment** so downstream skills can read the score without re-evaluating.

```markdown
## Requirement Readiness Assessment

| Field | Value |
|---|---|
| Archetype | {detected archetype} |
| RRS | {score}% 🟢 |
| Mode | Full / Abbreviated |
| Threshold Applied | {N}% (from §3E: {Criticality} + {Lifecycle}) |
| JIRA Integration | Enabled ({ISSUE_ID}) / Disabled (local mode — {reason}) |
| Concurrency & Throughput Profile | {D6/D7 quantified — e.g. "5k msg/s peak, ~200 concurrent; pool sizing decided in plan" / N/A — evidence} |
| Evaluation Date | {YYYY-MM-DD} |

### Software Classification
| # | Group | Dimension | Value | Evidence |
|---|---|---|---|---|
| A1 | Identity | Criticality Tier | {value} | {evidence citation} |
| A2 | Identity | Data Sensitivity | {value} | {evidence citation} |
| A3 | Identity | Lifecycle Stage | {value} | {evidence citation} |
| A4 | Identity | Multi-tenancy | {value} | {evidence citation} |
| B1 | Architecture | Topology | {value} | {evidence citation} |
| B2 | Architecture | Workspace Scope | {per-component list} | {evidence citation} |
| B3 | Architecture | Layer Profile | {value} | {evidence citation} |
| B4 | Architecture | Statefulness | {value} | {evidence citation} |
| B5 | Architecture | Runtime Model | {value} | {evidence citation} |
| C1 | Deployment | Deployment Model | {value} | {evidence citation} |
| C2 | Deployment | Security Testability | {value} | {evidence citation} |
| D-1 | Data & AI | Data Volume Tier | {value} | {evidence citation} |
| D-2 | Data & AI | AI/ML Component | {value} | {evidence citation} |

### Dimension Coverage
| # | Dimension | Weight | Fill | Notes |
|---|---|---|---|---|
| D1 | Business Purpose | 3 | 1.0 | {summary of what was captured} |
| D2 | Larger Context | 2 | 1.0 | {summary} |
| D3 | Consumer Identity | 3 | 1.0 | {summary} |
| ... | ... | ... | ... | ... |

### Resolved Gaps
| Dimension | Original Gap | Resolution | Source |
|---|---|---|---|
| D5 | Auth mechanism unspecified | OAuth2 via internal SSO portal | User clarification |
| D8 | Logging standard unknown | Structured JSON to ELK — existing pattern | [AUTO-RESOLVED] POD knowledge |
```

> **Delivery-context fields** (populated by `/sdd-create-specs` Step 1, consumed by every downstream skill):
> - **JIRA Integration** — `Enabled ({ISSUE_ID})` or `Disabled (local mode)`. When Disabled, `/sdd-create-plan`, `/sdd-execute`, and `/sdd-fix` skip **all** JIRA operations (fetch, attach, comment, transition).
> - **Concurrency & Throughput Profile** — the quantified D6 (throughput, peak vs steady-state) and D7 (concurrency, thread/connection-pool sizing, compute profile) answers. `/sdd-create-plan` §2A.1 turns these into an explicit in-process concurrency design (threading / pooling / async / batching / backpressure) and `/sdd-execute` verifies the code enforces them — not just horizontal scaling.

### Where RRG Answers Flow in the Spec

RRG answers are **not siloed** in Section 4.0 — they feed directly into existing spec sections:

| RRG Dimension | Populates Spec Section |
|---|---|
| D1 Business Purpose | §4.2 Overview |
| D2 Larger Context | §4.3 Background & Context |
| D3 Consumer Identity | §4.3 Background, §4.5 FRs |
| D4 Deployment & Hosting | §4.7 NFRs (Compatibility) |
| D5 Security & Access | §4.7 NFRs (Security) |
| D6 Performance & SLA | §4.7 NFRs (Performance); §4.0 Concurrency & Throughput Profile → Plan §2A.1 concurrency design → Execute verification |
| D7 Scalability & Capacity | §4.7 NFRs (Scalability); §4.0 Concurrency & Throughput Profile → Plan §2A.1 thread/connection-pool sizing → Execute verification |
| D8 Observability | §4.7 NFRs (Observability) |
| D9 Data & Entity | §4.8 Impacted Areas |
| D10 Resilience & Response | §4.7 NFRs, §4.5 FRs |
| D11 Reuse & Discoverability | §4.4 Scope (Out of Scope if reusable exists) |
| D12 Platform Constraints | §4.7 NFRs, §4.9 Assumptions |
| Phase 1A — Criticality Tier | §4.7 NFRs (SLA tier), RRG threshold calibration |
| Phase 1A — Data Sensitivity | §4.7 NFRs (Security, Compliance), TRC Cat 9 activation |
| Phase 1A — Lifecycle Stage | RRG threshold calibration, ceremony level |
| Phase 1A — Multi-tenancy | §4.7 NFRs (Isolation), §4.5 FRs (tenant-scoped behavior) |
| Phase 1A — Statefulness | §4.7 NFRs (Scalability, Session handling) |
| Phase 1A — Runtime Model | §4.7 NFRs (Observability, Performance) |
| Phase 1A — Data Volume Tier | §4.7 NFRs (Performance), §4.8 Impacted Areas (migration) |
| Phase 1A — AI/ML Component | §4.7 NFRs (Reproducibility, Model management), TRC Cat 13 |
