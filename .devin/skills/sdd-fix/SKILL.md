# Skill: fix

> Brownfield entry point. Classifies the change, scopes context, and routes — skipping heavy SDD skills when they aren't needed. All tiers follow the same Git/GitLab/JIRA process.

---

## Pre-Execution Directive — Always-On Rules

**Mandatory.** Before starting this skill, read `.devin/rules/architecture-standards.md`.
RULE 0 in that file defines how every rule applies at each step of this skill.
RULE 1 defines MCP availability handling — if the `standards-fabric` MCP server
is configured but unreachable, the skill continues (not blocked); see RULE 1 for details.

---

## Input

The user provides one of:

- A JIRA issue ID (e.g., `PROJECT-1234`)
- A plain description (e.g., `"Fix null pointer in RegistrationService when entitlements list is empty"`)

If a JIRA issue ID is provided, fetch the issue summary and description via the `jira-it` MCP server. Use the issue content for classification.

### Input Resolution — Story-to-Spec Detection

When a JIRA issue ID is provided:

1. Fetch the issue: `jira_get_issue` with `fields: issuetype,summary,description,issuelinks`
2. Read `issuetype.name`:
   - If **`Story`** → invoke `/sdd-story-to-spec {ISSUE_ID}`. Use the returned Spec ID as `{ISSUE_ID}`. Record original Story as `{LINKED_STORY_ID}`.
   - If **`Spec`** → use directly. Scan `issuelinks` for a linked Story and record as `{LINKED_STORY_ID}` (or null).
   - If **any other type** → check for linked Spec in `issuelinks`. If found, use it. Otherwise, invoke `/sdd-story-to-spec`.
3. Use the resolved issue content for classification.

All subsequent steps use the Spec as `{ISSUE_ID}`. The `{LINKED_STORY_ID}` receives status-sync at Step 7.

---

## Step 1 — Classify the Change

Answer these questions against the user's input. Stop at the first "Yes."

```
Q1: Is it broken? (bug, crash, regression, wrong output)
 └─ YES → TIER 1: Fix

Q2: Is the change fully describable in the user's message?
    (no new contracts, no new domain concepts)
 └─ YES → TIER 2: Tweak

Q3: Does it alter an external contract or introduce a new
    domain concept? (API shape, DB schema, message format,
    new business rule)
 └─ YES → TIER 3: Enhancement

Q4: None of the above.
 └─ → TIER 4: Feature → hand off to /sdd-sdlc
```

Present the classification to the user:

```
=== Change Classification ===

Input:    {ISSUE_ID or description}
Tier:     {1/2/3/4} — {Fix / Tweak / Enhancement / Feature}
Reason:   {one sentence explaining why this tier}
Context:  {what will be loaded — see table below}

Proceeding with Tier {N} path.
```

If the tier is ambiguous, ask the user to confirm before proceeding.

### Step 1A — Phase 1A Adjustment

After classifying the tier, check if Phase 1A Software Classification exists in the most recent spec for this codebase (search `ai/specs/` for the latest spec covering the affected code). If found, read the classifications and apply adjustments:

| Phase 1A Value | Adjustment |
|---|---|
| **Lifecycle = Prototype** | Force Tier 1 for all changes — prototypes don't need spec ceremony. Skip RRG/TRC entirely. Only requirement: regression test + working code. |
| **Lifecycle = Deprecated** | Warn user: "This software is classified as Deprecated. Changes should be minimal and risk-averse. Consider whether this fix is worth the maintenance cost." Proceed with classified tier but skip infrastructure changes. |
| **Criticality = Mission-critical** | Escalate tier by one level: Tier 1 → Tier 2 (adds impact preview), Tier 2 → Tier 3 (adds readiness check). Tier 3 stays Tier 3. Rationale: mission-critical systems need more scrutiny even for small changes. |
| **Data Sensitivity = Confidential/Restricted** | Add mandatory check before committing: scan diff for PII/secrets exposure. If any found, STOP and remediate before proceeding. |

If no Phase 1A classification exists (no prior spec, or spec predates Phase 1A), skip this step — use the tier as classified in Step 1.

