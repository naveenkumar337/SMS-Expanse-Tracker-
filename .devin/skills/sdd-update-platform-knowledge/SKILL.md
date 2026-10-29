# Skill: update-platform-knowledge

> Incrementally update platform knowledge specs — reviews all unprocessed platform change specs in `ai/specs/{ISSUE_ID}/` and all new/changed files under `ai/raw/`, applies targeted edits to the knowledge base created by `sdd-create-platform-knowledge`, and publishes a _Platform-Change-Dashboard Confluence page for governance readout.

---

## Purpose

Platform knowledge is created once by `sdd-create-platform-knowledge`. Over time, platforms change. Two streams feed incremental updates into the shared `ai/knowledge/` specs:

1. **Platform change specs** — each change is captured as a structured spec by `sdd-create-platform-spec` under `ai/specs/{ISSUE_ID}/specs.md`. These contain classified change details with explicit target-spec mappings.
2. **Raw domain docs** — human-authored documents under `ai/raw/` (vendor release notes, architecture decisions, security configs, integration maps, etc.) that capture platform knowledge outside the structured change-spec workflow.

This skill is designed to be run **periodically by the platform lead** (or a designated team member) on the `develop` branch to fold both streams into the knowledge base in a single coherent update. It writes incrementally over the same files that `sdd-create-platform-knowledge` produced.

### Relationship to Other Skills

| Skill | Role |
|-------|------|
| `sdd-create-platform-knowledge` | One-time: creates `ai/knowledge/PLATFORM.md` + core & conditional specs |
| `sdd-create-platform-spec` | Per-change: converts raw change info → structured spec in `ai/specs/{ISSUE_ID}/` |
| **`sdd-update-platform-knowledge`** | **Periodic: reads specs + raw docs, incrementally updates `ai/knowledge/`** |

---

## Prerequisites

- Current branch is `develop` (not a feature branch).
- At least one of the following is true:
  - One or more platform change specs with `specs.md` in `ai/specs/{ISSUE_ID}/` that have not been integrated (no `.knowledge-integrated` marker)
  - One or more new or modified files under `ai/raw/` since the last integration run
- Platform knowledge base at `ai/knowledge/` exists (created by `sdd-create-platform-knowledge`).
- `local.config` at workspace root (for Confluence publishing, if configured).

---

## Steps

### Step 1 — Verify Branch

Confirm the current branch is `develop`:

```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "WARNING: update-platform-knowledge should be run on the develop branch (current: $CURRENT_BRANCH)"
    # Ask user to confirm before proceeding
fi
```

---

### Step 2 — Discover Unprocessed Inputs

Two independent scans run in parallel. Either or both may produce results.

#### 2A — Unprocessed platform change specs

Scan all directories under `ai/specs/`:

```bash
for dir in ai/specs/*/; do
    ISSUE_ID=$(basename "$dir")
    SPEC="$dir/specs.md"
    MARKER="$dir/.knowledge-integrated"

    if [ -f "$SPEC" ] && [ ! -f "$MARKER" ]; then
        echo "UNPROCESSED CHANGE SPEC: $ISSUE_ID"
    fi
done
```

Build a list of unprocessed change spec IDs.

#### 2B — New or changed raw docs

Track raw-doc integration state in a single log file: `ai/knowledge/.raw-integrated.log`.

Each line records one processed file:
```
<relative-path-from-ai/>    <sha256-hash>    <iso-timestamp>
```

For every file currently under `ai/raw/` (recursive, any extension):

```bash
for file in $(find ai/raw -type f ! -name '.gitkeep' ! -name 'README.md'); do
    REL=${file#ai/}                 # e.g. raw/salesforce-summer-26-release-notes.md
    CURRENT_HASH=$(sha256sum "$file" | awk '{print $1}')
    LAST_HASH=$(grep -E "^${REL}[[:space:]]" ai/knowledge/.raw-integrated.log 2>/dev/null | awk '{print $2}')

    if [ -z "$LAST_HASH" ]; then
        echo "NEW RAW DOC:     $REL"
    elif [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
        echo "CHANGED RAW DOC: $REL (was $LAST_HASH, now $CURRENT_HASH)"
    fi
done
```

Build a list of new/changed raw docs with their current hashes (needed later for Step 7B).

#### 2C — Exit early if nothing to process

