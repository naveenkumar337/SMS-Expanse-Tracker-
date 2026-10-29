# Skill: execute

> End-to-end feature implementation — from JIRA prep through TDD, Git push, MR creation, and MR review comment resolution. Detects existing MRs with review comments for re-entry.

---

## Pre-Execution Directive — Always-On Rules

**Mandatory.** Before starting this skill, read `.devin/rules/architecture-standards.md`.
RULE 0 in that file defines how every rule applies at each step of this skill.
RULE 1 defines MCP availability handling — if the `standards-fabric` MCP server
is configured but unreachable, the skill continues (not blocked); see RULE 1 for details.

---

## Prerequisites

- `local.config` at workspace root contains:
  - `GIT_PAT` — GitLab Personal Access Token with `api` scope (MR creation, comment queries)
  - `JIRA_PAT` and `JIRA_BASE_URL` — used only for JIRA attachment uploads (MCP handles all other JIRA operations)
- Implementation plan at `ai/specs/{ISSUE_ID}/plan.md` and feature spec at `ai/specs/{ISSUE_ID}/specs.md`.
- Feature branches follow naming convention `develop-{ISSUE_ID}`.
- Consult `AGENTS.md` for module-to-project mapping, build/test commands, and coding conventions.
- If `AGENTS.md` is unavailable or empty (template-only), auto-detect build tools: `mvnw` → `./mvnw clean install`, `pom.xml` → `mvn clean install`, `package.json` → `npm install && npm test`, `build.gradle` → `./gradlew build`, `Cargo.toml` → `cargo build && cargo test`. **After auto-detection, write the discovered information to `AGENTS.md`** at the workspace root so future sessions have immediate context. Include: project name, detected tech stack, build commands, test commands, and module-to-project mapping. This ensures cross-session continuity — every session that auto-detects also persists the result.

> **JIRA fallback:** If MCP is unavailable for any JIRA operation, fall back to curl using `JIRA_PAT` and `JIRA_BASE_URL` from `local.config`. JIRA failures are always **non-blocking** — report but never roll back code.

---

## Step 1 — Obtain JIRA Issue ID & Detect Re-entry

Accept the JIRA Issue ID (e.g. `PROJECT-1234`).

### Step 1.0 — Resolve Linked Story

Resolve the Spec/Story relationship for dual-update:

1. Fetch the issue: `jira_get_issue` with `fields: issuetype,issuelinks`
2. If `issuetype.name` is `Story`:
   - Scan `issuelinks` for a linked Spec. If found, switch to the Spec ID.
   - If no linked Spec exists, invoke `/sdd-story-to-spec {ISSUE_ID}` and use the returned Spec ID.
3. If `issuetype.name` is `Spec`:
   - Scan `issuelinks` for a linked Story. Record as `{LINKED_STORY_ID}` (or null if none).
4. All subsequent steps use `{ISSUE_ID}` (the Spec). `{LINKED_STORY_ID}` receives status-sync at Steps 3, 4, and 15.

### 1A — Check for Existing MRs with Review Comments

Before starting fresh implementation, check if MRs already exist with unresolved review comments.

For each Git project under the workspace root, derive the GitLab API base:

```bash
REMOTE_URL=$(git remote get-url origin)
GIT_HOST=$(echo "$REMOTE_URL" | sed 's|https://\([^/]*\)/.*|\1|')
GIT_API_BASE="https://${GIT_HOST}/api/v4"
PROJECT_PATH=$(echo "$REMOTE_URL" | sed 's|https://[^/]*/||; s|\.git$||')
ENCODED_PATH=$(echo "$PROJECT_PATH" | sed 's|/|%2F|g')
```

Query for open MRs with the feature branch:

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests?source_branch=develop-{ISSUE_ID}&target_branch=develop&state=opened
```

If open MRs found, fetch discussions:

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/discussions
```

Filter to actionable comments only (ignore system notes, bot notes, resolved discussions).

| Condition | Action |
|---|---|
| **MRs exist with unresolved comments** | Jump to **MR Review Fix Phase** |
| **MRs exist, no unresolved comments** | Inform user — MRs are clean. Ask whether to continue or skip |
| **No MRs exist** | Continue with fresh implementation (Step 2) |

---

## Preparation Phase

### Step 2 — Verify Artifacts & Pre-Implementation Gate

Check that `ai/specs/{ISSUE_ID}/specs.md` and `ai/specs/{ISSUE_ID}/plan.md` exist. If either is missing, stop and direct the user to `/sdd-create-specs` or `/sdd-create-plan`.

**Requirement Readiness check:** Verify `specs.md` contains Section 4.0 (Requirement Readiness Assessment). Read the `Threshold Applied` field from Section 4.0 — this is the calibrated Green threshold set by RRG §3E based on Phase 1A Criticality Tier and Lifecycle Stage (e.g. 85% for Mission-critical + Production, 60% for Best-effort + Prototype). Verify RRS meets or exceeds this threshold. If no `Threshold Applied` field exists (pre-v1.2.0 spec), fall back to the default ≥ 80%. If Section 4.0 is absent or RRS is below the applicable threshold, stop — the spec must be re-evaluated via `/sdd-create-specs`.

**Phase 1A Classification check:** Verify Section 4.0 contains the Software Classification sub-table with all 13 dimensions populated and evidence-cited. If the classification is missing or incomplete (fewer than 13 dimensions, or any dimension lacks an evidence citation), stop — the spec was generated before Phase 1A expansion and must be re-evaluated via `/sdd-create-specs`.

**Integration Contract check:** If the spec references external systems, interlocks, or integration boundaries, verify `ai/contracts/{ISSUE_ID}/contract.md` exists and contains a populated interlock map. If the spec has interlocks but no contract file, stop and direct the user to re-run `/sdd-create-specs`.

**Input Fidelity check:** Verify `specs.md` contains Section 4.0B (Input Fidelity). If present, confirm all 🔶 Fidelity items show ✅ Resolved. If any 🔶 item remains unresolved, stop — the spec contains unverified placeholder content that will produce incorrect implementation. Direct the user to re-run `/sdd-create-specs`. If Section 4.0B is absent (spec predates fidelity scanning), do not block but add a warning: "Spec predates Input Fidelity scanning. Verify that field names, URLs, and config values in the spec are real, not placeholders."

Scan both files for unresolved items: open questions (not `[RESOLVED]`), `[AUTO-RESOLVED]` assumptions not confirmed, `TODO`/`TBD`/`TBC` markers, empty critical sections, traceability gaps (`NOT COVERED`), placeholder file paths, **and unresolved fidelity flags (Section 4.0B 🔶 items not marked ✅ Resolved)**.