Present the adjustment (if any):
```
=== Phase 1A Adjustment ===
Lifecycle:   {value} — {adjustment applied or "no adjustment"}
Criticality: {value} — {adjustment applied or "no adjustment"}
Sensitivity: {value} — {adjustment applied or "no adjustment"}
Final Tier:  {adjusted tier}
```

---

## Step 2 — Scope Context

Load **only** what the tier requires. This is the single most important token-saving decision.

| Concern | Tier 1 — Fix | Tier 2 — Tweak | Tier 3 — Enhancement | Tier 4 — Feature |
|---|---|---|---|---|
| **SDD skills** | None | None | `/sdd-create-specs` (abbreviated) | Hand off to `/sdd-sdlc` |
| **Spec file** | No | No | Abbreviated `specs.md` | Full `specs.md` + `plan.md` |
| **POD knowledge** | Don't load | Only if a specific reference is needed | 1–2 files relevant to the contract | Full `ai/knowledge/` |
| **`AGENTS.md`** | Only if build/test command is needed | Only if build/test command is needed | Yes | Yes |
| **JIRA ceremony** | Comment + transition | Comment + transition | Comment with summary + files changed + transition | Full (attach specs, transitions, Confluence) |

---

## Step 3 — Create Feature Branch

For **all tiers**, create a feature branch before making changes. Projects are stored as git submodules under `ai/submodules/`.

1. Identify impacted project(s) from the classification.
2. For each impacted project:

```bash
cd ai/submodules/{project-name}
git checkout develop && git pull origin develop
git checkout -b develop-{ISSUE_ID}
```

3. Also create the branch in the `ai/` parent repo if any ai/ files will change (spec changelog, abbreviated spec):

```bash
cd ai
git checkout develop && git pull origin develop
git checkout -b develop-{ISSUE_ID}
```

If the user provided a description instead of a JIRA ID, use a short slug for the branch (e.g., `develop-fix-null-pointer-registration`).

---

## Step 3B — Impact Trace

Before implementing any change, trace the dependency chain of the code being modified. This is not full regression analysis — it is a targeted scan to identify what depends on the changed code.

1. **Identify the changed unit** — the function, method, class, or config entry being modified
2. **Trace dependents** — scan for all callers, consumers, importers, and references to the changed unit across the codebase (use `grep_search` / `code_search`)
3. **Map their tests** — for each identified dependent, check if a covering test exists. These tests form the **scoped regression set** used in Step 5.
4. **Scale by tier:**
   - Tier 1: one level — direct callers of the changed unit
   - Tier 2: two levels — callers and their callers
   - Tier 3: handled by TRC blast radius scanning (Step 4A-trc)

Present the trace before implementing:

```
=== Impact Trace ===
Changed:          {function/method/class}
Direct dependents: {N} across {N} files
Scoped test set:   {N} test files covering the call chain
Untested callers:  {list, if any — flag as risk}
```

If the trace reveals the change affects a shared contract, shared utility, or has more than 10 direct dependents, evaluate the escalation signals before proceeding.

### Step 3B.5 — Internal Code Path Trace

For the function/method being fixed, trace all **internal** code paths — not just external callers. This ensures a fix applied to one path is also applied to analogous logic in alternative paths.

1. **Map all paths through the changed function:**
   - Primary execution path (happy path)
   - Fallback/default paths (catch blocks, else branches, default switch cases)
   - Retry/recovery paths (retry loops, compensating logic)
   - Error handler paths (exception handlers, error callbacks)

2. **Detect analogous patterns:** If the fix addresses a specific pattern (e.g., a null check, a lookup call, an auth token fetch), scan all other paths in the same function and its siblings for the **same pattern**. For example:
   - A 404 fix in the primary API lookup path → check the fallback search path for the same issue
   - A null-safety fix in one branch → check all other branches handling the same variable
   - A connection string fix in the main config path → check the fallback config path

3. **Present the internal path analysis:**
   ```
   === Internal Code Paths ===
   Function:       {name} ({file}:{line_range})
   Primary path:   lines {start}-{end} — {fix applied here? YES/NO}
   Fallback path:  lines {start}-{end} — {same pattern present? YES/NO → fix applied?}
   Retry path:     lines {start}-{end} — {same pattern present? YES/NO → fix applied?}
   Error path:     lines {start}-{end} — {same pattern present? YES/NO → fix applied?}
   ```