If **both** lists are empty, report "All change specs and raw docs are already integrated" and exit.

---

### Step 3 — Load Input Artifacts

#### 3A — Platform change spec artifacts

For each unprocessed change spec (in chronological order based on `specs.md` modification dates):

1. Read `ai/specs/{ISSUE_ID}/specs.md` — the structured platform change spec created by `sdd-create-platform-spec`
2. Extract from Section 1 (Header): change type(s), platform, change date
3. Extract from Section 10 (Target Specs Mapping): which knowledge specs and sections to update
4. Extract from Sections 3-9: the actual change details per type

Build a consolidated summary of **platform changes** for each spec:
- Vendor release changes (new versions, deprecations)
- New/modified customizations (custom objects, fields, code, workflows)
- New/modified integrations (source, target, protocol, data)
- Data model changes (entities, fields, relationships)
- Security changes (certificates, service accounts, SSO)
- Migration notes (issues encountered, lessons learned)
- Business process changes

#### 3B — Raw doc content

For each new/changed raw doc (from Step 2B), apply the **Vendor Document Gate** before reading the full content, then classify accepted documents.

**Vendor Document Gate (pre-screen before classification)**

Before reading the full content of any new/changed raw doc, perform a **lightweight pre-screen** to reject vanilla vendor documents that contain no Dell-specific knowledge.

**Screening method:** Read only the first ~50 lines of the document (title, headers, TOC, introduction). Do NOT read the full document for this check.

**Reject if the document is a vanilla vendor document** — identified by:
- Vendor copyright/branding in the header (e.g., `"© {Vendor} Inc."`, `"{Vendor} Documentation"`, `"{Vendor} Product Guide"`)
- Generic product documentation language with no Dell context (e.g., `"This guide explains how to use {Product}..."`, `"Welcome to {Product}..."`)
- Vendor user/admin guide TOC structure (e.g., `"Getting Started"`, `"Installation Guide"`, `"Feature Overview"`, `"Administrator's Guide"`) with no Dell-specific sections
- Zero Dell footprint signals — no mention of Dell, Dell Technologies, Dell teams, Dell environments, Dell configurations, or Dell business processes in the first ~50 lines

**Accept if the document contains Dell-specific content** — identified by:
- References to Dell configurations, customizations, or business processes
- Dell team names, environment names (e.g., "Dell Prod", "Dell UAT"), project IDs
- Dell-authored content about the platform (architecture docs, runbooks, upgrade post-mortems, integration maps)
- Vendor release notes annotated with Dell impact analysis

**When rejected:**
1. Skip the document — do not classify, do not read full content, do not integrate
2. Do NOT mark it in `.raw-integrated.log` (so it can be reconsidered if later edited to add Dell context)
3. Log it in the Step 11 report under "Skipped" as: `raw/{path} — SKIPPED: Vendor document (no Dell-specific content detected)`
4. Suggest moving to `ai/raw/vendor-docs.yaml` as a URL reference for linking in `vendor-spec.md §6`

**When accepted:** Proceed to content classification below.

**Classification** uses filename hints and content analysis:

| Filename Pattern | Likely Content | Target Knowledge Spec |
|------------------|----------------|----------------------|
| `*release-notes*`, `*deprecation*`, `*roadmap*` | Vendor release info | `vendor-spec.md`, `migration-spec.md` |
| `*upgrade*`, `*migration*`, `*postmortem*` | Upgrade records | `migration-spec.md` |
| `*custom-object*`, `*apex*`, `*flow*`, `*workflow*`, `*inventory*` | Customization changes | `customization-spec.md`, `data-model-spec.md` |
| `*integration*`, `*sync*`, `*api*`, `*middleware*` | Integration docs | `integration-spec.md` |
| `*sso*`, `*certificate*`, `*cert*`, `*service-account*`, `*auth*` | Security configs | `security-spec.md` |
| `*process*`, `*approval*`, `*routing*` | Business processes | `functional-spec.md`, `process-catalog.md` |
| `*incident*`, `*troubleshoot*`, `*outage*` | Incident reports | `LEARNINGS.md`, `migration-spec.md` (lessons) |
| `*deploy*`, `*infrastructure*`, `*environment*` | Deployment changes | `deployment-spec.md` |
| `*architecture*`, `*decision*`, `*design*` | Architecture decisions | Check content: business-level → `PLATFORM.md`, technical → relevant spec |