> **Greenfield note:** file paths listed under the plan's **Section 3A — New Projects to Create** describe files/directories to be *created* by Step 4B, not existing paths. Do not flag them as missing/placeholder paths. If Section 3A is present, note that Step 4B (Project Bootstrap) will run before branch creation.

**If any found:** list every unresolved item with location. Stop — do not proceed until resolved.

**If clean:** proceed.

### Step 3 — Attach Specs to JIRA

Upload specs as JIRA attachments using curl (MCP attachment upload is not available):

```bash
JIRA_PAT=$(grep JIRA_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
JIRA_BASE_URL=$(grep JIRA_BASE_URL "$WORKSPACE_ROOT/local.config" | cut -d= -f2)

# Upload specs.md
curl -s \
  --header "Authorization: Bearer $JIRA_PAT" \
  --form "file=@ai/specs/${ISSUE_ID}/specs.md" \
  "${JIRA_BASE_URL}/rest/api/2/issue/${ISSUE_ID}/attachments"

# Upload plan.md
curl -s \
  --header "Authorization: Bearer $JIRA_PAT" \
  --form "file=@ai/specs/${ISSUE_ID}/plan.md" \
  "${JIRA_BASE_URL}/rest/api/2/issue/${ISSUE_ID}/attachments"
```

Post a summary comment via MCP:

```
mcp2_jira_add_comment
  issue_key: {ISSUE_ID}
  body: |
    h3. Feature Implementation Ready
    *Specification Documents:* specs.md, plan.md attached
    *Branch:* develop-{ISSUE_ID}
```

### Step 3A — Sync Linked Story (Dual-Update — Specs Attached)

**Skip if `{LINKED_STORY_ID}` is null.**

Post a comment on the linked Story:

```
jira_add_comment
  issue_key: {LINKED_STORY_ID}
  body: |
    {panel:title=Implementation Starting|borderStyle=solid|borderColor=#0052cc|titleBGColor=#deebff|bgColor=#f0f8ff}
    Feature implementation is starting.

    *Spec Issue:* [{ISSUE_ID}|{JIRA_BASE_URL}/browse/{ISSUE_ID}]
    *Branch:* {{develop-{ISSUE_ID}}}
    *Spec & Plan:* Attached to Spec issue
    {panel}
```

Story comment failure is **non-blocking**.

### Step 4 — Transition JIRA to "In Development"

Transition the Spec issue:

```
jira_get_transitions → find "In Development"
jira_transition_issue → execute with comment: "Feature implementation started on branch develop-{ISSUE_ID}"
```

**Dual-update:** If `{LINKED_STORY_ID}` is not null, also transition the Story to "In Development":

```
jira_get_transitions issue_key: {LINKED_STORY_ID}
jira_transition_issue issue_key: {LINKED_STORY_ID} transition_id: {ID for "In Development"}
```

Story transition failure is **non-blocking**.

### Step 4B — Project Bootstrap (Greenfield Projects)

**Purpose:** Handle greenfield scenarios where the plan calls for creating a brand-new project rather than modifying an existing one. Existing brownfield projects are already registered as submodules under `ai/submodules/`; new projects are not, so the branch-creation logic in Step 5 (which `cd`s into a project directory and runs `git checkout develop`) would fail. This step creates and registers each new project **before** Step 5 runs.

**Skip this step entirely if the plan has no Section 3A ("New Projects to Create").** Brownfield-only features go straight to Step 5.

#### 4B.1 — Detect New Projects & Confirm

Read the plan's **Section 3A — New Projects to Create**. For each entry, verify it is genuinely new (defensive re-check — the plan may be stale):

```bash
# For each new project directory NP:
test -d "${WORKSPACE_ROOT}/${NP}" && echo "EXISTS"                       # directory present?
grep -q "path = ${NP}" "${WORKSPACE_ROOT}/.gitmodules" 2>/dev/null && echo "REGISTERED"  # submodule entry?
```

Build the list of projects that truly need bootstrapping (no directory AND no `.gitmodules` entry). Present it to the user and **require explicit confirmation** before creating any remote repositories — this is a side-effecting, irreversible action:

```
=== Greenfield Project Bootstrap ===
The plan requires creating these NEW projects (repo + directory + submodule):

| # | Project Dir | GitLab Namespace | Tech Stack | New Repo URL (to create) |
|---|-------------|------------------|-----------|--------------------------|
| 1 | {NP}        | {group/subgroup} | {stack}   | https://{git-host}/{group}/{NP} |

Proceed to create these repositories on GitLab? (yes / no / edit)
```

If the user declines, STOP — do not fabricate projects or fall back to committing new code into the `ai/` repo.

> **CRITICAL — Never publish new-project code into `ai/`.** The whole point of this step is that each new project gets its **own** remote and its **own** directory. If bootstrap is skipped or fails, do NOT write the new project's source into the `ai/` repo or the workspace root. Stop and report instead.

#### 4B.2 — Load Credentials & Derive GitLab API Base

Derive the GitLab host from an existing project's remote (the `ai/` repo is always present) so new repos are created on the same instance:

```bash
GIT_PAT=$(grep GIT_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
cd "${WORKSPACE_ROOT}/ai"
REMOTE_URL=$(git remote get-url origin)
GIT_HOST=$(echo "$REMOTE_URL" | sed 's|https://\([^/]*\)/.*|\1|')
GIT_API_BASE="https://${GIT_HOST}/api/v4"
cd "${WORKSPACE_ROOT}"
```

Resolve the target namespace ID for each new project. The plan's Section 3A gives the namespace **path** (e.g. `dao/ebas/payments`); look up its numeric ID:

```bash
ENCODED_NS=$(echo "${NAMESPACE_PATH}" | sed 's|/|%2F|g')
curl -s --header "PRIVATE-TOKEN: $GIT_PAT" \
  "${GIT_API_BASE}/namespaces/${ENCODED_NS}"
# → extract "id"
```

#### 4B.3 — Create the Remote Repository (GitLab API)

For each confirmed new project, create the GitLab project via the API:

```
POST ${GIT_API_BASE}/projects
```

```json
{
  "name": "{repo-name}",
  "path": "{project-dir}",
  "namespace_id": {NAMESPACE_ID},
  "description": "{description from plan Section 3A}",
  "initialize_with_readme": false,
  "default_branch": "develop"
}
```

Send with header `PRIVATE-TOKEN: $GIT_PAT`. On success (HTTP 201), record `http_url_to_repo` and `id`.

**Error handling:**

| HTTP Status | Action |
|---|---|
| **201 Created** | Record `http_url_to_repo`. Continue. |
| **400 (path taken)** | The repo already exists remotely. Query `GET /projects/${ENCODED_NS}%2F{project-dir}`, record its URL, treat as "clone existing" in 4B.4. |
| **401 Unauthorized** | Report — GIT_PAT lacks `api` scope. STOP (cannot bootstrap). |
| **403 Forbidden** | Report — token lacks permission to create projects in `{namespace}`. Ask the user to create the repo manually and supply the URL, or choose a different namespace. |