4. **Apply fix to ALL paths** that contain the same pattern. If a path has the pattern but a different fix is needed (different context), note it and apply the context-appropriate fix.

> **Why this matters:** Feedback showed that fixes were applied only to the primary code path (e.g., primary API lookup), missing analogous logic in fallback paths (e.g., fallback search). This caused the same bug to resurface via the alternate path.

---

## Step 3C — Error Classification

Before implementing any Tier 1 or Tier 2 fix, classify the error to ensure the fix targets the correct layer. This prevents applying fixes at the wrong abstraction level (e.g., patching config to work around an auth mechanism bug).

1. **Classify the error type:**

   | Error Type | Indicators | Examples |
   |---|---|---|
   | **Permission** | HTTP 401/403, access denied, insufficient privileges, token rejected | OAuth token expired, RBAC misconfigured, vault policy missing |
   | **Connectivity** | Timeout, connection refused, DNS resolution failure, network unreachable | Service down, wrong host/port, firewall blocking |
   | **Logic** | Wrong output, incorrect calculation, unexpected behavior with valid input | Business rule not applied, wrong mapping, missing validation |
   | **Data** | Corrupt data, missing records, constraint violation, stale cache | Orphaned FK, null in non-nullable, schema mismatch |
   | **Config** | Wrong value loaded, missing env var, property not found, profile mismatch | Wrong DB URL, missing feature flag, incorrect timeout value |

2. **Map the error to its layer:**

   | Error Type | Expected Fix Layer | NOT This Layer |
   |---|---|---|
   | Permission | Auth mechanism (token acquisition, credential source, RBAC/ABAC config, vault policy) | Config values, fallback logic |
   | Connectivity | Connection/retry/fallback layer (host resolution, circuit breaker, timeout config) | Auth mechanism, business logic |
   | Logic | Business logic / service layer (algorithms, mappings, validators) | Config, data access |
   | Data | Data access / migration layer (queries, schema, seed data, cleanup scripts) | Business logic, config |
   | Config | Config loading / resolution layer (property files, env var parsing, profile selection) | Auth mechanism, business logic |

3. **Present the classification:**
   ```
   === Error Classification ===
   Error type:    {Permission / Connectivity / Logic / Data / Config}
   Error layer:   {Auth-mechanism / Connection-retry / Business-logic / Data-access / Config-loading}
   Fix target:    {specific file/class/method where fix will be applied}
   Layer match:   {YES — fix is in the correct layer / NO — explain mismatch}
   ```

4. **Fix-layer validation rule:** After implementing the fix, verify the changed code is in the **same layer** as the error classification. If the fix modified a different layer (e.g., patching config to work around an auth error), STOP and flag:
   ```
   WARNING: Fix applied at {actual layer}, but error was classified as {error type}.
   This may be a workaround, not a root cause fix.
   → Confirm with user before proceeding.
   ```

> **Why this matters:** Feedback showed that a vault connection fix (403 permission error) was patched in config instead of fixing the fallback auth mechanism — addressing the symptom, not the root cause.

### Phase 1A-Informed Error Diagnosis

If Phase 1A classifications are available, use them to refine error diagnosis:

| Phase 1A Value | Diagnostic Guidance |
|---|---|
| **Multi-tenancy = Multi-tenant** | If error is Data-type, check: is the query missing a tenant filter? Is one tenant's data leaking into another's error response? |
| **Statefulness = Stateful** | If error is intermittent/non-reproducible, check: is it a stale session or cached state issue? Does the error correlate with session expiry or node failover? |
| **Runtime Model = Batch/Scheduled** | If error is timing-related, check: DST transition impact on cron schedule? Job overlap (previous run not finished when next starts)? |
| **AI/ML Component ≠ None** | If error is Logic-type in ML code, check: model version mismatch? Input data schema drift? Non-deterministic output (expected for probabilistic models)? |
| **Data Volume = Large/Massive** | If error is Performance-type, check: missing pagination? Missing index? Full-table scan on large dataset? Transaction timeout on bulk operation? |