If filename does not match any pattern, use AI content analysis to classify.

Raw docs that don't map to any knowledge spec (e.g., pure meeting minutes with no durable decisions) are noted in the Step 11 report under "Raw docs skipped".

---

### Step 4 — Update Platform Knowledge Specs

For each affected spec file, apply **targeted edits** (do NOT regenerate entire files). **Each edit may draw from both streams** — a change spec and a raw doc can both update the same section.

#### 4.0: `ai/knowledge/PLATFORM.md` (executive summary — business audience)

`PLATFORM.md` is written for **business users**. Update it only when either stream introduces changes at the **platform capability level**:

- A change adds, removes, or materially reshapes a **business capability** or **business flow**.
- A change introduces a new **business entity** (domain-level).
- A raw doc records a change in **platform scope, business sub-domain, or collaborations**.

**Strict language rules when editing PLATFORM.md:**
- Business language only in sections 1-8. No technology names, frameworks, protocols, databases.
- No vendor API names, code class names, file paths, or endpoint URLs.
- Mermaid diagrams use business-level nodes only.
- Pull wording from raw docs and functional context — not from technical specs.

Apply targeted edits only:
1. Read the current `PLATFORM.md`.
2. Update the affected section(s): Purpose, Scope, Key Business Entities, Key Flows, Collaborations, Metrics, Risks, or Glossary.
3. Keep the file within its target length (400-800 lines).
4. **Sanity-check before saving** — scan edited sections for technical keywords. If any appear outside §9, rewrite in business language or delete.
5. If no platform-level business change occurred, **skip this step silently**.

> `PLATFORM.md` is updated **first** so that subsequent spec edits can cite the refreshed executive framing.

#### 4.1: `ai/knowledge/customization-spec.md`

If any change spec includes customization changes (Section 4), **or** any raw doc describes customization updates:
1. Read the current `customization-spec.md`
2. For `[NEW]` items from the change spec — add to the appropriate section (§2 Custom Objects, §3 Custom Code, §4 Automations, §5 UI, §6 Reports)
3. For `[UPDATE]` items — find the existing entry and apply the changes
4. Update §1 Customization Overview counts
5. Update §8 Customization Dependency Map if dependencies changed
6. Cite the source (JIRA ID and/or raw doc path)

#### 4.2: `ai/knowledge/integration-spec.md`

If any change spec includes integration changes (Section 5), **or** any raw doc describes integration updates:
1. Read the current `integration-spec.md`
2. Add new integrations to the appropriate section (§3 Inbound, §4 Outbound, §5 Bidirectional, §6 Event/Message, §7 Batch/ETL)
3. Update existing integrations with changed details
4. Update §8 Integration Dependencies (certificates, middleware, service accounts)
5. Cite the source

#### 4.3: `ai/knowledge/data-model-spec.md`

If any change spec includes data model changes (Section 6), **or** any raw doc introduces entity definitions:
1. Read the current `data-model-spec.md`
2. Add new entities/fields to §1
3. Update relationships in §2 (including Mermaid erDiagram)
4. Update §4 Enums & Reference Data if picklists changed
5. Update §6 Data Classification if sensitivity levels changed

#### 4.4: `ai/knowledge/migration-spec.md`

If any change spec includes migration notes (Section 8), **or** any raw doc records upgrade history:
1. Read the current `migration-spec.md`
2. Update §1 Current State (current version, last upgrade date)
3. Append to §3 Vendor Upgrade History (new upgrade record)
4. Update §4 Upcoming Migrations (remove completed, add new)
5. Append to §6 Pre-Migration Checklist (lessons learned from this upgrade)
6. Update §7 Rollback Plan (based on recent experience)

#### 4.5: `ai/knowledge/security-spec.md`

If any change spec includes security changes (Section 7), **or** any raw doc describes security updates:
1. Read the current `security-spec.md`
2. Update §1 Authentication (SSO config changes)
3. Update §2 Authorization (role/permission changes)
4. Update §4 Service Accounts & Certificates (add new, update expiry dates, mark renewed)
5. Update §5 Compliance & Audit (new compliance controls)
6. Update §6 Security Dependencies

#### 4.6: `ai/knowledge/vendor-spec.md`

