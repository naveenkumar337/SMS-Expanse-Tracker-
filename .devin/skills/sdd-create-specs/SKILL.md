# Skill: create-specs

> Generate a self-contained `specs.md` for a JIRA issue. Fetches issue details, cross-references POD knowledge and codebase, validates input quality, and produces the spec under `ai/specs/{ISSUE_ID}/`.

---

## Pre-Execution Directive — Always-On Rules

**Mandatory.** Before starting this skill, read `.devin/rules/architecture-standards.md`.
RULE 0 in that file defines how every rule applies at each step of this skill.
RULE 1 defines MCP availability handling — if the `standards-fabric` MCP server
is configured but unreachable, the skill continues (not blocked); see RULE 1 for details.

---

## Prerequisites

- POD knowledge exists under `ai/knowledge/` (functional-spec.md, technical-spec.md, data-model-spec.md, api-spec.md, flows/).
- The workspace codebase is checked out and up to date.

---

## Step 1 — Obtain JIRA Issue ID & Detect Mode

If the JIRA issue ID (e.g., `PROJECT-1234`) was **not** provided as input, prompt the user for it before proceeding.

### Step 1.0 — Story-to-Spec Detection

Before proceeding, determine whether the provided issue is a **Story** or a **Spec**:

1. Fetch the issue via the `jira-it` MCP server:
   ```
   jira_get_issue
     issue_key: {ISSUE_ID}
     fields: issuetype,summary
   ```
2. Read `issuetype.name`:
   - If **`Spec`** → proceed with this issue as `{ISSUE_ID}`. Record `LINKED_STORY_ID = null`.
   - If **`Story`** → invoke `/sdd-story-to-spec {ISSUE_ID}`. That skill will:
     - Check for an existing linked Spec (returns it if found)
     - Or create a new Spec issue, link it to the Story, and return the Spec ID
     - Record the returned Spec ID as the new `{ISSUE_ID}` for all downstream steps
     - Record the original Story ID as `{LINKED_STORY_ID}` for dual-update
   - If **any other type** → check issue links for a related Spec. If found, use the Spec. If not, invoke `/sdd-story-to-spec {ISSUE_ID}` to create one.

Announce the detection result:
```
=== Issue Type Detection ===
Input:           {original issue ID}
Issue Type:      {issuetype.name}
Spec Issue:      {ISSUE_ID} (primary — used for all SDD artifacts)
Linked Story:    {LINKED_STORY_ID or "None"}
```

All subsequent steps use `{ISSUE_ID}` (the Spec) as the primary issue. The `{LINKED_STORY_ID}` (if present) receives status-sync comments at key milestones.

**Check if a spec already exists:**

If `ai/specs/{ISSUE_ID}/specs.md` already exists → enter **UPDATE mode**:
- Do NOT regenerate the spec from scratch
- Read the existing spec in full
- Compare against current JIRA issue content (updated ACs, new description, linked sub-tasks)
- Apply **targeted amendments** to affected sections only (FR, AC, NFR, Impacted Areas, Assumptions, Open Questions)
- Mark each new or changed item with `[UPDATED-{YYYY-MM-DD}]`
- Append a Change Log entry to the spec:

```markdown
## Change Log
| Date | Type | Summary |
|---|---|---|
| {YYYY-MM-DD} | Enhancement / Bug / Tweak | {one-line summary of what changed} |
```

> **Why UPDATE mode exists:** enhancements and bug fixes operate on the same JIRA issue and the same deployed behaviour. Regenerating a new spec discards the accumulated context, history, and traceability of prior decisions. UPDATE mode preserves the spec as the living source of truth while recording what changed and why.

Only bypass UPDATE mode and generate a fresh spec when:
- This is a **new JIRA issue** with no prior spec (the normal CREATE flow)
- The user explicitly requests a full regeneration
- The issue has been re-scoped so significantly that the existing spec is misleading (Tier 4 Feature — see `/sdd-sdlc`)

Announce mode at the start:
```
Mode: CREATE — no existing spec found.
   OR
Mode: UPDATE — existing spec found. Applying targeted amendments.
```

---

## Step 2 — Fetch JIRA Issue

Fetch the **Spec** issue (resolved in Step 1.0) via the `jira-it` MCP server:

```
jira_get_issue
  issue_key: {ISSUE_ID}
  fields: summary,description,issuetype,priority,labels,components
```

Extract: Summary, Description, Issue Type, Priority, Labels, Components.

> **If `{LINKED_STORY_ID}` exists:** Also fetch the Story issue to capture its original description and acceptance criteria, which may contain richer requirement details than the auto-generated Spec description. Merge both sources when generating the spec.

**Acceptance Criteria:** If a custom field for acceptance criteria is needed and not available via MCP, use curl fallback with `local.config` (`JIRA_PAT`, `JIRA_BASE_URL`, `AC_CUSTOM_FIELD`).

**Error handling:** If MCP fails, fall back to curl. If both fail, report to user.

---

## Step 2A — Requirement Readiness Gate (RRG)