---

## Step 4 — Plan & Execute per Tier

### Tier 1 — Fix

Implement the fix directly. No SDD skills, no spec files, no plan files.

**Context:** Only the broken file(s) and their test(s). Use targeted `code_search` / `grep_search` to locate the fault — do not bulk-read directories or POD knowledge.

**Regression test:** Add a test that reproduces the defect (fails on unfixed code, passes on fixed code). Add it as a new test method in the existing test file for the affected unit — do not create a new test file. This test stays in the suite permanently as a regression guard.

**Spec changelog:** If a parent feature spec exists (search `ai/specs/` for the spec whose scope covers the affected code), verify the fix doesn't violate any existing FRs/ACs. If the bug revealed a spec gap, update the spec — add a new AC or note the gap in §4.9. Then append to the parent spec's **Change Log** (create the section if absent):

```markdown
## Change Log
| JIRA | Type | Summary | Date |
|---|---|---|---|
| {ISSUE_ID} | Bug | {one-line summary of fix} | {YYYY-MM-DD} |
```

---

### Tier 2 — Tweak

**Impact preview:** Before making changes, present a quick summary to the user:

```
=== Impact Preview ===

Files to modify:
  1. {file} — {what changes}
  2. {file} — {what changes}

Files NOT changing: {any related file the user might expect to change, with reason}

Proceed?
```

Wait for user confirmation. If the user adjusts scope, update accordingly.

**Implement** directly. The user's chat message is the requirement — no spec file needed.

**Context:** Impacted files + their tests. Load a single POD knowledge file only if needed to verify a field name, enum value, or API contract.

**Regression test:** If the tweak changes observable behaviour, add a test that verifies the new behaviour. Add it as a new test method in the existing test file — do not create a new test file.

**Spec changelog:** If the change relates to an existing feature spec in `ai/specs/`, append a row to its **Change Log** section (create if absent).

---

### Tier 3 — Enhancement

**Step 4A-pre — Lightweight Readiness Check:**

Run RRG in **abbreviated mode**: evaluate only dimensions with weight ≥ 2 for the detected archetype, threshold ≥ 65%. Also run the Input Fidelity Scan in **abbreviated mode** per `sdd-requirement-readiness-gate.md` §Phase 1B Abbreviated Mode (S1 and S2 only, top 3 flags, non-blocking). Record any flags in the abbreviated spec §4.0B.

**Abbreviated Weight Matrix (weight ≥ 2 only):** Use the table below — do NOT fall back to equal weights. Look up the detected archetype's column and evaluate only dimensions with weight ≥ 2.

| Dimension | Service/API | UI/Frontend | Data Pipeline | Integration | Platform/Infra | Packaged SW | Library/SDK | AI/ML |
|---|---|---|---|---|---|---|---|---|
| D1 Business Purpose | 3 | 3 | 3 | 3 | 2 | 3 | 2 | 3 |
| D2 Larger Context | 2 | 2 | 3 | 3 | 2 | 3 | — | 2 |
| D3 Consumer Identity | 3 | 3 | 2 | 2 | — | 2 | 3 | 2 |
| D4 Deployment & Hosting | 3 | 2 | 3 | 2 | 3 | — | — | 3 |
| D5 Security & Access | 3 | 3 | 2 | 3 | 2 | 3 | — | 2 |
| D6 Performance & SLA | 3 | 2 | 3 | 2 | 2 | 2 | — | 3 |
| D7 Scalability & Capacity | 3 | — | 3 | 2 | 3 | 2 | — | 3 |
| D8 Observability | 2 | — | 3 | 2 | 2 | 2 | — | 3 |
| D9 Data & Entity | 2 | 2 | 3 | 2 | — | 3 | — | 3 |
| D10 Resilience & Response | 3 | — | 3 | 3 | 2 | 2 | — | 2 |
| D11 Reuse & Discoverability | 2 | 2 | 2 | 2 | — | 3 | 3 | 2 |
| D12 Platform Constraints | — | — | — | — | 2 | 3 | 2 | 2 |

> `—` = weight 0 or 1 for this archetype → skip in abbreviated mode.