If any change spec includes vendor release impact (Section 3), **or** any raw doc contains vendor release notes:
1. Read the current `vendor-spec.md`
2. Update §1 Vendor Product Profile (current version, license tier)
3. Update §2 Vendor Module Structure (module status changes)
4. Update §5 Vendor Upgrade & Roadmap (release notes, deprecations, feature retirements)
5. Update §6 External Documentation References (new vendor doc links)

#### 4.7: `ai/knowledge/functional-spec.md` (if exists)

If any change spec includes business process impact (Section 9), **or** any raw doc describes process changes:
1. Read the current `functional-spec.md`
2. Update §3 Features & Use Cases
3. Update §4 Business Rules
4. Update §5 Functional Flows (Mermaid diagrams)

#### 4.8: `ai/knowledge/deployment-spec.md` (if exists)

If any change spec includes infrastructure changes, **or** any raw doc describes deployment updates:
1. Read the current `deployment-spec.md`
2. Update relevant sections (§1-§7 as applicable)

#### 4.9: `ai/knowledge/process-catalog.md` (if exists)

If any change affects org-wide processes managed by horizontal platforms:
1. Read the current `process-catalog.md`
2. Update §2 Process Inventory (add/modify processes)
3. Update §3 Process Details

#### 4.10: `ai/knowledge/support-log.md` (if exists)

If any change is related to support requests on horizontal platforms:
1. Read the current `support-log.md`
2. Append to §2 Support Request Log
3. Update §3 Demand Patterns if trends changed

> **Source attribution.** Whenever a change spec or raw doc drives an edit, include a trailing source reference in the affected section, e.g.
> `_Source: ISSUE_ID (integrated YYYY-MM-DD)_`
> `_Source: ai/raw/salesforce-summer-26-release-notes.md (integrated YYYY-MM-DD)_`
> This preserves the provenance chain.

---

### Step 5 — Update AGENTS.md

If any change spec or raw doc introduced changes that affect the workspace context document (`AGENTS.md` at the workspace root), update it:
- **New integrations** → Add to integration tables
- **New modules** → Add to workspace layout
- **Changed platform configuration** → Update relevant sections
- **New domain concepts** → Add to domain quick reference

Read the current `AGENTS.md`, identify sections that need updating, and apply targeted edits. Do NOT rewrite the entire file.

If no AGENTS.md changes are needed, skip this step silently.

---

### Step 6 — Update LEARNINGS.md

For each processed change spec, append a new entry to `LEARNINGS.md` at the workspace root:

```markdown
## {ISSUE_ID} — {Change Summary} ({date})

- **Platform:** {platform_name}
- **Change Type:** {change types}
- **What changed**: {1-2 sentence summary}
- **Gotchas discovered**: {issues encountered, surprising behaviors, edge cases}
- **Lessons learned**: {what to do differently next time}
```

If a raw doc captured a durable learning (e.g., vendor upgrade gotcha, integration troubleshooting tip, performance finding), also append it as:

```markdown
## RAW-{short-slug} — {Doc title} ({date})

- **Source**: `ai/raw/{path}`
- **Learning**: {concise takeaway}
```

If no meaningful learnings emerged, skip silently.

---

### Step 7 — Mark Inputs as Integrated

#### 7A — Change spec markers

For each processed change spec, create a per-directory marker file:

```bash
for ISSUE_ID in $PROCESSED_SPEC_IDS; do
    echo "integrated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "ai/specs/${ISSUE_ID}/.knowledge-integrated"
    echo "specs: ${PROCESSED_SPEC_IDS}" >> "ai/specs/${ISSUE_ID}/.knowledge-integrated"
done
```

#### 7B — Raw doc log

For each processed raw doc, upsert its entry in `ai/knowledge/.raw-integrated.log`:

```bash
mkdir -p ai/knowledge
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

for entry in $PROCESSED_RAW_DOCS; do
    REL=${entry%%::*}             # raw/salesforce-summer-26-release-notes.md
    HASH=${entry##*::}            # sha256 hash captured in Step 2B

    # Remove any existing line for this path, then append the fresh one
    grep -v -E "^${REL}[[:space:]]" ai/knowledge/.raw-integrated.log > ai/knowledge/.raw-integrated.log.tmp 2>/dev/null || true
    mv ai/knowledge/.raw-integrated.log.tmp ai/knowledge/.raw-integrated.log 2>/dev/null || true
    printf "%s\t%s\t%s\n" "$REL" "$HASH" "$TIMESTAMP" >> ai/knowledge/.raw-integrated.log
done
```