#### 4B.4 — Create Local Directory & Initialise Git

```bash
NEW_REPO_URL="{http_url_to_repo from 4B.3}"   # e.g. https://{git-host}/{group}/{project-dir}.git

# If the remote was freshly created (empty), init locally and wire the remote.
mkdir -p "${WORKSPACE_ROOT}/${NP}"
cd "${WORKSPACE_ROOT}/${NP}"
git init
git checkout -b develop
git remote add origin "${NEW_REPO_URL}"
```

If 4B.3 reported the repo **already existed** with content, clone instead of init:

```bash
cd "${WORKSPACE_ROOT}"
git clone "${NEW_REPO_URL}" "${NP}"
cd "${WORKSPACE_ROOT}/${NP}"
git checkout develop 2>/dev/null || git checkout -b develop
```

#### 4B.5 — Scaffold Initial Project Structure

Using the **Tech Stack** and **Initial directory layout** from the plan's Section 3A (NP entry), scaffold the minimum viable project so it is a valid, buildable repo. Match the stack's conventions and the runtime/version constraints from the spec:

| Stack | Scaffold files (minimum) |
|---|---|
| Java / Maven | `pom.xml` (groupId, artifactId, packaging, Java version), `src/main/java/`, `src/test/java/` |
| Java / Gradle | `build.gradle`(`.kts`), `settings.gradle`, `src/main/java/`, `src/test/java/` |
| Node.js | `package.json` (name, version, scripts), `src/`, `tests/`, lockfile after `npm install` |
| Python | `pyproject.toml` or `requirements.txt`, `src/{package}/`, `tests/` |
| Go | `go.mod` (module path), `main.go` or package dirs |
| Rust | `Cargo.toml`, `src/` |

Always also add:
- `README.md` — project name, purpose (from Section 3A description), how to build/test
- `.gitignore` — appropriate for the stack (build output, deps, IDE files)
- Deployment artifact (Dockerfile/manifest) **only if** the plan's Section 3A marks it required

> Follow the same technology-constraint rules as brownfield code: prefer versions published ≥7 days ago, no floating/`latest` ranges. Do not scaffold beyond what the plan specifies — the actual feature implementation happens in Step 6.

#### 4B.6 — Establish the `develop` Base Branch on the Remote

A new repo has no branches to fork from, so publish an initial commit to create `develop` on the remote **before** Step 5 creates `develop-{ISSUE_ID}`:

```bash
cd "${WORKSPACE_ROOT}/${NP}"
git add -A
git commit -m "JIRA#{ISSUE_ID}; Initial project scaffold for {project-dir}"
git push -u origin develop
```

If the hosting default branch is not `develop`, also set it:

```
PUT ${GIT_API_BASE}/projects/{id}
{ "default_branch": "develop" }
```

#### 4B.7 — Register as a Submodule

Register the new project as a submodule under `ai/submodules/` so Step 5 and all downstream steps treat it exactly like an existing project:

```bash
cd "${WORKSPACE_ROOT}/ai"
git submodule add "${NEW_REPO_URL}" "submodules/${NP}"
git config -f .gitmodules submodule."submodules/${NP}".branch develop
```

Also register it in the **workspace-root** `.gitmodules` (mirrors how `create-pod-knowledge` registers projects), so the workspace root tracks it too:

```bash
cd "${WORKSPACE_ROOT}"
git config -f .gitmodules submodule."${NP}".path "${NP}"
git config -f .gitmodules submodule."${NP}".url "${NEW_REPO_URL}"
git config -f .gitmodules submodule."${NP}".branch develop
```

> If the workspace root is not a Git repo, run `git init` there first (only if `.gitmodules` registration is expected by the pod layout); otherwise register only under `ai/`.

#### 4B.8 — Bootstrap Summary

```
=== Project Bootstrap Complete ===
| Project | Remote Created | Scaffolded | develop Pushed | Submodule Registered |
|---------|----------------|------------|----------------|----------------------|
| {NP}    | ✅ / existing   | ✅          | ✅              | ✅                    |
```

All bootstrapped projects now have: a remote repo, a local directory, an initial commit on `develop`, and a `.gitmodules` entry. They are now indistinguishable from brownfield projects and flow through Step 5 normally.

---

### Step 5 — Create Feature Branches

Auto-detect impacted Git projects from the plan's "Files to Modify" **and** "New Projects to Create" (Section 3A) sections. **Always include the `ai/` repo** — it receives specs, plans, change summaries, and LEARNINGS.md updates.

**Note:** Projects are stored as git submodules under `ai/submodules/`. Any greenfield project has already been created, scaffolded, and registered by **Step 4B** — by this point it has a `develop` branch on its remote, so the logic below applies uniformly to new and existing projects.

For each impacted project (source submodules + newly bootstrapped projects + `ai/`):

1. **Pre-flight checks** — check current branch and working tree:
   - Different feature branch with dirty state → auto-commit WIP with `JIRA#{OTHER_ID}; WIP: save before switching`
   - `develop`/`main` with dirty state → ask user to stash or skip
   - Already on `develop-{ISSUE_ID}` → ask user to keep or recreate
2. **Rebase from remote** — checkout develop, pull latest, create `develop-{ISSUE_ID}`
3. **Update `.gitignore`** — ensure workspace root ignores SDLC-generated and developer-local files
4. **Verify submodule registration** — if a project was newly pulled/cloned, ensure `.gitmodules` has correct `path`, `url`, and `branch` entry
5. **Present project list** to the user for confirmation before proceeding

Submodule branch creation:

```bash
# Ensure submodules are on develop
cd ai
git submodule foreach 'git checkout develop || true'
git submodule foreach 'git pull origin develop || true'

# For each impacted submodule:
cd ai/submodules/{project-name}
git checkout develop && git pull origin develop
git checkout -b develop-{ISSUE_ID}

# For parent ai/ repo:
cd ai
git checkout develop && git pull origin develop
git checkout -b develop-{ISSUE_ID}
```

---

## Implementation Phase

### Step 6 — Execute Implementation (TDD)

Read the plan and spec in full. Follow the plan's implementation order exactly.

**Non-negotiable rules:**
- **TDD:** Write tests BEFORE implementation. Tests must compile but are expected to fail.
- **Fix implementation, not tests.** If tests fail after implementation, the implementation is wrong.
- **Do NOT modify files in the plan's "Files NOT to Modify" list.** If a change seems necessary in an excluded file, stop and ask the user.
- **Follow the plan exactly.** Do not add features, refactor unrelated code, or "improve" things not in scope.
- Compile-check after each file modification.
- Match existing code style (indentation, imports, naming, annotations, async/reactive patterns).
- Follow critical constraints from the plan (null-handling, merge semantics, event publishing, signing order).