**RRS formula (same as full mode, filtered dimensions):**
```
RRS = ( Σ (weight_i × fill_i) / Σ weight_i ) × 100
where i iterates over dimensions with weight ≥ 2 for the detected archetype.
```

**TBD Scoring Rule:** Any dimension answer containing `TBD`, `TODO`, `N/A` (as placeholder), or equivalent non-committal language scores **0.0** (not addressed). A concrete answer is required for 0.5 or 1.0.

**Gate (calibrated by Phase 1A Criticality Tier):** Look up the abbreviated-mode threshold from this table. If no Phase 1A classification exists, default to Business-critical row.

| Criticality Tier | Green Threshold | Amber Floor | Escalation Floor |
|---|---|---|---|
| Mission-critical | **≥ 75%** | 50% | < 40% → Tier 4 |
| Business-critical | **≥ 70%** | 45% | < 40% → Tier 4 |
| Best-effort | **≥ 65%** | 40% | < 35% → Tier 4 |
| Prototype-PoC | **≥ 50%** | 35% | < 30% → Tier 4 |

RRS ≥ Green → 🟢 Proceed. RRS ≥ Amber Floor but < Green → 🟡 Amber (present top 3 gaps). RRS < Escalation Floor → 🔴 Escalate to Tier 4.

**Escalation trigger:** if the check reveals the change needs full dimensional coverage (shared contracts, DB migration, auth logic) → escalate to Tier 4 / `/sdd-sdlc`.

Announce the result:

```
=== Lightweight Readiness Check (Tier 3) ===

Archetype:    {archetype}
RRS:          {score}% (abbreviated mode, threshold: 65%)
Weights:      Archetype-specific ({archetype} column, weight ≥ 2 only)
Dimensions:   {N} evaluated (weight ≥ 2 only)
Fidelity:     {N} flags ({N} 🔶 / {N} ⚪) — {resolved / warned}
Status:       {🟢 Proceed / 🟡 Gaps below — please clarify / 🔴 Escalating to Tier 4}
```

If Amber, present the **top 3 gaps** (sorted by weighted impact) and collect answers before proceeding. Include the abbreviated RRS in the spec output (Section 4.0 with `Mode: Abbreviated`).

**Step 4A-trc — Abbreviated Tactical Check:**

After RRG passes Green, run TRC in **abbreviated mode** per `sdd-tactical-readiness-checklist` §Abbreviated Mode (weight ≥ 2 categories, top 5 flags, skip Cat 11 & 12). Record in abbreviated spec §4.0A. Single-pass — no loop.

**Step 4A-contract — Abbreviated Interlock Contract:**

If the enhancement touches integration boundaries (calls external APIs, writes to shared DBs, publishes/consumes messages), generate an abbreviated contract at `ai/contracts/{ISSUE_ID}/contract.md` containing:

1. **Central Application** — name, archetype, one-line responsibility
2. **Interlock Map** — table of interlocks (name, type, direction, protocol, auth)
3. **Per-Interlock Contract** — only for interlocks **directly affected by this enhancement** (not all interlocks of the parent service). Include schema/payload, error handling, and TBD items.

Skip contract generation if the enhancement is purely internal (logic change, UI tweak, refactor with no integration boundary changes).

**Step 4A — Abbreviated spec:** Generate `ai/specs/{ISSUE_ID}/specs.md` with only:
- **Section 4.0** — Abbreviated Requirement Readiness Assessment
- **Section 4.0A** — Abbreviated Tactical Readiness (top 5 flags only)
- **Overview** (3–5 sentences)
- **Functional Requirements** (table)
- **Acceptance Criteria** (Given/When/Then)
- **Impacted Files** (list)

Skip: Background, Scope, NFRs, Open Questions, Definition of Done.

**Step 4B — User checkpoint:** Present the abbreviated spec summary:

```
=== Enhancement Spec Ready ===

Spec written: ai/specs/{ISSUE_ID}/specs.md
Contract:     ai/contracts/{ISSUE_ID}/contract.md ({N} interlocks)
              or: Skipped — no integration boundaries affected
FRs:          {count}
ACs:          {count}
Files:        {count} files impacted

Review the spec before I implement?
  1. Proceed — looks good
  2. Let me review first — pause here
```