After fetching the JIRA issue, run the **Requirement Readiness Gate** as defined in `sdd-requirement-readiness-gate.md`. This replaces simple qualitative checks with a quantified, archetype-aware evaluation across 12 context dimensions.

### 2A.1 — Classify Archetype

Classify per `sdd-requirement-readiness-gate.md` §Phase 1. If ambiguous, ask the user to confirm.

### 2A.1B — Input Fidelity Scan

Before auto-resolving dimensions, run the **Input Fidelity Scan** per `sdd-requirement-readiness-gate.md` §Phase 1B. Scan the fetched JIRA content (description, acceptance criteria), the user's chat message, and any inline structured artifacts.

Present the Fidelity Report per RRG §Phase 1B. **All 🔶 Fidelity flags must be resolved before proceeding to Step 2A.2 (Auto-Resolve).** ⚪ Review items are presented but do not block.

After resolution, record findings for inclusion in spec Section 4.0B (Step 5).

> **Why before auto-resolve:** If placeholder content (e.g., a fake URL, a generic field name) enters auto-resolve, it may be scored as "dimension filled at 1.0." Running fidelity first ensures only genuine content enters the scoring pipeline.

### 2A.2 — Auto-Resolve from Existing Sources

Before asking the user anything, scan these sources to pre-fill dimension answers:

| Source | What it can resolve |
|---|---|
| JIRA description & ACs | D1 Business Purpose, D3 Consumer Identity, D9 Data/Entity |
| POD knowledge (`ai/knowledge/`) | D4 Deployment, D5 Security, D8 Observability, D11 Reuse, D12 Platform |
| Codebase patterns | D5 Security (existing auth), D7 Scalability (existing patterns), D10 Resilience |
| User's chat message | Any dimension explicitly addressed |

Mark each auto-resolved dimension with `[AUTO-RESOLVED]` and cite the source. Score it as 1.0 (fully answered) or 0.5 (partial).

### 2A.3 — Interrogate Remaining Gaps