**Execution continuity — MANDATORY:**
- **Do NOT halt, pause, or present progress summaries** at any percentage boundary (25%, 50%, 75%, or any other). Step 6 runs to 100% completion in a single uninterrupted flow.
- **Do NOT say** "You now have a solid foundation" or "you can continue building on this" or any equivalent. These messages are prohibited. Implementation is not complete until every plan item is implemented.
- **Do NOT create `change-summary.md`** during Step 6. That file is created only at Step 13, after all code is committed and pushed. If implementation is interrupted by an error, record progress in the implementation checklist in chat — not in a file.
- **Read `Delivery Scope`** from spec Section 4.0 before starting implementation. If `Delivery Scope = Full Production`:
  - Every plan item is **mandatory**. No item may be skipped, deferred, or marked "remaining work."
  - **No incomplete implementations, no skeleton code, no hollow methods.** Every integration client, service, repository, controller, and configuration must contain real, production-grade logic — not empty method bodies, hardcoded return values, or `throw new UnsupportedOperationException()` standing in for real logic. (This applies to production source code only — test doubles such as mocks, fakes, and test stubs used in test classes are expected and encouraged.)
  - Do NOT create skeleton code that merely outlines the architecture without implementing the logic. The architecture is defined in the plan — implement every component with its full business logic.
  - Do NOT present a "remaining items" menu or ask the user which items to implement next. Implement all of them.
  - If a plan item is genuinely blocked (missing dependency, auth credentials, external system unavailable), document the blocker as a `TODO` comment in code and continue with the next item — but do NOT skip the item silently or replace it with skeleton code.
- If `Delivery Scope = Proof of Concept`: simplified implementations are permitted for non-critical integrations only. Core happy-path must still be fully implemented.

**User-controlled pause (optional):**
If the implementation involves more than 10 plan items, present a single checkpoint **once** at the halfway mark:
```
=== Implementation Checkpoint ===
Progress: {N}/{N} plan items complete ({percentage}%)
Continue to completion? (yes / pause)
```
- If user says **yes** (or does not respond within the same message) → continue immediately to 100%. No further checkpoints.
- If user says **pause** → save progress state in the implementation checklist, create `change-summary.md` (Step 13) to record partial progress, and stop. User can resume by re-running `/sdd-execute {ISSUE_ID}`.
- If the implementation has 10 or fewer plan items → no checkpoint. Run to 100% without interruption.

**Production concern implementation:**
During implementation, cross-reference spec §4.0A (TRC flagged items) and §4.7 (NFRs — including Phase 1A-driven mandatory NFRs). Every resolved TRC check (✅) and every NFR that maps to code must be reflected in the implementation — not just documented in the spec. If a TRC check identified a production concern (e.g., concurrent write handling, migration reversibility, timeout alignment) and the plan includes a corresponding code change, verify that code change actually addresses the concern. If it doesn't, fix the implementation before proceeding.

**Phase 1A-aware implementation checks:**
Read the Phase 1A Software Classification from spec Section 4.0. Apply these mandatory implementation checks based on classifications:
- **Data Sensitivity = Confidential/Restricted:** Verify no PII is logged in any log statement. Verify data encryption is applied where specified in NFRs. Scan diff for hardcoded secrets/credentials.
- **Multi-tenancy = Multi-tenant:** Verify every data query includes a tenant filter. Verify no API endpoint returns data without tenant-scoped authorization.
- **AI/ML Component ≠ None:** Verify model version is parameterized (not hardcoded). Verify inference calls have timeout and fallback handling.
- **Data Volume = Large/Massive:** Verify all list endpoints use pagination. Verify bulk operations use chunked processing.

**Contract file validation tests:**
If the plan generates or modifies contract files in `ai/contracts/{ISSUE_ID}/`, write dedicated contract validation tests per `plan.md` Section 5 item 7 (schema compliance, business rules, boundaries, backward compatibility) as part of the standard unit test suite.

**Missing configuration data handling:**
Check `plan.md` Section 10 (Configuration Placeholders) first. If a new gap is discovered, follow the same protocol defined in `plan.md` Step 2D — add to Section 10, externalize (env var / config map / feature flag), add `TODO: resolve before production — see plan.md Section 10` comment, never block.

**Integration test health-check rule:**
Every integration test must verify the **application** is healthy before asserting on flow behaviour — per `plan.md` Section 5 item 8 (health check with timeout, clear error messages, skip-vs-fail distinction).

**Track progress** as each implementation item completes:

```
=== Implementation Progress ===
- [x] T-01: Write unit tests for {ServiceClass}
- [x] T-02: Implement {feature} in {ServiceClass}
- [ ] T-03: Write E2E tests
- [ ] T-04: Cross-project verification
Progress: 2/4 tasks complete (50%)
```

This checklist tracks progress within the current session. It is NOT written to any file during implementation — `change-summary.md` is created only at Step 13 after all code is committed and pushed.

**Test failure handling:**
1. Distinguish new test failures (fix implementation) from regressions (you broke something).
2. Retry up to 3 times. If still failing, stop and report: exact test, error/stack trace, what you tried, root cause hypothesis.

**Completeness gate — MANDATORY before proceeding to Step 7:**

Before declaring Step 6 complete, verify 100% implementation:

1. Read `plan.md` Section 5 (Implementation Tasks) in full.
2. For every task in the plan, verify corresponding code exists in the working tree:
   - Run `git diff --name-only develop` to get the list of changed files.
   - Cross-reference each plan task against the changed files. Every plan task must map to at least one changed file.
3. If any plan task has no corresponding code change → implement it now. Do NOT proceed.
4. Scan production source code (exclude test files) for incomplete implementations: search for `// TODO`, `throw new UnsupportedOperationException`, `NotImplementedError`, `pass  # not yet implemented`, empty method bodies, and methods that only return hardcoded/dummy values. If found under `Delivery Scope = Full Production`, replace with real implementations. (Do NOT flag test doubles in test classes — mocks, fakes, and test helpers returning controlled values are legitimate test infrastructure.)
5. Only after every plan task has corresponding code AND no incomplete implementations remain in production code → proceed to Step 7.

### Step 7 — Cross-Project Verification

Run the **full test suite** across every impacted project (not just the modified module). Use test commands from `AGENTS.md`. Execute projects sequentially.

Run lint/static analysis if configured — **warnings only, not blockers**. Run E2E tests only if the plan specifies them or the user explicitly requests them.