The log is append-mostly and deterministic — re-running is idempotent because hashes for unchanged files match the stored ones.

---

### Step 8 — Append Knowledge CHANGELOG Entry (MANDATORY)

**Output file:** `ai/knowledge/CHANGELOG.md`

This step is **mandatory** — always append an entry whenever this skill modifies `ai/knowledge/`, `AGENTS.md`, or `LEARNINGS.md`. Do not skip it even on tiny updates; every run must leave a trail.

**8.1 — Ensure the changelog file exists**

If `ai/knowledge/CHANGELOG.md` does not exist, create it with a standard header:

```markdown
# Knowledge Base Changelog

Audit trail of all changes to the platform knowledge base (`ai/knowledge/`).

**Convention:** Newest entries on top. Each entry records who changed what, when, why, and from which sources.

---
```

**8.2 — Resolve author identity**

```bash
AUTHOR_NAME=$(git config user.name 2>/dev/null || whoami)
AUTHOR_EMAIL=$(git config user.email 2>/dev/null || echo "unknown@local")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

**8.3 — Prepend a new entry**

Insert the following block immediately after the `---` divider at the top of the changelog (newest-on-top ordering):

```markdown
## {TIMESTAMP} — update-platform-knowledge

- **Author:** {AUTHOR_NAME} <{AUTHOR_EMAIL}>
- **Trigger:** periodic platform knowledge integration
- **Platform:** {platform_name} ({vendor} {vendor_product})
- **Change specs processed ({N_SPECS}):** {PROCESSED_IDS_CSV}
- **Raw docs processed ({N_RAW}):** {comma-separated relative paths, or "none"}
- **Specs touched:**
  - `PLATFORM.md` — {summary or "no changes"}
  - `customization-spec.md` — {N} items added/modified, or "no changes"
  - `integration-spec.md` — {N} integrations added/modified, or "no changes"
  - `data-model-spec.md` — {N} entities/fields added/modified, or "no changes"
  - `migration-spec.md` — {N} upgrade records added, or "no changes"
  - `security-spec.md` — {N} certificates/accounts updated, or "no changes"
  - `vendor-spec.md` — {summary or "no changes"}
  - `functional-spec.md` / `deployment-spec.md` / `process-catalog.md` / `support-log.md` — {as applicable}
- **AGENTS.md updated:** {yes / no}
- **LEARNINGS.md entries added:** {N}
- **Skipped:** {specs with incomplete artifacts, raw docs with no mapping}