For each dimension where `weight > 0` (per the archetype's weight row in the Step 2A.4 Weight Matrix below) and the fill is below 1.0 after auto-resolution, generate **contextual questions dynamically** based on the requirement text.

Present all gap questions in a **single structured prompt** — do not ask one dimension at a time:

```
=== Requirement Readiness — Clarification Needed ===

Archetype detected: {archetype}
Dimensions already resolved: {N}/12 (from JIRA, POD knowledge, codebase)
Dimensions needing your input: {N}

Please answer ALL of the following. If a dimension is genuinely not applicable
to your requirement, explain why — do not leave it blank or TBD.
Every unanswered dimension scores 0.0 and reduces your Readiness Score.
Answering "TBD" or "to be confirmed" also scores 0.0.

**D{N} — {Dimension Name}** (importance: {weight}/3)
  {contextual question 1}
  {contextual question 2}

**D{N} — {Dimension Name}** (importance: {weight}/3)
  {contextual question 1}
```

> **TBD handling in user responses:** If the user answers a dimension with `TBD`, `TODO`, `N/A` (as placeholder), `To be confirmed`, `Will confirm later`, or similar non-committal language, score that dimension as **0.0** (not addressed). Do NOT score it as 0.5 (partial). This is enforced regardless of whether other details in the answer appear partially complete.

### 2A.4 — Score & Gate

Score the requirement using the **Dimension Weight Matrix**, **fill levels**, and **RRS formula** below. All scoring data is provided inline — do NOT rely on external file references for these values.

#### Dimension Weight Matrix

Each archetype assigns a weight (0–3) to each dimension. Weight `0` means not applicable. Use the column matching the archetype detected in Step 2A.1.

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

#### Fill Level per Dimension

After interrogation (combining user answers, JIRA content, POD knowledge, and codebase evidence), assign each applicable dimension a fill score:

| Fill Level | Score | Criteria |
|---|---|---|
| **Fully answered** | 1.0 | All critical probes for this dimension addressed with specifics |
| **Partially answered** | 0.5 | Some context given but material gaps remain |
| **Not addressed** | 0.0 | Dimension entirely missing or only vague platitudes |

> **TBD Scoring Rule:** Any dimension where the answer contains `TBD`, `TODO`, `N/A` (as a placeholder value, not a deliberate "not applicable"), `To be confirmed`, `Will confirm later`, or equivalent non-committal language scores **0.0** (not addressed), not 0.5 (partial). A specific, concrete answer is required for 0.5 or 1.0. This prevents placeholder content from inflating the RRS.

#### Calculate RRS

```
RRS = ( Σ (weight_i × fill_i) / Σ weight_i ) × 100

where i iterates over dimensions with weight > 0 for the detected archetype.
```

**You MUST use the archetype-specific weights from the matrix above.** Do NOT use equal weights. Look up the detected archetype's column and use those weights for each dimension.

#### Gate Decision

| RRS Range | Signal | Action |
|---|---|---|
| **≥ Green Threshold** | 🟢 Green | Proceed to Step 2A.5 (TBD Resolution Gate) |
| **≥ Amber Floor but < Green** | 🟡 Amber | Present Gap Report → user must clarify → re-score → loop until Green |
| **< Amber Floor** | 🔴 Red | Requirement rejected as incomplete → halt with full Gap Report |

#### Threshold Calibration (Phase 1A-driven)

All non-PoC software is production-grade. Look up the actual threshold from this table using the Phase 1A Criticality Tier classified in Step 2A.1:

| Criticality Tier | Lifecycle Stage | Green Threshold | Amber Floor | Rationale |
|---|---|---|---|---|
| Mission-critical | Any (except Prototype-PoC) | **≥ 85%** | 60% | Failures have business/safety impact — highest bar |
| Business-critical | Any (except Prototype-PoC) | **≥ 80%** | 55% | Standard enterprise production — no MVP relaxation |
| Best-effort | Any (except Prototype-PoC) | **≥ 80%** | 55% | Production-grade regardless of impact tier |
| Any | Prototype + confirmed PoC | **≥ 60%** | 40% | Experimental — user explicitly confirmed PoC scope |

> **Design principle:** If Delivery Scope = Full Production (which applies to all lifecycle stages except user-confirmed Prototype-PoC), the requirement quality bar must match production rigor. There is no threshold relaxation for MVP, Legacy, or Best-effort — scope can be reduced via Section 4.4, but requirement clarity on the in-scope items is non-negotiable.

**Override:** If the user explicitly requests a specific threshold, use theirs. Document the override in spec Section 4.0.

#### Gap Report (for Amber/Red)

When the score is below Green, produce a structured gap report sorted by weighted impact (highest gap first):

```markdown
=== Requirement Readiness Report ===

Archetype: {detected archetype}
RRS:       {score}% {🟢/🟡/🔴}
Threshold: {N}% (from calibration: {Criticality} + {Lifecycle})

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

After the user provides answers, re-score using the weight matrix above. Repeat until RRS meets the calibrated Green threshold.

#### Announce Result

```
=== Requirement Readiness Gate ===

Archetype:    {archetype}
RRS:          {score}% {🟢/🟡/🔴}
Threshold:    {N}% (from calibration: {Criticality} + {Lifecycle})
Weights:      Archetype-specific ({archetype} column applied)
Dimensions:   {N}/{N} fully covered, {N} partial, {N} missing
Auto-resolved: {N} from JIRA/POD/codebase
User-provided: {N} from clarification

{If Amber/Red: Gap Report with top gaps sorted by weighted impact}
```

### 2A.5 — TBD Resolution Gate

**Mandatory. Runs after RRS scores Green, before proceeding to Step 2B (TRC).**

After the RRS meets the Green threshold, perform a final sweep of ALL resolved dimension answers (auto-resolved + user-provided) and the raw JIRA content for residual TBD content. Scan for: `TBD`, `TODO`, `N/A` (as placeholder value), `To be confirmed`, `Will confirm later`, `Not yet decided`, `TBC`, or equivalent non-committal language.

**Enforcement by Delivery Scope:**

- **Full Production** (Lifecycle = Production, MVP, Legacy, or Deprecated): **BLOCK.** Present all TBD items to the user in a single prompt and require real values before proceeding. No TBD is permitted in production-grade specs.

  ```
  === TBD Resolution Required (Full Production) ===

  {N} items contain TBD/placeholder values. Under Full Production scope,
  all requirement details must be concrete before spec generation.

  1. D{N} — {Dimension}: "{TBD text found}" — What is the actual value?
  2. D{N} — {Dimension}: "{TBD text found}" — What is the actual value?

  You may acknowledge a specific item as intentionally deferred by providing
  a justification (e.g., "vendor will confirm before deployment"). Each item
  requires individual acknowledgment — blanket "all TBDs are fine" is not accepted.
  ```

  - If the user provides real values → update the dimension answer, re-score if needed, and proceed.
  - If the user explicitly acknowledges a TBD with a per-item justification → record as `[TBD — USER-ACKNOWLEDGED: {justification}]` in spec §4.9 (Open Questions). The item appears in the Step 7 summary under "Acknowledged TBD Items." This does NOT re-score the dimension — it remains 0.0 but the gate allows passage with the acknowledgment on record.
  - If the user provides no justification or says "all TBDs are fine" → re-present and insist on per-item acknowledgment.

- **Proof of Concept** (Lifecycle = Prototype with user-confirmed PoC scope): **WARN.** Flag TBD items, record them in §4.9 (Open Questions), and proceed.

**If TBD re-scoring drops RRS below Green:** If replacing TBD answers with 0.0 scores causes the RRS to fall below the calibrated Green threshold, re-enter the Amber loop (Step 2A.4 Gap Report) and force the user to clarify the highest-impact gaps before proceeding.

---

## Step 2B — Tactical Readiness Checklist (TRC)

**Activated only after Step 2A scores Green (meets the calibrated threshold from RRG §3E — default ≥ 80%, adjusted by Phase 1A Criticality Tier and Lifecycle Stage).** Single-pass evaluation — no scoring loop.

Run the TRC per `sdd-tactical-readiness-checklist` §How It Works (filter → auto-resolve → surface gaps → record). Present unresolved items in a single prompt:

```
=== Tactical Readiness — {N} items need attention ===

Archetype: {archetype}
Categories evaluated: {N} of 13 (archetype-filtered)
Auto-resolved: {N} | Needing input: {N}

**Cat 1 — Data Integrity** (check 1.1)
  Adding column `{col}` to `{table}` — {N}M existing rows.
  → What default value for existing records? Backfill strategy?

**Cat 2 — Temporal** (check 2.2)
  API returns timestamps — UTC or user-local?
  → Display timezone convention?

**Cat 4 — Rollback** (check 4.3)
  → Can this feature be disabled via feature flag without redeployment?
```

Record findings in spec Section 4.0A (see Step 5). Route per `sdd-tactical-readiness-checklist` §Handling Rules (⚠️ → §4.9 Open Questions/Assumptions, ✅ → target spec sections, 📎 → §4.3/§4.5).

**Clarity artifacts** (Category 11) — if the requirement references 3+ systems without a visual flow, or an entity has lifecycle states, **offer to co-create** a diagram (Mermaid data flow, state machine, sequence diagram) rather than blocking.

> **Credit optimisation:** TRC is loaded once, runs once, and is never re-evaluated during RRG Amber/Red loops. If Step 2A is still looping, TRC is not loaded at all.

---

### Continuation Directive — Automatic Resumption After Gates

After all gates pass (RRS Green + TBD Resolution + TRC), the following rules apply:

1. **Do NOT stop, summarize, or wait for user input.** Immediately continue through Steps 3 → 4 → 5 → 5A → 5B → 6 → 7.
2. **Do NOT present intermediate summaries** of RRG/TRC results and then stop. These results are recorded in the spec — presenting them separately wastes the user's time and breaks the flow.
3. The **only** acceptable pause points during this skill are:
   - Step 2A.3 — waiting for user clarification answers
   - Step 2A.4 Amber loop — waiting for gap resolution
   - Step 2A.5 TBD Resolution — waiting for user values
   - Step 2B TRC — waiting for user input on flagged items
4. Once all gates pass, the remainder of the skill (Steps 3–7) is **fully autonomous**. Generate spec, validate spec, generate contract, transition JIRA, and present the final summary — all in one uninterrupted flow.
5. If the user provides answers to clarification questions, **resume from the exact step where the skill paused** — do not restart the skill from Step 1.

---

## Step 3 — Load Relevant POD Knowledge

Load only the POD knowledge files relevant to the feature's domain:

| File | Load When |
|---|---|
| `ai/knowledge/functional-spec.md` | Feature involves business rules or functional behavior |
| `ai/knowledge/technical-spec.md` | Feature involves architecture or infrastructure |
| `ai/knowledge/data-model-spec.md` | Feature involves data entities or database changes |
| `ai/knowledge/api-spec.md` | Feature involves API endpoints |
| `ai/knowledge/flows/*.md` | Feature maps to a known process flow |

Do not load all files by default. If a file is missing, note its absence and continue.

---

## Step 4 — Analyse Codebase & Resolve Ambiguities

Cross-reference JIRA content against POD knowledge and the workspace codebase. Identify and record the following with **concrete file paths, class names, method signatures, and line ranges** — not placeholders:

1. **Existing endpoints / entry points** — Controllers, handlers, resolvers, or CLI commands related to the feature.
2. **Data models & DTOs** — Entities, value objects, request/response types, database schemas that will be created or modified.
3. **Service / business-logic layer** — Service classes, domain logic, mappers, and validators in the call chain.
4. **Repository / data-access layer** — Repository interfaces, query methods, data sources.
5. **Shared utilities & cross-cutting concerns** — Common helpers, interceptors, filters, middleware, AOP aspects, error handlers, logging utilities touched by the feature.
6. **Related flows** — Process flows from `ai/knowledge/flows/` that map to the feature's domain.
7. **Test infrastructure** — Existing test classes, test helpers, mock factories, and fixtures relevant to the impacted code.
8. **UI / frontend impacts** (if applicable) — Components, pages, routes, state management, and design-system tokens affected. Cross-reference any Figma links from the JIRA issue.

Resolve ambiguities using JIRA description, POD knowledge, and codebase evidence. Surface **max 5 genuinely unresolvable questions** to the user. Auto-resolve the rest using the safest default based on existing patterns — mark these with `[AUTO-RESOLVED]` prefix and cite evidence.

### 4.1A — Detail Validation Against Artifacts

For every field, label, component, function argument, or configuration value referenced in the requirements but not specified with exact details, validate against existing code artifacts:

1. **Scan for existing definitions** — search the codebase for: JSON schemas, DB migration files, ORM model definitions, UI component prop types, API request/response DTOs, config files, enum definitions, and constants files related to the referenced entity.
2. **Cross-check specifics** — for each referenced item, verify the requirement provides:
   - Exact field/column name (not just "add a status field")
   - Data type and constraints (string length, numeric precision, enum values)
   - Default value and nullability
   - Display label (for UI fields) or API field name (for API fields)
   - Validation rules (regex, range, allowed values)
3. **Auto-resolve from artifacts** — if the codebase artifact already defines the entity (e.g., an existing ORM model has the field with a clear type), auto-resolve with `[AUTO-RESOLVED from {file_path}]` and cite the evidence. Score as 1.0.
4. **Flag missing details** — if the requirement references an entity without exact specifics AND no codebase artifact provides the answer, flag as an Open Question in §4.9 (not an assumption). Specifically state what detail is missing: "Field `{name}` referenced in FR-{N} — exact data type and default value not specified. Existing model at `{path}` does not contain this field."
5. **Contradiction detection** — if the requirement contradicts an existing artifact (e.g., requirement says "string" but existing schema has "integer"), flag immediately as an Open Question with both sources cited.
6. **Fidelity re-check on clarification answers** — If the user provided answers during RRG (Step 2A.3) or TRC (Step 2B) that introduced new identifiers, URLs, field names, or config values not present in the original JIRA content, run a targeted fidelity scan (RRG §Phase 1B signals S1–S4) on those answers only. This catches cases where the user answers gap questions with placeholder data (e.g., "the field is called `newField`" or "the endpoint is `http://example.com/api`"). Flag and request real values if detected.

> **Why this matters:** Feedback showed that vague requirements (e.g., "add a status field") were auto-resolved as assumptions with guessed values, leading to incorrect implementations. This step forces validation against the real codebase before assuming.

---

## Step 5 — Generate the Feature Spec

Create the output file at:

```
ai/specs/{ISSUE_ID}/specs.md
```

The spec **must** contain the following sections in order:

### Section 4.0 — Requirement Readiness Assessment

Capture the RRG evaluation result per the template in `sdd-requirement-readiness-gate.md` §Spec Integration (metadata table, Dimension Coverage table, Resolved Gaps table). This section is read by downstream skills (`/sdd-create-plan`, `/sdd-execute`) to verify requirement maturity without re-evaluating.

RRG answers also flow into other spec sections — see `sdd-requirement-readiness-gate.md` §Where RRG Answers Flow for the mapping (e.g., D1 → §4.2 Overview, D5 → §4.7 NFRs Security, D9 → §4.8 Impacted Areas).

> **Phase 1A Software Classification** is recorded as a sub-table within Section 4.0 (see RRG §Spec Integration for the template). All 13 dimensions must be present with evidence citations. Downstream skills (plan, execute, fix, TRC) read these values from Section 4.0 — they are not re-evaluated.

> **Delivery context (recorded in Section 4.0, read by all downstream skills):**
> - `JIRA Integration:` `Enabled ({ISSUE_ID})` or `Disabled (local mode — {reason})` from Step 1. Downstream skills skip **all** JIRA operations when Disabled.
> - `Concurrency & Throughput Profile:` the quantified answers to RRG D6 (Performance & SLA — throughput req/sec, records/hour, peak vs steady-state) and D7 (Scalability & Capacity — expected concurrency, thread/connection-pool sizing, compute profile). Record the numbers verbatim (or `N/A` with evidence). `/sdd-create-plan` and `/sdd-execute` read this to decide and verify the **in-process** concurrency implementation (threading, pooling, async, batching, backpressure) — not just horizontal scaling.
> - `Delivery Scope:` Derived from Phase 1A Lifecycle Stage (A3) and Criticality Tier (A1). Determines the **implementation completeness contract** that `/sdd-execute` must honour. Values:
>   - `Full Production` — every plan item in Section 5 is **mandatory**. No component may be stubbed, simulated, or deferred. Integration clients, deployment manifests, security integrations, and all NFR-driven code must be implemented. This is the default for `Lifecycle = Production`, `MVP`, `Legacy`, or `Deprecated`.
>   - `Proof of Concept` — core happy-path only. Non-critical integrations may use stubs. Deployment artifacts may be minimal. This applies only when `Lifecycle = Prototype` **and** the user explicitly confirms PoC scope.
>   - If Lifecycle Stage is `Production` or `MVP`, Delivery Scope is **always** `Full Production` — no user override allowed. `/sdd-execute` reads this field and is **bound** to implement every plan item to completion. It must not stop at partial completion, offer "remaining work" menus, or present boilerplate/local-testing code as the deliverable when `Full Production` is specified.

### Section 4.0A — Tactical Readiness

Capture TRC findings from Step 2B per the template in `sdd-tactical-readiness-checklist` §Spec Integration (metadata table, Flagged Items table, Items Flowing to Spec Sections table). Handling rules (⚠️/✅/📎 routing) defined there. This section is read by `/sdd-create-plan` to inform architectural decisions without re-evaluating tactical checks.

### Section 4.0B — Input Fidelity

Capture Phase 1B findings from Step 2A.1B per the template in `sdd-requirement-readiness-gate.md` §Phase 1B Spec Output (metadata table, Flagged Items table with resolution status). This section is read by `/sdd-create-plan` and `/sdd-execute` to verify fidelity resolution without re-running the scan.

### Section 4.1 — Header

Metadata table: Issue ID, Issue Type, Priority, Labels, Components, Generated date, Contract File.

The `Contract File` field must contain:
- The relative path to the contract file: `ai/contracts/{ISSUE_ID}/contract.md` — if a contract was generated in Step 5B.
- `None — no interlocks identified` — if Step 5B was skipped.

This field is **mandatory**. It is the primary cross-reference between the spec and its integration contract. Example:

| Field | Value |
|---|---|
| Issue ID | PROJECT-1234 |
| Issue Type | Spec |
| Priority | High |
| Labels | backend, api |
| Components | order-service |
| Generated | 2026-09-05 |
| Contract File | `ai/contracts/PROJECT-1234/contract.md` |

### Section 4.2 — Overview

2–5 sentence business-level summary: what the feature does, who it impacts, business value. Derived from JIRA summary and description.

### Section 4.3 — Background & Context

Combine JIRA description (cleaned up) with cross-references to relevant POD knowledge sections. Cite specific spec sections.

### Section 4.4 — Scope

Two clearly separated lists: **In Scope** and **Out of Scope**. Both must be non-empty. Derived from JIRA description, acceptance criteria, and analysis.

### Section 4.5 — Functional Requirements

Numbered requirements table with columns: ID, Requirement, Source. Each FR must be atomic, testable, and traceable to a source (JIRA field or POD spec section).

### Section 4.6 — Acceptance Criteria

Reproduce acceptance criteria **verbatim** from the JIRA custom field. Preserve Gherkin format if present. If the field is empty, note that explicitly.

### Section 4.7 — Non-Functional Requirements

Table of NFRs by category (Performance, Security, Scalability, Observability, Compatibility). Phrase all criteria in terms of observable user or business outcomes — no technology-specific language.

**Phase 1A-driven mandatory NFRs:** In addition to NFRs derived from RRG dimensions, the following NFRs are **mandatory** based on Phase 1A classifications. If any apply and are not already covered, add them:

| Phase 1A Value | Mandatory NFR(s) |
|---|---|
| Data Sensitivity = Confidential/Restricted | NFR: All PII must be encrypted at rest and in transit. NFR: PII must be masked in all log output. NFR: Data access must be audit-logged with user identity and timestamp. |
| Multi-tenancy = Multi-tenant | NFR: Tenant data must be isolated — no cross-tenant data access possible via API, query, or cache. NFR: Tenant ID must be validated on every request. |
| Statefulness = Stateful | NFR: Session state must survive single-node restart (replicated or persisted). NFR: Stale session cleanup must be automated (TTL-based). |
| Runtime Model = Batch/Scheduled | NFR: Batch jobs must be idempotent (safe to re-run). NFR: Job completion and failure must be monitored and alerted. |
| Runtime Model = Streaming | NFR: Consumer must handle out-of-order events. NFR: Processing lag must be monitored with alerting threshold. |
| AI/ML Component ≠ None | NFR: Model inference latency must meet defined SLA. NFR: Model version must be tracked and rollback-capable. NFR: Model output must pass defined eval metrics before production deployment. |
| Criticality = Mission-critical | NFR: Recovery Time Objective (RTO) and Recovery Point Objective (RPO) must be defined. NFR: Failover mechanism must be documented and tested. |
| Data Volume = Large/Massive | NFR: All list/query endpoints must support pagination. NFR: Bulk operations must use chunked processing (no single-transaction full-table operations). |
| RRG D6/D7 = high throughput or high concurrency (quantified in §4.0 Concurrency & Throughput Profile) | NFR: The service must sustain the stated throughput ({req/sec or records/hour}) at the stated concurrency without unbounded queue growth. NFR: Concurrency limits must be explicit and tunable (thread-pool / connection-pool / consumer-concurrency sizing) — not left to library defaults. NFR: Under overload the service must apply backpressure or bounded queuing rather than exhausting memory. These NFRs must be honoured in code and verified by `/sdd-execute`, not just documented. |

These NFRs are generated from evidence (Phase 1A classifications), not assumed. Each must cite the Phase 1A dimension that triggered it: `[Source: Phase 1A — {dimension} = {value}]`.

### Section 4.8 — Impacted Areas

Table mapping every impacted area to concrete code references: File/Class/Endpoint, Nature of Change, POD Spec Reference. Use **actual file paths and class names** found during codebase analysis.

**Integration interlock rows:** If a contract file is generated in Step 5B, add one row per interlock to this table so that readers of the spec can see the integration footprint without opening the contract file. Use the format:

| Impacted Area | File/Class/Endpoint | Nature of Change | Reference |
|---|---|---|---|
| {Interlock Name} ({Type}) | {Direction}: {Protocol+Format} | Integration — {brief: new/modified/existing} | `ai/contracts/{ISSUE_ID}/contract.md` §3.{N} |

Full integration details (schemas, payloads, auth, SLA, error handling, sample data) remain exclusively in the contract file — do not duplicate them here. This is a summary pointer only.

### Section 4.9 — Open Questions & Assumptions

Three sub-sections:
- **Open Questions** — genuinely unresolvable without human input (max 5, ranked by implementation impact)
- **Auto-Resolved Assumptions** — marked with `[AUTO-RESOLVED]` prefix + evidence citation
- **Other Assumptions** — with rationale

### Section 4.10 — Definition of Done

Checklist: all FRs implemented, ACs passing, tests written/updated, NFRs validated, code reviewed, no regressions, documentation updated, spec reviewed against implementation.

### Change Log

Empty table for future use by `/sdd-fix` skill:

```markdown
## Change Log
| JIRA | Type | Summary | Date |
|---|---|---|---|
```

---

## Step 5A — Spec Quality Validation

After generating `specs.md`, verify:

- No implementation details leaked into FRs, ACs, or Scope (code references belong only in §4.8)
- All FRs are testable and have source citations
- Scope has both In Scope and Out of Scope populated
- Acceptance criteria are verbatim from JIRA
- Every FR maps to at least one Impacted Area entry
- **Section 4.0 exists** with RRS meeting the calibrated Green threshold (from §3E `Threshold Applied` field) and all applicable dimensions scored. Software Classification sub-table has all 13 Phase 1A dimensions with evidence citations.
- **RRG answers are reflected** in their target sections (D1 → §4.2, D5 → §4.7 Security, etc.) — Section 4.0 is the index, not the only location
- **Section 4.0A exists** with TRC evaluation recorded. ⚠️/✅/📎 items routed per TRC handling rules.
- **Section 4.0B exists** with Input Fidelity scan recorded. All 🔶 Fidelity items must show status ✅ Resolved. If any 🔶 item is unresolved, fix before presenting to the user.
- **No residual placeholders in spec body** — scan §4.2 through §4.9 for content matching RRG §Phase 1B fidelity signals (S1–S4). The spec itself must not contain placeholder identifiers, fake URLs, or filler values. If found, trace the source and resolve.
- **Zero residual TBD under Full Production:** If `Delivery Scope = Full Production` (from Section 4.0), scan §4.2 through §4.8 for any `TBD`, `TODO`, `N/A` (used as a placeholder value), `To be confirmed`, `TBC`, or equivalent markers. If found, these **must** be resolved before presenting to the user — trace each back to its source dimension and either resolve from available context or prompt the user. **Exception:** §4.9 (Open Questions) may contain items explicitly acknowledged by the user during Step 2A.5 (marked as `[TBD — USER-ACKNOWLEDGED]`) — these are the only permitted TBD entries in a Full Production spec.

Fix any failures before presenting to the user.

---

## Step 5B — Generate Integration Contract

Every non-trivial feature interacts with other systems. This step identifies the **central application** (the service/component being built or modified) and maps **all its interlocks** (every external system it touches), then documents the contract at each boundary.

### 5B.1 — Identify Central Application

From the spec, identify the primary service/component this feature builds or modifies:

- **Name** — service/application name
- **Archetype** — from Section 4.0 (RRG)
- **Responsibility** — one-sentence summary of what it does
- **Tech stack** — language, framework, runtime

### 5B.2 — Map Interlocks

Scan §4.5 (FRs), §4.7 (NFRs), §4.8 (Impacted Areas), and §4.0A (TRC findings) to identify every external system the central application connects to. For each, classify:

| Field | What to capture |
|---|---|
| **Interlock name** | Name of the external system/service |
| **Type** | API (REST/gRPC/GraphQL), Message Queue (Kafka/RabbitMQ/SQS), Database, File/SFTP, Cache, External SaaS, Internal shared library |
| **Direction** | Inbound (receives from), Outbound (sends to), Bidirectional |
| **Protocol & format** | HTTP/AMQP/JDBC, JSON/XML/Avro/Protobuf/CSV |
| **Auth mechanism** | OAuth2, mTLS, API key, LDAP, cert-based, Basic Auth, or TBD |
| **Schema/payload** | Key fields, data types, required vs optional. If known — document fully. If TBD — note what's missing. |
| **Error handling** | Retry strategy, dead-letter, circuit breaker, timeout, fallback |
| **SLA/latency** | Expected response time, throughput, availability |
| **Owner** | Team/org that owns the interlock system |
| **Endpoint / Connection** | Exact URL, host:port, JDBC connection string, topic name, or queue name. Scan codebase config files (`application.yml`, `.env`, `docker-compose.yml`, `local.config`, properties files) for the current value. If found, cite with `[CONFIRMED from {file}]`. If not found, mark as `[TBD — MUST CONFIRM]`. |
| **Credentials Source** | Where credentials are stored: vault path, environment variable name, config map key, secret manager reference. Scan codebase for existing credential references. Mark `[CONFIRMED]` with source or `[TBD — MUST CONFIRM]`. Every TBD credential source must have a corresponding entry in §4.9 (Open Questions). |

### 5B.3 — Generate Contract File

**If one or more interlocks are identified**, write the contract at:

```
ai/contracts/{ISSUE_ID}/contract.md
```

> **CRITICAL:** File **MUST** be named exactly `contract.md` (Markdown extension enforced).

The contract **must** contain:

```markdown
# Integration Contract — {ISSUE_ID}

## 1. Central Application
| Field | Value |
|---|---|
| Name | {service name} |
| Archetype | {from §4.0} |
| Responsibility | {one-sentence} |
| Tech Stack | {language, framework, runtime} |

## 2. Interlock Map
| # | Interlock | Type | Direction | Protocol | Auth | Owner |
|---|---|---|---|---|---|---|
| 1 | {name} | {type} | {direction} | {protocol} | {auth} | {team} |
| 2 | ... | ... | ... | ... | ... | ... |

## 3. Per-Interlock Contract

### 3.{N} — {Interlock Name}
| Field | Value |
|---|---|
| Type | {API / Queue / DB / ...} |
| Direction | {Inbound / Outbound / Bidirectional} |
| Protocol & Format | {HTTP+JSON / Kafka+Avro / JDBC / ...} |
| Auth Mechanism | {OAuth2 / mTLS / ... / TBD} |
| SLA | {latency, throughput / TBD} |
| Owner | {team} |

**Schema / Payload:**
{request/response schema, message schema, or DB schema — as detailed as available}
{If TBD: note what's missing and reference §4.9 Open Questions}

**Error Handling:**
{retry strategy, dead-letter, circuit breaker, timeout, fallback}

**TBD Items:**
- {item} — tracked in specs.md §4.9
```

For fields where details are TBD (user said "will confirm later", "not sure yet", etc.), document them explicitly as TBD in the contract and ensure they have a corresponding entry in §4.9 (Open Questions). The contract is generated with what is known — TBD fields do not block generation.

**Interlock Endpoint & Credential Validation Rule:**
For every interlock in the contract, if the endpoint/connection-string is available in codebase config (e.g., `application.yml`, `.env`, `docker-compose.yml`, `local.config`), the contract must cite the exact current value with the source file. If not found in any config file, the interlock entry must mark the endpoint as `[TBD — MUST CONFIRM]` and add a corresponding entry to specs.md §4.9 (Open Questions). Never assume or fabricate endpoint URLs or connection strings.

Update the spec's frontmatter to reference the contract file.

### 5B.4 — Skip Condition

Skip contract generation **only if** the feature has zero interlocks — i.e., it is entirely self-contained with no external dependencies (pure refactor, internal logic change, standalone utility). Note the skip reason in Step 7 summary.

---

## Step 6 — Transition JIRA to "Defining Details"

Fetch current status via MCP. If not already "Defining Details", get available transitions and execute the matching one:

```
mcp2_jira_get_transitions
  issue_key: {ISSUE_ID}

mcp2_jira_transition_issue
  issue_key: {ISSUE_ID}
  transition_id: {TRANSITION_ID}
```

JIRA transition failure is **non-blocking**. Log a warning and continue.

### Step 6A — Sync Linked Story (Dual-Update)

**Skip if `{LINKED_STORY_ID}` is null** (no linked Story exists).

If a linked Story exists, post a status-sync comment on the Story:

```
jira_add_comment
  issue_key: {LINKED_STORY_ID}
  body: |
    {panel:title=Spec Generated|borderStyle=solid|borderColor=#0052cc|titleBGColor=#deebff|bgColor=#f0f8ff}
    Feature specification has been generated for this story.

    *Spec Issue:* [{ISSUE_ID}|{JIRA_BASE_URL}/browse/{ISSUE_ID}]
    *Spec File:* {{ai/specs/{ISSUE_ID}/specs.md}}
    *RRS:* {score}% {status}
    *FRs:* {count} functional requirements identified

    All detailed specifications and downstream artifacts are tracked on the Spec issue.
    {panel}
```

Also transition the Story to "Defining Details" if available (same transition as the Spec):

```
jira_get_transitions
  issue_key: {LINKED_STORY_ID}

jira_transition_issue
  issue_key: {LINKED_STORY_ID}
  transition_id: {TRANSITION_ID for "Defining Details"}
```

Story updates are **non-blocking** — report failures but do not stop the skill.

---

## Step 7 — Confirm Output

Present a concise completion summary. Do NOT re-list open questions, assumptions, or interlock details — these are already documented in the spec and contract files.

```
=== create-specs Complete ===

Issue:    {ISSUE_ID} — {summary}
Spec:     ai/specs/{ISSUE_ID}/specs.md
Contract: ai/contracts/{ISSUE_ID}/contract.md ({N} interlocks)
          or: No interlocks — contract skipped
RRS:      {score}% {🟢}
JIRA:     Transitioned to "Defining Details" (or skipped/failed)
```

Do NOT append additional sections (interlocks list, open questions, assumptions). The user can read the spec file for full details.