Produce an aggregate summary:

```
=== Cross-Project Verification ===
| # | Project         | Unit Tests | Lint | E2E  | Status |
|---|-----------------|-----------|------|------|--------|
| 1 | project-alpha   | PASS      | N/A  | SKIP | OK     |

Overall: N PASSED / N FAILED
```

**Integration / E2E tests (infrastructure-dependent):**
If the plan includes a Local Simulation Setup section, integration tests requiring live infrastructure are intentionally skipped in this step. Record them in the summary as:
```
SKIPPED — requires local simulation infrastructure (run after local sim is up)
```
Surface the exact run command so the developer or reviewer knows how to run the full 360° test:
```
Start local infrastructure: {startup command from plan's Local Simulation Setup section}
Run integration tests:      {integration test command from AGENTS.md or plan}
```

**Block on test failures.** Do NOT proceed to commit with failing tests.

### Step 8 — Self-Review & Validation

Run `git diff` and `git diff --stat` in each impacted project. Check for:
- Unintended file changes not in the plan (revert with `git checkout -- <file>`)
- Missing changes from the plan (implement them)
- No secrets, credentials, debug code, or unintended TODO markers in the diff

Cross-reference against the spec:
- **FR → code:** verify every FR is implemented with code evidence
- **AC → test:** verify every AC is satisfied with test evidence
- **NFR → code:** verify every NFR in §4.7 that implies a code-level implementation (performance, security, resilience, observability) has corresponding code evidence — not just a plan entry
- **TRC → code:** for each resolved (✅) TRC item in §4.0A that routed to a spec section (per TRC handling rules), verify the code addresses it. If a TRC check flagged a concern and the plan included a code change for it, confirm the change exists in the diff
- **Fidelity → code:** scan the generated code diff for identifiers, URLs, or config values matching RRG §Phase 1B placeholder signals (S1–S4). If generated code contains a placeholder-pattern identifier that is not a legitimate codebase name, flag: "Generated code contains identifier `{name}` which matches a placeholder pattern. Verify this is the intended production name." Exempt existing codebase names.

If any gap exists, go back and fix before proceeding.

**Mandatory artifact existence gate — verify these files actually exist before proceeding:**