**Continuation Directive:** After the user confirms "Proceed" at the Step 4B checkpoint, continue through Steps 4C → 4-post → 5 → 6 → 7 without stopping, summarizing, or waiting for further input. The only acceptable pause point after 4B confirmation is Step 5 (verification), where the user may choose to test locally.

**Step 4C — Implement** against the abbreviated spec.

**Delivery Scope enforcement:** Before implementing, read `Delivery Scope` from the most recent spec covering this codebase (search `ai/specs/` Section 4.0). If `Delivery Scope = Full Production`:
- Every FR in the abbreviated spec must be fully implemented. No incomplete implementations, no skeleton code, no hollow methods that defer real logic.
- Do NOT create skeleton code that merely outlines the architecture. Implement the real business logic for every component. (Test doubles in test classes are fine — this rule applies to production source code only.)
- Config values the user explicitly defers are the only permitted TBDs — and these must be externalized (env var / config map), never hardcoded.

If no prior spec exists or Delivery Scope is not set, default to `Full Production` for `Lifecycle = Production/MVP/Legacy/Deprecated`, and `Proof of Concept` only for `Lifecycle = Prototype` with user confirmation.

> **Clarify before you defer:** if implementation needs configuration values not defined in the abbreviated spec (endpoints, credentials/credential sources, field mappings, routing rules), collect them into a single consolidated question and ask the user once. Apply any values they provide; only values they defer become TBD (externalized config + `TODO: resolve before production` at the usage site) and must be listed in a `⚠️ Deferred / TBD Items` block in the Summary Output. Never hardcode a production value.

**Context:** Abbreviated spec + impacted source files + 1–2 POD knowledge files relevant to the contract being changed.

**Spec changelog:** If this enhancement modifies behavior originally defined in a parent feature spec, append a row to the parent spec's **Change Log** section (create if absent).

---

### Tier 4 — Feature

This change needs the full SDD pipeline. Hand off:

```
This change is classified as Tier 4 (Feature) — it needs full SDD ceremony.

Handing off to /sdd-sdlc {ISSUE_ID}.
```

Then execute the `/sdd-sdlc` skill. Do NOT continue in the `/sdd-fix` flow.

---

### Tier 3 Completeness Gate

**Mandatory for Tier 3 before proceeding to Step 4-post.** After Step 4C implementation:

1. Read the abbreviated spec's FR table in full.
2. For every FR, verify corresponding code exists: run `git diff --name-only develop` and cross-reference each FR against changed files. Every FR must map to at least one changed file.
3. If any FR has no corresponding code change → implement it now. Do NOT proceed.
4. Scan production source code (exclude test files) for incomplete implementations (`// TODO`, `throw new UnsupportedOperationException`, `NotImplementedError`, empty method bodies, methods returning only hardcoded/dummy values). If found under `Delivery Scope = Full Production`, replace with real implementations before proceeding. Test doubles in test classes are not flagged.
5. Only after every FR has corresponding code AND no incomplete implementations remain → proceed to Step 4-post.

---

## Step 4-post — Spec Synchronization

After implementing code changes (any tier), ensure the spec documentation stays in sync:

### Spec Document Rules