---
```

Only list fields that apply to this run — omit rows where nothing changed to keep the log compact.

---

### Step 9 — Commit Changes

```bash
cd ai
git add -A
git diff --cached --quiet || git commit -m "JIRA#JIRA-0000; Update platform knowledge for ${N_SPECS} change spec(s) and ${N_RAW} raw doc(s): ${PROCESSED_IDS_CSV}"
```

> `JIRA-0000` is the reserved placeholder ID for operational commits that sit **outside** a single feature-delivery workflow (e.g., batch knowledge updates, scaffold bootstraps). It keeps the commit message format consistent with pre-receive hook expectations.

---

### Step 10 — Publish _Platform-Change-Dashboard Confluence Page

This step creates or updates a central Confluence page called **`_Platform-Change-Dashboard`** that provides a governance readout of all platform changes. The page is designed for platform managers, architecture governance, and domain leaders.

**This step scans ALL `ai/specs/*/` directories** — both the change specs processed in the current run and all previously integrated specs (those with a `.knowledge-integrated` marker). This ensures the Confluence page always reflects the complete change history, not just the current batch.

#### 10.1 — Read Confluence credentials

```bash
CONFLUENCE_PAT=$(grep CONFLUENCE_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
CONFLUENCE_PARENT=$(grep CONFLUENCE_PARENT "$WORKSPACE_ROOT/local.config" | cut -d= -f2-)
CONFLUENCE_BASE_URL=$(grep CONFLUENCE_BASE_URL "$WORKSPACE_ROOT/local.config" | cut -d= -f2-)
```

If `CONFLUENCE_PAT` or `CONFLUENCE_PARENT` is missing:
- Log a warning: "Confluence credentials not configured — skipping _Platform-Change-Dashboard publish."
- **Do NOT fail the skill.** The knowledge integration (Steps 1-9) is still valid without the Confluence page.
- Note the skip in the Step 11 report.

#### 10.2 — Read Platform identity

```bash
PLATFORM_NAME=$(grep "^name:" ai/knowledge/PLATFORM.md | head -1 | cut -d'"' -f2)
VENDOR=$(grep "^vendor:" ai/knowledge/PLATFORM.md | head -1 | cut -d'"' -f2)
ORIENTATION=$(grep "^orientation:" ai/knowledge/PLATFORM.md | head -1 | cut -d'"' -f2)
```

#### 10.3 — Collect change data from ALL integrated specs

Scan every directory under `ai/specs/*/`. A spec counts as "integrated" if it has a `.knowledge-integrated` marker **or** was just processed in the current run.

For each integrated spec, extract:

| Field | Source | Fallback |
|-------|--------|----------|
| **ISSUE_ID** | Directory name (`ai/specs/{ISSUE_ID}/`) | — |
| **Change Summary** | Section 2 from `ai/specs/{ISSUE_ID}/specs.md` | ISSUE_ID |
| **Change Type(s)** | Section 1 (Header) from `ai/specs/{ISSUE_ID}/specs.md` | "general" |
| **Author** | `git log --format='%an' -1 -- ai/specs/{ISSUE_ID}/specs.md` | git config user.name |
| **Change Date** | Section 1 `Change Date` field | File modification date of `.knowledge-integrated` |
| **Week & Year** | Derived from Change Date: `{YYYY} W{ISO_WEEK}` | — |

#### 10.4 — Compute summary tables

From the collected data, compute three views:

**View 1 — Changes by Type (bar chart):**

| Change Type | Count |
|-------------|-------|
| vendor-upgrade | {count} |
| customization | {count} |
| integration | {count} |
| security | {count} |

**View 2 — Change Trend by Week (line chart):**

| Week & Year | Changes |
|-------------|---------|
| 2026 W30 | {count} |
| 2026 W31 | {count} |

**View 3 — Full Change Log (all specs, sorted by date descending):**

| # | Platform | Author | JIRA ID | Change Type | Change Summary | Date |
|---|----------|--------|---------|-------------|----------------|------|
| 1 | {name} | {author} | [{ID}]({url}) | {type} | {summary} | {date} |

#### 10.5 — Build page content

Compose the page body in **Confluence Storage Format** (XHTML). The page title is:

```
_Platform-Change-Dashboard
```

The page must contain these sections in order:

1. **Info banner** — Platform name, vendor, orientation, total changes tracked, last updated
2. **Changes by Type** — Bar chart + summary table
3. **Change Trend by Week** — Line chart + summary table
4. **Full Change Log** — Table with all integrated specs (JIRA links, change type, summary, date)
5. **Footer note** — Auto-maintained by `sdd-update-platform-knowledge`

**Charts use the Confluence `chart` macro** (built into Confluence Server / Data Center). The macro reads the HTML table inside its `<ac:rich-text-body>` and renders it as a bar or line chart. No external plugins required.

#### 10.6 — Create or update the Confluence page

**Parse parent page URL:**

```bash
SPACE_KEY=$(echo "$CONFLUENCE_PARENT" | grep -oP '/spaces/\K[^/]+')
PARENT_PAGE_ID=$(echo "$CONFLUENCE_PARENT" | grep -oP '/pages/\K[0-9]+')
```

**Check if the page already exists** under the parent. If yes, update it (increment version). If no, create it.

**Error handling:**
- If the Confluence API returns a non-2xx status, log a warning and skip — do NOT fail the skill.
- Record success or failure in the Step 11 report.

---

### Step 11 — Report Results

```
=== Platform Knowledge Integration Report ===

Platform: {platform_name} ({vendor} {vendor_product})

Change specs processed: {N_SPECS}
  1. {ISSUE_ID-1} — {change type(s)} — {summary of changes integrated}
  2. {ISSUE_ID-2} — {change type(s)} — {summary of changes integrated}

Raw docs processed: {N_RAW}
  1. raw/{path-1} — {new|changed} — {summary of content integrated}
  2. raw/{path-2} — {new|changed} — {summary of content integrated}