1. **Integration / E2E test scripts** — the plan's Section 5 item 4 requires integration tests. Verify at least one integration test file was created (not just unit tests). If missing, write them now.
2. **Deployment artifact** — if the project produces a deployable service (not a library), verify a build/deploy definition exists (e.g., Dockerfile, Containerfile, buildpack config, deployment manifest, or equivalent for the project's deployment target). If the project had no prior deployment artifact and the plan doesn't explicitly exclude it, create one matching the spec's runtime and version constraints.
3. **Contract file** — if the plan or spec references API contracts, event schemas, or interface definitions, verify `ai/contracts/{ISSUE_ID}/` contains the contract file. If missing, create it from the spec's interface definitions.

Report:
```
=== Artifact Existence Gate ===
Integration tests:    {path(s)} ✅ / MISSING — created now ❌
Deployment artifact:  {path} ✅ / MISSING — created now ❌ / N/A (library)
Contract file:        {path} ✅ / MISSING — created now ❌ / N/A (no contracts)
```

All required items must exist before proceeding to Step 8B.

### Step 8B — Artifact Cross-Validation

**Skip if the plan has no Section 6 (Local Simulation Setup).**

After self-review, perform a mandatory cross-validation of generated infrastructure and configuration artifacts. **This is not advisory — actually read each file and verify the cross-references.**

#### 8B.1 — Credential & Connection Consistency

For **every** service listed in the plan's Credential & Connection Mapping table (Section 6):

1. **Read** the service's initialisation config as generated (init scripts, env vars, seed data, mounted config files)
2. **Read** the application's connection config for that service (connection strings, env vars, config classes, properties files)
3. **Compare field by field:**
   - Username and password match
   - Auth database/scope/namespace matches where the user was **actually created** (not just where the app assumes it is)
   - Host and port use the correct address for the plan's run mode (internal address for Mode B, host address for Mode A)
   - Protocol/auth mechanism aligns (app does not expect a secured protocol when the service is configured for no-auth, and vice-versa)

**If any mismatch:** fix immediately. Do not defer. The most common failure is: service init creates a user in a default scope, but the app's connection string references a different scope.

#### 8B.2 — Run Mode Completeness

Check which run mode(s) the plan specifies:
- **Mode A only:** verify the app's config uses host-reachable addresses for all services. The app does NOT need to be defined as a managed service.
- **Mode B only:** verify the application IS defined as a service in the local setup definition, with env vars using internal service addresses. **If the app service is missing, create it now.** Also verify: (a) a build artifact exists for the app (build definition, build script, or equivalent) matching the spec's runtime/version constraints, and (b) every service has a health/readiness check so startup ordering enforces actual readiness.
- **Both modes:** verify both env var sets exist and are correct. The app service and build artifact must be present for Mode B.

#### 8B.3 — Version Consistency

Cross-check every version-pinned dependency in generated infrastructure files (build configs, deployment manifests, CI definitions) against constraints stated in the spec:
- Runtime / language version in build files vs. spec's technology constraints
- Library / framework versions in dependency files vs. spec or `AGENTS.md`
- Service versions in local setup definitions vs. plan's Dependencies table

Flag and fix any version that contradicts the spec.

#### 8B.4 — Integration Test Completeness

Read every integration test file:
- **App health prerequisite:** test must verify the application is running and healthy before asserting on flow behaviour. If missing, add it.
- **Clear error messages:** if the app is unreachable, the test must fail with an actionable message rather than a generic timeout.
- **Skip vs fail distinction:** test should skip when infrastructure is unavailable, but fail explicitly when the app is expected but not running.

#### 8B.5 — File & Mount Integrity

1. **Dangling references** — verify that every file path referenced in test scripts, seed data configs, service mount paths, and fixture imports actually exists in the working tree. Flag any dangling reference and create the missing file or fix the reference.
2. **Mount completeness** — for every volume/file mount in the simulation definition, verify the mounted directory includes all runtime-required metadata (module init files, package descriptors, manifests). Content files alone are not enough if the runtime needs structural metadata to load them.

#### Report

```
=== Artifact Cross-Validation (Step 8B) ===
Credential consistency:   {N}/{N} services verified ✅ / Mismatches: {list} ❌
Run mode completeness:    Mode {A/B/Both} — {complete ✅ / app service missing ❌}
Version consistency:      {N}/{N} checked ✅ / Mismatches: {list} ❌
Integration test health:  App health check present ✅ / Missing ❌
File reference integrity: All referenced files exist ✅ / Dangling: {list} ❌
```

**All items must be ✅ before proceeding to Step 9.** Fix any ❌ items in-place, re-verify, then continue.

---

### Step 9 — Local Testing Checkpoint

**This is a user decision point.** After all automated tests pass, present the user with a testing summary and options before any code is committed or pushed.

```
=== Local Testing Checkpoint ===

Automated Results:
  Unit tests:      {X}/{X} passed
  E2E tests:       {X}/{X} passed (or N/A)
  Code coverage:   {percentage} (run: {coverage_command from AGENTS.md})

Local Simulation:  {Available — see plan §6 / Not applicable}
  {If available, list services/stubs from plan's Local Simulation Setup}

Options:
  1. Proceed to commit & push — I'm satisfied with automated tests
  2. I'll test locally first — pause here, I'll resume when ready
  3. Show me the coverage report
  4. Show me the local simulation setup instructions
```

**If the plan includes a "Local Simulation Setup" section:**
- Confirm Step 8B cross-validation passed with all items ✅
- Verify simulation artifacts were actually created (service definition files, stub/mock configs, seed data, test payloads, config overrides)
- If any planned artifact is missing, flag: "Plan called for {X} but it wasn't created. Create now?"
- Surface the setup and verification commands from the plan

**If user chooses option 2 (test locally):**
- Save current progress state (implementation progress checklist)
- Wait for user to return
- On resume: re-verify working tree status and re-run tests to confirm nothing changed, then continue

**If user chooses option 1 (proceed):** continue to Step 10.

---

## Commit, Push & MR Phase

### Step 10 — Commit Code

Commit in **submodule-first order:**

**10.1 — Commit in each affected submodule:**

```bash
cd ai/submodules/{project-name}
git add -A
git commit -m "JIRA#{ISSUE_ID}; <concise description of changes>"
```

**10.2 — Commit in parent ai/ repo** (includes submodule reference updates + ai/ file changes):

```bash
cd ai
git add ai/submodules/{project-name}
git add -A
git commit -m "JIRA#{ISSUE_ID}; Update submodule refs for {ISSUE_ID}: {affected-submodules}"
```

**Commit message format:** follow `AGENTS.md` (e.g. `JIRA#{ISSUE_ID}; description`). Typically enforced by Git hosting pre-receive hook.

### Step 11 — Push to Git Remotes

Push **submodules first**, then the parent repo.

**11.1 — Pre-push checks** for each repo:

| Check | Command | Verify |
|---|---|---|
| Correct branch | `git rev-parse --abbrev-ref HEAD` | Equals `develop-{ISSUE_ID}` |
| Clean tree | `git status --porcelain` | Empty |
| Commits to push | `git log origin/develop..develop-{ISSUE_ID} --oneline` | Non-empty |

Present summary to user before pushing:

| # | Project/Repo | Branch | Commits Ahead |
|---|-------------|--------|---------------|
| 1 | ai/submodules/{project} | develop-{ISSUE_ID} | N |
| N | ai (parent) | develop-{ISSUE_ID} | N |

**11.2 — Execute push:**

```bash
# Phase 1: Push submodules
cd ai/submodules/{project-name}
git push -u origin develop-{ISSUE_ID}

# Or push all submodules at once:
git submodule foreach 'git push -u origin develop-{ISSUE_ID}'

# Phase 2: Push parent
cd ai
git push -u origin develop-{ISSUE_ID}
```

**Push error handling:**

| Error | Action |
|---|---|
| Non-fast-forward / rejected | Ask user: (a) `git push --force-with-lease` or (b) `git pull --rebase` first |
| Authentication error (401/403) | Report error. Suggest checking Git credentials. Do NOT retry |
| Network error | Retry once after 5 seconds. If still failing, skip project |

**11.3 — Update submodule references in pod directory:**

If workspace root has `.gitmodules`:

**A — Update branch tracking** for every impacted project:

```bash
cd ${WORKSPACE_ROOT}
# For each impacted project directory:
git config -f .gitmodules submodule.<project-directory>.branch develop-${ISSUE_ID}
```

**B — Stage submodule pointers:**

```bash
cd ${WORKSPACE_ROOT}
git add .gitmodules
for project in <project-dir-1> <project-dir-2>; do
  git add "${project}"
done
```

**C — Commit and push:**

```bash
git commit -m "JIRA#${ISSUE_ID}; Update submodule references and branch tracking"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

> **CRITICAL CONSTRAINTS:**
> - Always update `branch=` in `.gitmodules` to the **feature branch** (`develop-{ISSUE_ID}`), never leave it as `develop` during active feature work.
> - Stage `.gitmodules` explicitly alongside submodule directory pointers — forgetting this is the most common cause of stale branch tracking.
> - After MRs merge to `develop`, the `wrap-up` skill resets `.gitmodules` branch entries to `develop`.
> - Keep workspace root `.gitignore` up to date before staging pod-root changes. Do not commit transient workspace artefacts.
> - If a workspace project was newly pulled/cloned, add its `.gitmodules` entry before updating branch tracking.
> - If workspace root is not a Git repo or has no `.gitmodules`, skip this step silently.

### Step 12 — Create Merge Requests

For each repo pushed successfully (submodules + parent ai/), create a GitLab MR.

**Always create an MR for the parent `ai/` repo** — it tracks submodule references and contains feature specs.

**12.1 — Load credentials and derive API base:**

```bash
GIT_PAT=$(grep GIT_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
REMOTE_URL=$(git remote get-url origin)
GIT_HOST=$(echo "$REMOTE_URL" | sed 's|https://\([^/]*\)/.*|\1|')
GIT_API_BASE="https://${GIT_HOST}/api/v4"
ENCODED_PATH=$(echo "$REMOTE_URL" | sed 's|https://[^/]*/||; s|\.git$||' | sed 's|/|%2F|g')
```

**12.2 — Check for existing MR:**

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests?source_branch=develop-{ISSUE_ID}&target_branch=develop&state=opened
```

If exists, **skip creation** and record `iid` + `web_url`.

**12.3 — Get JIRA summary for MR title:**

```
mcp2_jira_get_issue
  issue_key: {ISSUE_ID}
  fields: summary
```

Fallbacks: parse `specs.md` first heading, or default to `"JIRA#{ISSUE_ID}; Feature branch merge"`.

**12.4 — Create MR:**

```
POST ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests
```

```json
{
  "source_branch": "develop-{ISSUE_ID}",
  "target_branch": "develop",
  "title": "JIRA#{ISSUE_ID}; {JIRA_SUMMARY}",
  "remove_source_branch": true
}
```

**CRITICAL RULES:**
- `target_branch` MUST be `"develop"`. **NEVER** set it to `"main"` or `"master"`.
- `remove_source_branch` is `true` so the feature branch is cleaned up after merge.
- `title` MUST follow the commit/MR title format defined in `AGENTS.md`.

On success (HTTP 201), record the MR `iid` and `web_url`.

**MR creation error handling:**

| HTTP Status | Action |
|---|---|
| **401 Unauthorized** | Report. Suggest regenerating GitLab PAT. Skip project |
| **403 Forbidden** | Report. Suggest checking project access (Developer+ required). Skip project |
| **409 Conflict** | Treat as success — query existing MR for `iid` and `web_url` |

---

## Documentation & Reporting Phase

### Step 13 — Generate change-summary.md

**Timing:** This step runs ONLY after Steps 10-12 (commit, push, MR creation) are complete. Do NOT create `change-summary.md` during Step 6 (implementation) or at any partial progress point. The only exception is if the user explicitly chose "pause" at the Step 6 checkpoint — in that case, create a partial change summary noting incomplete items.

Create `ai/specs/{ISSUE_ID}/change-summary.md` with these sections:

1. **Header** — JIRA link, issue type (Feature/Defect/Task mapped from JIRA issuetype: Story/Feature/Enhancement → Feature, Bug/Defect → Defect, Task/Sub-task/Config Change → Task), branch, date
2. **Overview** — one paragraph: what was implemented, approach, key decisions
3. **Modules Affected** — project → modules table (inferred from file paths)
4. **Merge Requests** — project, MR iid, status (Created/Existing), URL. Include ai/ MR (added after Step 14)
5. **Projects Impacted** — files changed, insertions (`git diff --stat HEAD~1`), deletions, commits per project
6. **Files Modified** — per project: file name → change description
7. **Task Progress Checklist** — from implementation tracking (Step 6)
8. **Traceability Matrix** — FR/AC → plan reference → implementation (file:method) → test (testMethod) → test status
9. **Tests** — unit tests table (name, scenario, result) + E2E tests (or "No E2E tests added")
10. **Commits** — project, hash (`git log -1 --format="%h"`), message
11. **Verification** — compilation, unit tests, E2E, lint status
12. **Post-Implementation Validation** — FR pass count, AC met count, scope compliance, NFRs, DoD

### Step 14 — Commit, Push & Create MR for ai/ Repo

**14.1 — Stage and commit** all ai/ changes:
- `ai/specs/{ISSUE_ID}/specs.md`, `plan.md`, `change-summary.md`
- `ai/contracts/{ISSUE_ID}/contract.md` (**must be `.md`** — rename if `.yaml`/`.yml`)
- `ai/harness/LEARNINGS.md`

```bash
cd {WORKSPACE_ROOT}/ai
git add -A
git status
```

If contract file has wrong extension:

```bash
mv ai/contracts/{ISSUE_ID}/contract.yaml ai/contracts/{ISSUE_ID}/contract.md 2>/dev/null || true
mv ai/contracts/{ISSUE_ID}/contract.yml ai/contracts/{ISSUE_ID}/contract.md 2>/dev/null || true
git add ai/contracts/{ISSUE_ID}/contract.md
git rm --cached ai/contracts/{ISSUE_ID}/contract.yaml 2>/dev/null || true
git rm --cached ai/contracts/{ISSUE_ID}/contract.yml 2>/dev/null || true
```

Commit if there are staged changes:

```bash
git commit -m "JIRA#${ISSUE_ID}; Update feature specs, contracts and change summary"
```

**14.2 — Push:**

```bash
cd {WORKSPACE_ROOT}/ai
git push -u origin develop-{ISSUE_ID}
```

**14.3 — Create MR** for ai/ repo using the same process as Step 12. MR title: `"JIRA#{ISSUE_ID}; {JIRA_SUMMARY} — AI specs & change summary"`.

**14.4 — Update change-summary.md** with ai/ MR link, then amend and push:

```bash
cd {WORKSPACE_ROOT}/ai
git add ai/specs/${ISSUE_ID}/change-summary.md
git commit --amend --no-edit
git push --force-with-lease origin develop-{ISSUE_ID}
```

This ensures `change-summary.md` contains MR links for **all** projects including `ai/` itself.

### Step 15 — Update JIRA

Post implementation summary comment via MCP:

```
mcp2_jira_add_comment
  issue_key: {ISSUE_ID}
  body: |
    {panel:title=Implementation Complete|borderStyle=solid|borderColor=#14892c|titleBGColor=#d4f5d4|bgColor=#f5fff5}
    *Commit:* {{COMMIT_HASH}} on branch {{develop-{ISSUE_ID}}}
    
    *Merge Requests:*
    ||Project||MR||URL||
    |{project-name}|!{iid}|{web_url}|
    
    *Files Modified:*
    ||Project||File||Change||
    |{project-name}|FileName.java|Description|
    
    *Unit Tests:*
    ||Test||Scenario||Result||
    |testMethodName|What it verifies|(/) Pass|
    
    *Verification:*
    (/) Compilation clean
    (/) Unit tests: X/X passed
    (/) Full build: PASSED
    (/) MRs created targeting develop
    {panel}
```

Transition to **Ready to Deploy**:

```
jira_get_transitions → find "Ready to Deploy" (or "Ready To Deploy")
jira_transition_issue → execute with comment: "Implementation complete. MRs created and ready for deployment."
```

### Step 15A — Sync Linked Story (Dual-Update — Implementation Complete)

**Skip if `{LINKED_STORY_ID}` is null.**

Post MR summary on the linked Story:

```
jira_add_comment
  issue_key: {LINKED_STORY_ID}
  body: |
    {panel:title=Implementation Complete|borderStyle=solid|borderColor=#14892c|titleBGColor=#d4f5d4|bgColor=#f5fff5}
    Feature implementation is complete and MRs are ready for review.

    *Spec Issue:* [{ISSUE_ID}|{JIRA_BASE_URL}/browse/{ISSUE_ID}]
    *Branch:* {{develop-{ISSUE_ID}}}

    *Merge Requests:*
    ||Project||MR||URL||
    |{project-name}|!{iid}|{web_url}|

    See the Spec issue for full details.
    {panel}
```

Transition the Story to "Ready to Deploy":

```
jira_get_transitions issue_key: {LINKED_STORY_ID}
jira_transition_issue issue_key: {LINKED_STORY_ID} transition_id: {ID for "Ready to Deploy"}
```

Story updates are **non-blocking**.

**JIRA wiki markup reference:**
- `{panel}` — coloured panel with title
- `{{monospace}}` — for commit hashes, branch names
- `||header||` — table headers, `|cell|` — table cells
- `(/)` — green check, `(x)` — red X

### Step 16 — Report Results

Present a concise completion notice. Do NOT re-list files, tests, MR URLs, or verification details — these are already in `change-summary.md` and the JIRA comment.

```
=== execute Complete — {ISSUE_ID} ===

Summary:  ai/specs/{ISSUE_ID}/change-summary.md
MRs:      {N} created targeting develop
JIRA:     → Ready to Deploy

Next: Wait for code review. When comments arrive, re-run /sdd-execute {ISSUE_ID}
```

Do NOT append additional sections (file lists, test results, verification matrices). The user can read change-summary.md for full details.

---

## MR Review Fix Phase

Entered automatically when Step 1A detects open MRs with unresolved review comments.

### Step R1 — Fetch MR Discussions

For each MR, fetch discussions:

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/discussions
```

**Filter to actionable comments only.** Ignore:
- System notes (`"system": true`)
- Bot/CI notes (author `svc_prdmrvalidator` or similar)
- Already resolved discussions (`"resolved": true`)
- Informational notes ("mentioned in merge request", "assigned to", etc.)

Collect for each actionable comment: `discussion_id`, `note_id`, `author`, `body`, `type` (`DiffNote` or `DiscussionNote`), `file_path` + `line` (for `DiffNote` only).

### Step R2 — Fetch MR Diff

```
GET ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/changes
```

Returns `changes[]` with `old_path`, `new_path`, and `diff` for each file.

### Step R3 — Analyse Each Comment

For each actionable comment:

1. **DiffNote (inline):** Read the referenced file at the specified line(s). Understand surrounding context (50+ lines). Read related files if referenced.
2. **DiscussionNote (general):** Read MR description and full diff to understand scope.
3. **Consult POD knowledge** if needed (`ai/knowledge/flows/*.md`, `api-spec.md`, `specs.md`).
4. **Decide:**
   - **Accept** — valid issue, improvement, or missing case. Implement the change.
   - **Reject** — misunderstanding, already handled, or conflicts with requirements. Prepare clear reply.

### Step R4 — Update Implementation Plan

If review comments require changes that affect the implementation approach, update `ai/specs/{ISSUE_ID}/plan.md` to reflect the feedback before making code changes.

### Step R5 — Make Code Changes & Run Tests

For each accepted comment:

1. Ensure correct branch: `git checkout develop-{ISSUE_ID}`
2. Pull latest: `git pull origin develop-{ISSUE_ID}`
3. Make code changes following existing conventions. Batch related changes logically.

After all changes, build and run full unit tests. **Must pass.** If build fails, fix and re-run until it passes.

**Do not modify files unrelated to review comments.** Stay scoped.

### Step R6 — Commit & Push

```bash
git add -A
git commit -m "JIRA#${ISSUE_ID}; Fix MR review comments"
git push origin develop-{ISSUE_ID}
```

Commit message must follow `AGENTS.md` format. Do NOT add AI attribution.

### Step R7 — Reply to Comments on GitLab

**Accepted comments** — reply confirming the fix:

```
POST ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/discussions/{DISCUSSION_ID}/notes
Body: {"body": "<explanation of what was changed>"}
```

**Rejected comments** — reply with reasoning:

```
POST ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/discussions/{DISCUSSION_ID}/notes
Body: {"body": "<explanation of why not actioned>"}
```

**Resolve accepted discussions only:**

```
PUT ${GIT_API_BASE}/projects/${ENCODED_PATH}/merge_requests/{MR_IID}/discussions/{DISCUSSION_ID}
Body: {"resolved": true}
```

Do NOT resolve rejected discussions — only resolve accepted ones after replying with the fix.

### Step R8 — Summary

```
=== MR Review Fix Summary ===
Project: {project-name}
  Branch: develop-{ISSUE_ID}
  MR: !{iid}
  Comments: {N} processed — {X} accepted, {Y} rejected
  Build: PASSED
  Pushed: YES
```

User can re-run `/sdd-execute {ISSUE_ID}` for additional review rounds.

---

## Error Recovery

| Error | Recovery |
|---|---|
| **Compilation loop** | Fix and retry up to 3 times. Then STOP and report with full context. |
| **Test failure loop** | Add targeted logging. Distinguish new failures from regressions. Fix implementation, not tests. 3 retries, then STOP. |
| **Scope creep** | Changes needed in files NOT in plan → STOP and ask user. |
| **Missing dependency** | Class/method from plan doesn't exist → search codebase first, then STOP and ask. |
| **Merge conflict** | STOP and report conflicting files. Do NOT auto-resolve. |
| **Bootstrap: repo create denied (403)** | Token lacks project-create rights in the namespace. Ask user to create the repo manually and supply the URL, or pick another namespace. Never fall back to committing new-project code into `ai/`. |
| **Bootstrap: namespace not found** | Section 3A namespace path is wrong/inaccessible. STOP and ask the user for the correct GitLab group path. |
| **Bootstrap: repo path already taken** | Treat as existing — query the project, clone it, and continue (4B.4). |
| **JIRA API failure** | Non-blocking. Report but don't roll back code. |
| **Build timeout** | >10 min without progress → check for hung tests, report. |
| **Git push rejected** | Non-fast-forward: offer `--force-with-lease` or rebase. Auth error: report and skip. Network: retry once. |
| **MR creation failed** | Report. Suggest manual: `https://{git-host}/{path}/-/merge_requests/new?merge_request[source_branch]=develop-{ISSUE_ID}&merge_request[target_branch]=develop` |
| **MR comment large arch change** | Flag for human review. Reply on MR explaining it needs discussion. |

---

## GitLab API Reference

| Action | Method | Endpoint |
|---|---|---|
| Look up namespace ID | `GET` | `/namespaces/:encoded_namespace_path` |
| Create project (greenfield) | `POST` | `/projects` (body: `name`, `path`, `namespace_id`, `default_branch`) |
| Get project by path | `GET` | `/projects/:encoded_full_path` |
| Set default branch | `PUT` | `/projects/:id` (body: `default_branch`) |
| List open MRs | `GET` | `/projects/:id/merge_requests?state=opened&source_branch=:branch` |
| Create MR | `POST` | `/projects/:id/merge_requests` |
| Get MR discussions | `GET` | `/projects/:id/merge_requests/:iid/discussions` |
| Get MR changes (diff) | `GET` | `/projects/:id/merge_requests/:iid/changes` |
| Reply to discussion | `POST` | `/projects/:id/merge_requests/:iid/discussions/:discussion_id/notes` |
| Resolve discussion | `PUT` | `/projects/:id/merge_requests/:iid/discussions/:discussion_id` |

**Base URL:** Derive from project's `origin` remote (e.g. `https://{git-host}/api/v4`).
**Auth header:** `PRIVATE-TOKEN: <GIT_PAT from local.config>`
**Project ID:** URL-encoded project path, derived from `git remote get-url origin`.