| Invocation | Spec Action |
|---|---|
| **With JIRA ID, no existing spec** (`ai/specs/{ISSUE_ID}/` doesn't exist) | **Create** a new spec at `ai/specs/{ISSUE_ID}/specs.md`. Tier 1/2: minimal spec (overview, fix/change summary, impacted files, regression test added). Tier 3: full abbreviated spec per Step 4A. |
| **With JIRA ID, existing spec found** | **Update** the existing spec — append to Change Log, update impacted sections (§4.8, §4.9 if applicable). Mark changes with `[UPDATED-{YYYY-MM-DD}]`. |
| **Without JIRA ID (plain description)** | **Update** the latest spec in `ai/specs/` whose scope covers the affected code. Find by matching impacted file paths against §4.8 (Impacted Areas) of each existing spec. If no matching spec exists, create a new spec with a slug-based directory name (e.g., `ai/specs/fix-null-pointer-registration/specs.md`). |

### Post-Implementation Validation

After code changes are committed, verify spec-code sync:

1. **Diff check:** For every file modified in the commit, verify it appears in the spec's §4.8 (Impacted Areas). If a modified file is missing from §4.8, add it.
2. **Change Log entry:** Verify the spec's Change Log has a row for this fix/change. If missing, add it.
3. **Violation flag:** If code was modified but the spec was not updated at all, this is a skill violation. Fix it before proceeding to Step 5.

> **Why this matters:** Feedback showed that `/sdd-fix` made code changes without updating spec documents, causing specs to drift from the actual codebase state. When invoked with a new JIRA ID, no spec was created at all.

---

## Step 5 — Verify & Test

After implementation, run tests and give the user a chance to verify locally before anything is committed or pushed. The depth of verification is proportional to the tier.

### Tier 1

Run the test file(s) directly related to the fix **plus** the scoped regression set identified in Step 3B (tests covering direct callers of the changed code):

```bash
{test_command for specific test class/file and scoped regression set}
```

Present results:

```
=== Verification — Tier 1 Fix ===

Tests run:       {test file(s)} + {N} scoped regression tests
Regression test: {new test name} — {pass/fail}
Result:          {X}/{X} passed

Options:
  1. Proceed to commit & push
  2. I'll test locally first — pause here
```

### Tier 2

Run the impacted module's full test suite. Show the diff summary:

```
=== Verification — Tier 2 Tweak ===

Files changed:  {git diff --stat summary}
Tests run:      {module test suite}
Result:         {X}/{X} passed

Options:
  1. Proceed to commit & push
  2. I'll test locally first — pause here
  3. Show me the full diff
```

### Tier 3

Run cross-module tests for all impacted projects. Show coverage if available:

```
=== Verification — Tier 3 Enhancement ===

Files changed:   {git diff --stat summary}
Tests run:       {cross-module test suites}
Result:          {X}/{X} passed
Code coverage:   {percentage} (run: {coverage_command from AGENTS.md})

Local simulation: {Available — see spec / Not applicable}
  {If abbreviated spec listed external dependencies, surface setup instructions}

Options:
  1. Proceed to commit & push
  2. I'll test locally first — pause here
  3. Show me the coverage report
  4. Show me the local simulation setup
```

**If user chooses to test locally:** pause and wait. On resume, re-verify working tree and re-run tests before continuing.

**If tests fail:** fix implementation (not tests). Retry up to 3 times. If still failing, stop and report.

---

## Step 6 — Commit, Push & Create MR

All tiers follow the **same Git/GitLab process.** This ensures consistent traceability and code review regardless of change size.

### 6.1 — Commit

Commit in **submodule-first order:**

```bash
# Each affected submodule
cd ai/submodules/{project-name}
git add -A
git commit -m "JIRA#{ISSUE_ID}; {type}: {description}"
```

Where `{type}` is `fix` for Tier 1, `feat` or `refactor` for Tier 2–3.

If `ai/` repo has changes (spec changelog, abbreviated spec):

```bash
cd ai
git add -A
git commit -m "JIRA#{ISSUE_ID}; Update specs for {ISSUE_ID}"
```

Commit message format follows `AGENTS.md` conventions.

### 6.2 — Push

Push submodules first, then parent:

```bash
# Each submodule
cd ai/submodules/{project-name}
git push -u origin develop-{ISSUE_ID}

# Parent ai/ repo (if changed)
cd ai
git push -u origin develop-{ISSUE_ID}
```

**Push error handling:**

| Error | Action |
|---|---|
| Non-fast-forward | Ask user: `--force-with-lease` or `git pull --rebase` |
| Auth error (401/403) | Report. Suggest checking credentials. Do NOT retry |
| Network error | Retry once. If still failing, skip |

### 6.3 — Update Submodule References

If workspace root has `.gitmodules`, update branch tracking for impacted projects:

```bash
cd ${WORKSPACE_ROOT}
git config -f .gitmodules submodule.<project-directory>.branch develop-${ISSUE_ID}
git add .gitmodules
git add <project-directories>
git commit -m "JIRA#${ISSUE_ID}; Update submodule references"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

If workspace root is not a Git repo or has no `.gitmodules`, skip silently.

### 6.4 — Create Merge Request

For each repo pushed successfully, create a GitLab MR:

```bash
GIT_PAT=$(grep GIT_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
REMOTE_URL=$(git remote get-url origin)
GIT_HOST=$(echo "$REMOTE_URL" | sed 's|https://\([^/]*\)/.*|\1|')
GIT_API_BASE="https://${GIT_HOST}/api/v4"
ENCODED_PATH=$(echo "$REMOTE_URL" | sed 's|https://[^/]*/||; s|\.git$||' | sed 's|/|%2F|g')
```

Check for existing MR first:

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests?source_branch=develop-{ISSUE_ID}&target_branch=develop&state=opened
```

If none exists, create:

```
POST ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests
```

```json
{
  "source_branch": "develop-{ISSUE_ID}",
  "target_branch": "develop",
  "title": "JIRA#{ISSUE_ID}; {description}",
  "remove_source_branch": true
}
```

**CRITICAL:** `target_branch` MUST be `"develop"`. **NEVER** `"main"` or `"master"`.

**MR error handling:**

| HTTP Status | Action |
|---|---|
| 401/403 | Report. Skip project |
| 409 Conflict | Query existing MR |

---

## Step 7 — Update JIRA

Post a summary comment via MCP:

```
mcp2_jira_add_comment
  issue_key: {ISSUE_ID}
  body: |
    h3. {Fix / Tweak / Enhancement} Complete
    *Branch:* {{develop-{ISSUE_ID}}}
    *MR:* {MR URL(s)}
    *Files changed:* {count}
    *Tests:* {X}/{X} passed
```

Transition to **Ready to Deploy**:

```
mcp2_jira_get_transitions → find "Ready to Deploy" (or "Ready To Deploy")
mcp2_jira_transition_issue → execute
```

JIRA failures are **non-blocking**. If no JIRA ID was provided (user gave a description), skip JIRA updates.

### Step 7A — Sync Linked Story (Dual-Update)

**Skip if `{LINKED_STORY_ID}` is null or no JIRA ID was provided.**

Post a summary on the linked Story:

```
jira_add_comment
  issue_key: {LINKED_STORY_ID}
  body: |
    {panel:title={Fix / Tweak / Enhancement} Complete|borderStyle=solid|borderColor=#14892c|titleBGColor=#d4f5d4|bgColor=#f5fff5}
    *Spec Issue:* [{ISSUE_ID}|{JIRA_BASE_URL}/browse/{ISSUE_ID}]
    *Branch:* {{develop-{ISSUE_ID}}}
    *MR:* {MR URL(s)}
    *Files changed:* {count}
    *Tests:* {X}/{X} passed
    {panel}
```

Transition the Story to "Ready to Deploy" (matching the Spec's transition):

```
jira_get_transitions issue_key: {LINKED_STORY_ID}
jira_transition_issue issue_key: {LINKED_STORY_ID} transition_id: {ID for "Ready to Deploy"}
```

Story updates are **non-blocking**.

---

## Escalation Signals

If any of these surface **during** Tier 1–3 work, stop and re-classify upward:

- Touches a **shared contract** consumed by other teams
- Requires a **database migration**
- Involves **auth/security logic**
- Scope grows **beyond initial expectation**
- Needs **more than two clarifying questions** from the user

Announce the re-classification:

```
=== Escalation ===

Original tier: {N}
New tier:      {N+1}
Reason:        {what triggered the escalation}

Switching to Tier {N+1} path.
```

---

## Summary Output

After MR creation and JIRA update, present a concise completion notice:

```
=== /fix Complete — {ISSUE_ID} ===

Tier:   {1/2/3} — {Fix / Tweak / Enhancement}
Branch: develop-{ISSUE_ID}
MRs:    {N} created targeting develop
JIRA:   → Ready to Deploy

Next: Wait for code review on the MR(s).
```

Do NOT re-list files, tests, or MR URLs — the JIRA comment and MR description contain full details.

If Tier 3 has deferred config items, append a single line:
```
⚠️ {N} config items deferred — see TODO comments in code
```