Specs updated:
  - PLATFORM.md: {summary or "no changes"}
  - customization-spec.md: {N} items added/modified
  - integration-spec.md: {N} integrations added/modified
  - data-model-spec.md: {N} entities/fields added/modified
  - migration-spec.md: {N} upgrade records added
  - security-spec.md: {N} certificates/accounts updated
  - vendor-spec.md: {summary or "no changes"}
  - functional-spec.md: {summary or "no changes" or "N/A"}
  - deployment-spec.md: {summary or "no changes" or "N/A"}
  - process-catalog.md: {summary or "no changes" or "N/A"}
  - support-log.md: {summary or "no changes" or "N/A"}
  - AGENTS.md: {changes or "no changes"}
  - LEARNINGS.md: {N} entries added

Skipped:
  - Specs with incomplete artifacts: {ISSUE_ID-X: missing target mapping}
  - Raw docs with no knowledge-spec mapping: {raw/meeting-notes-2026-08-12.md}

Commit: {hash} — JIRA#JIRA-0000; Update platform knowledge for {N_SPECS} change spec(s) and {N_RAW} raw doc(s)

Confluence _Platform-Change-Dashboard:
  Status: {PUBLISHED — {page_url} | UPDATED — {page_url} | SKIPPED — {reason}}
  Total changes tracked: {TOTAL_COUNT}
```

---

## Important Rules

1. **Run on develop only.** This skill modifies shared knowledge base files. Running on a feature branch defeats the purpose.
2. **Two input streams.** Always scan both `ai/specs/*/` (change specs) and `ai/raw/**` (human-authored docs). Either stream alone may trigger a run.
3. **`CHANGELOG.md` is mandatory.** Every run must append an entry to `ai/knowledge/CHANGELOG.md` before committing (Step 8). Never skip it — the changelog is the provenance spine of the knowledge base.
4. **Targeted edits only.** Never regenerate entire spec files — only update sections affected by the processed change specs or raw docs.
5. **Preserve structure.** Maintain existing headings, tables, and formatting in all spec files.
6. **Source attribution.** When a change spec or raw doc drives a knowledge-spec edit, cite the JIRA ID or raw file path inline so provenance is preserved.
7. **Idempotent.** The per-spec `.knowledge-integrated` marker and the `ai/knowledge/.raw-integrated.log` hash log together prevent re-processing. Safe to re-run.
8. **Skip incomplete inputs.** If a change spec lacks Section 10 (Target Specs Mapping) or has no actionable changes, or a raw doc has no knowledge-spec mapping, log a warning in the report and skip it (do not mark as integrated, so it can be revisited).
9. **Chronological order.** Process change specs oldest-first; process raw docs in lexical path order. Raw docs are applied **after** change specs so that manually curated corrections override auto-inferred content.
10. **Confluence _Platform-Change-Dashboard is best-effort.** If Confluence credentials are missing or the API is unreachable, log a warning and continue — never fail the knowledge integration because of a Confluence issue. The page uses **all** integrated specs (not just the current batch) so it is always a complete snapshot.
11. **Conditional specs.** Only attempt to update conditional spec files (`functional-spec.md`, `deployment-spec.md`, `vendor-spec.md`, `process-catalog.md`, `support-log.md`) if they exist in `ai/knowledge/`. If a change targets a conditional spec that does not exist, log a warning — do not create it (that is the responsibility of `sdd-create-platform-knowledge`).
12. **PLATFORM.md business language.** Sections 1-8 of `PLATFORM.md` must contain zero technology mentions. Before saving, scan edited sections for technical keywords and rewrite any violations.
13. **Vendor Document Gate.** Every raw doc must pass a lightweight pre-screen (first ~50 lines) before full analysis. Vanilla vendor documents — product manuals, admin guides, API references — that contain no Dell-specific content must be rejected at intake. Do not mark rejected docs in `.raw-integrated.log` so they can be reconsidered if later edited to include Dell context. Log all rejections in the Step 11 report under "Skipped".

---

## When to Run

| Trigger | Frequency |
|---------|-----------|
| After a vendor upgrade completes | Post-upgrade |
| After a batch of Dell customizations are deployed | Ad-hoc |
| After integration changes are implemented | Ad-hoc |
| After security changes (certificate renewals, SSO updates) | Ad-hoc |
| After new raw docs are added to `ai/raw/` | Ad-hoc |
| As part of periodic platform governance review | Quarterly |
| Before starting a major platform change | To ensure specs are current |
