# Skill: update-knowledge

> Batch-integrate delivered features **and raw domain docs** into knowledge specs — reviews all unprocessed JIRA IDs and all new/changed files under `ai/raw/`, updates the shared knowledge base periodically, and publishes a _Spec-Delivery-Summary Confluence page for executive readout.

---

## Purpose

Two streams feed the shared `ai/knowledge/` specs:

1. **Delivered features** — each feature's `/sdd-execute` step generates a `change-summary.md`; the `/sdd-wrap-up` step handles branch cleanup, Confluence publishing, and JIRA closure. The shared `ai/knowledge/` specs are **not** updated per-feature to avoid merge conflicts when multiple developers work on different feature branches concurrently.
2. **Raw domain docs** — human-authored documents under `ai/raw/` (architecture decisions, vendor specs, onboarding notes, regulatory requirements, meeting minutes, etc.) that capture domain knowledge outside the feature-delivery workflow. These are added or revised continuously by humans.

This skill is designed to be run **periodically by the POD lead** (or a designated team member) on the `develop` branch to fold both streams into the knowledge base in a single coherent update.

---

## Prerequisites

- Current branch is `develop` (not a feature branch)
- At least one of the following is true:
  - One or more delivered features with `change-summary.md` in `ai/specs/{ISSUE_ID}/`
  - One or more new or modified files under `ai/raw/` since the last integration run
- POD knowledge base at `ai/knowledge/` exists
- `local.config` at workspace root (for JIRA API access if needed to fetch additional context)

---

## Skill Steps

### Step 1 — Verify Branch

Confirm the current branch is `develop`:

```bash
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "WARNING: update-knowledge should be run on the develop branch (current: $CURRENT_BRANCH)"
    # Ask user to confirm before proceeding
fi
```

---

### Step 2 — Discover Unprocessed Inputs

Two independent scans run in parallel. Either or both may produce results.

#### 2A — Unprocessed feature specs

Scan all feature directories under `ai/specs/`:

```bash
for dir in ai/specs/*/; do
    ISSUE_ID=$(basename "$dir")
    CHANGE_SUMMARY="$dir/change-summary.md"
    MARKER="$dir/.knowledge-integrated"

    if [ -f "$CHANGE_SUMMARY" ] && [ ! -f "$MARKER" ]; then
        echo "UNPROCESSED FEATURE: $ISSUE_ID"
    fi
done
```

Build a list of unprocessed feature IDs.

#### 2B — New or changed raw docs

Track raw-doc integration state in a single log file: `ai/knowledge/.raw-integrated.log`.

Each line records one processed file:
```
<relative-path-from-ai/>    <sha256-hash>    <iso-timestamp>
```

For every file currently under `ai/raw/` (recursive, any extension: `.md`, `.txt`, `.pdf`, `.docx`, etc.):

```bash
for file in $(find ai/raw -type f ! -name '.gitkeep'); do
    REL=${file#ai/}                 # e.g. raw/architecture/decision-042.md
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

If **both** lists are empty, report "All features and raw docs are already integrated" and exit.

---

### Step 3 — Load Input Artifacts

#### 3A — Feature artifacts

For each unprocessed feature (in chronological order based on `change-summary.md` modification dates):

1. Read `ai/specs/{ISSUE_ID}/specs.md` — extract functional requirements, acceptance criteria, impacted areas
2. Read `ai/specs/{ISSUE_ID}/plan.md` — extract files modified, design decisions, API changes
3. Read `ai/specs/{ISSUE_ID}/change-summary.md` — extract per-project changes, modules affected, functional summary, traceability matrix

Build a consolidated summary of **functional changes** for each feature:
- New/modified API endpoints
- New/modified data model fields, collections, indexes
- New/modified business rules and use cases
- Architecture or infrastructure changes
- New/modified process flows

#### 3B — Raw doc content

For each new/changed raw doc (from Step 2B), read the file and classify its content. A single doc may contribute to multiple specs:

| Content type | Target knowledge spec |
|--------------|-----------------------|
| POD purpose, business capabilities, business entities, primary business flows, business counterparts (executive-level, **business language only**) | `POD.md` |
| Architecture decisions, system design, component responsibilities | `technical-spec.md` |
| Data entities, schemas, ER diagrams, field definitions | `data-model-spec.md` |
| API contracts, endpoint definitions, integration protocols | `api-spec.md` |
| Business rules, use cases, user journeys, feature descriptions | `functional-spec.md` |
| Process/sequence flows (happy path, error path, batch) | `flows/*.md` |
| Non-functional requirements (SLAs, throughput, latency) | `nfr-spec.md` |
| Security, auth, data classification, compliance | `security-spec.md` |
| Deployment topology, environments, infra | `deployment-spec.md` |
| Internal integrations (between POD projects) and external interfaces | `integration-spec.md` |

Raw docs that don't map to any spec (e.g. pure meeting minutes with no durable decisions) are noted in the Step 11 report under "Raw docs skipped".

---

### Step 4 — Update Knowledge Specs

For each affected spec file, apply **targeted edits** (do NOT regenerate entire files). **Each edit may draw from both streams** — a feature change and a raw doc can both update the same section.

#### 4.0: `ai/knowledge/POD.md` (executive POD summary — business audience)

`POD.md` is the 10–15 minute read written for **business users** (product managers, domain experts, stakeholders, executives). Update it when either stream introduces changes at the **POD capability level**:

- A delivered feature adds, removes, or materially reshapes a **business capability** or **business flow** described in the POD summary.
- A delivered feature introduces a new **business entity** (domain-level — not just a DB field).
- A raw doc records a change in **POD scope, sub-domain ownership, external business counterparts, or primary business flows**.

**Strict language rules when editing POD.md:** Apply the business-language-only rules and sanity-check from `/sdd-create-pod-knowledge` Step 15 (no technology names, no project/repo/class/method names, Mermaid diagrams use business-level nodes only, pull wording from `ai/raw/` and functional spec — not from technical specs).

Apply targeted edits only — `POD.md` is a synthesis, not a detail sheet:
1. Read the current `POD.md`.
2. Update the affected section(s): Purpose, Sub-domain & Scope, Business Capabilities, Business Entities, Business Flows, Business Interactions, Key Business Rules, or Glossary.
3. Keep the file within its target length (400–800 lines). If an update pushes it over budget, trim detail and push it into the appropriate detailed spec in §4.1–4.9.
4. Cross-reference the detail spec (e.g. `See functional-spec.md §3.4 for the full use case`) rather than duplicating content.
5. If no POD-level business change occurred, **skip this step silently** — most feature-only updates will not touch `POD.md`.

> `POD.md` is updated **first** so that §4.1–§4.9 edits can cite the refreshed executive framing, and so that any new business capability named in `POD.md` is guaranteed to appear in the detailed specs below.

#### 4.1: `ai/knowledge/api-spec.md`

If any feature introduced new or modified API endpoints, **or** any raw doc defined API contracts:
1. Read the current api-spec.md
2. Find the section(s) for the affected endpoint(s)
3. Add new endpoints or update existing ones — cite the source (JIRA ID and/or raw doc path)
4. Preserve the existing document structure

#### 4.2: `ai/knowledge/data-model-spec.md`

If any feature changed the data model, **or** any raw doc introduced/revised entity definitions:
1. Read the current data-model-spec.md
2. Add new collections/fields or update existing ones
3. Update index definitions if changed

#### 4.3: `ai/knowledge/functional-spec.md`

If any feature introduced new business rules or modified existing ones, **or** any raw doc captured new use cases:
1. Read the current functional-spec.md
2. Add new use cases or update existing feature descriptions
3. Update business rule references

#### 4.4: `ai/knowledge/technical-spec.md`

If any feature changed the architecture, **or** any raw doc recorded an architecture decision:
1. Read the current technical-spec.md
2. Update module descriptions, dependency diagrams, or infrastructure notes

#### 4.5: `ai/knowledge/flows/*.md`

If any feature introduced or modified process flows, **or** any raw doc described a flow:
1. Read existing flow diagrams
2. Update Mermaid diagrams to reflect new or changed flows
3. Create new flow files if a completely new process was introduced

#### 4.6: Other knowledge specs (raw-doc driven)

Raw docs may also update `nfr-spec.md`, `security-spec.md`, `deployment-spec.md`, and `integration-spec.md`. Apply the same targeted-edit pattern: read current content, merge new facts, preserve structure.

> **For `integration-spec.md`:** preserve its two top-level groups — **Internal Integrations** (interactions between git repos *inside* the POD workspace) and **External Interfaces** (anything crossing the POD workspace boundary, inbound or outbound). When classifying a new integration, apply this rule: if both endpoints are owned by this POD (i.e. both repos are listed in `AGENTS.md` project summaries), it is Internal; otherwise it is External.

> **Source attribution.** Whenever a raw doc drives an edit, include a trailing source reference in the affected section, e.g.
> `_Source: ai/raw/architecture/decision-042.md (integrated YYYY-MM-DD)_`
> This preserves the provenance chain from human input → knowledge spec.

---

### Step 5 — Update AGENTS.md

If any delivered feature or raw doc introduced changes that affect the workspace context document (`AGENTS.md` at the workspace root), update it:
- **New API endpoints** → Add to the relevant API/endpoint tables
- **New configuration options** → Add to the configuration section
- **New modules or projects** → Add to the workspace layout and project summaries
- **Changed build/test commands** → Update the build & test section
- **New domain concepts** → Add to the domain quick reference

Read the current `AGENTS.md`, identify sections that need updating, and apply targeted edits. Do NOT rewrite the entire file.

If no AGENTS.md changes are needed, skip this step silently.

---

### Step 6 — Update LEARNINGS.md

For each processed feature, append a new entry to `LEARNINGS.md` at the workspace root:

```markdown
## {ISSUE_ID} — {Feature Title} ({date})

- **What was implemented**: {1-2 sentence summary}
- **Key patterns used**: {any new patterns, libraries, or approaches introduced}
- **Gotchas discovered**: {any surprising behaviors, edge cases, or workarounds found during implementation}
- **Testing notes**: {any notable test strategies or test infrastructure changes}
```

If a raw doc captured a durable learning (e.g. a tricky integration gotcha, a performance finding), also append it as:

```markdown
## RAW-{short-slug} — {Doc title} ({date})

- **Source**: `ai/raw/{path}`
- **Learning**: {concise takeaway}
```

If no meaningful learnings emerged, skip silently.

---

### Step 7 — Mark Inputs as Integrated

#### 7A — Feature markers

For each processed feature, create a per-directory marker file:

```bash
for ISSUE_ID in $PROCESSED_FEATURE_IDS; do
    echo "integrated: $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "ai/specs/${ISSUE_ID}/.knowledge-integrated"
    echo "features: ${PROCESSED_FEATURE_IDS}" >> "ai/specs/${ISSUE_ID}/.knowledge-integrated"
done
```

#### 7B — Raw doc log

For each processed raw doc, upsert its entry in `ai/knowledge/.raw-integrated.log`:

```bash
mkdir -p ai/knowledge
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

for entry in $PROCESSED_RAW_DOCS; do
    REL=${entry%%::*}             # raw/architecture/decision-042.md
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

Append an audit entry describing this run. The changelog is shared with `/sdd-create-pod-knowledge` and is **deliberately excluded** from AGENTS.md and from feature-spec lifecycle skills (`sdd-create-specs`, `sdd-create-plan`, `sdd-execute`, `sdd-wrap-up`) — it exists purely for provenance.

**8.1 — Ensure the changelog file exists**

If `ai/knowledge/CHANGELOG.md` does not exist, create it with the header defined in `/sdd-create-pod-knowledge` Step 16.1.

**8.2 — Resolve author identity**

```bash
AUTHOR_NAME=$(git config user.name 2>/dev/null || whoami)
AUTHOR_EMAIL=$(git config user.email 2>/dev/null || echo "unknown@local")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

**8.3 — Prepend a new entry**

Insert the following block immediately after the `---` divider at the top of the changelog (newest-on-top ordering):

```markdown
## {TIMESTAMP} — update-knowledge

- **Author:** {AUTHOR_NAME} <{AUTHOR_EMAIL}>
- **Trigger:** periodic knowledge integration
- **Features processed ({N_FEATURES}):** {PROCESSED_IDS_CSV}
- **Raw docs processed ({N_RAW}):** {comma-separated relative paths, or "none"}
- **Specs touched:**
  - `POD.md` — {summary or "no changes"}
  - `api-spec.md` — {N} endpoints added/modified, or "no changes"
  - `data-model-spec.md` — {N} fields added/modified, or "no changes"
  - `functional-spec.md` — {N} use cases added/modified, or "no changes"
  - `technical-spec.md` — {summary or "no changes"}
  - `flows/*.md` — {N} diagrams added/modified, or "no changes"
  - `nfr-spec.md` / `security-spec.md` / `deployment-spec.md` / `integration-spec.md` — {as applicable}
- **AGENTS.md updated:** {yes / no}
- **LEARNINGS.md entries added:** {N}
- **Skipped:** {features with incomplete artifacts, raw docs with no mapping}

---
```

Only list fields that apply to this run — omit rows where nothing changed to keep the log compact.

---

### Step 9 — Commit Changes

```bash
cd ai
git add -A
git diff --cached --quiet || git commit -m "JIRA#JIRA-0000; Update knowledge for ${N_FEATURES} feature(s) and ${N_RAW} raw doc(s): ${PROCESSED_IDS_CSV}"
```

> `JIRA-0000` is the reserved placeholder ID for operational commits that sit **outside** a single feature-delivery workflow (e.g. batch knowledge updates, scaffold bootstraps). It keeps the commit message format consistent with pre-receive hook expectations.


---

### Step 10 — Publish _Spec-Delivery-Summary Confluence Page

This step creates or updates a central Confluence page called **`_Spec-Delivery-Summary`** that provides an executive readout of all spec deliveries across the POD. The page is designed for POD Group managers and Domain leaders.

**This step scans ALL `ai/specs/*/` directories** — both the features processed in the current run and all previously integrated features (those with a `.knowledge-integrated` marker). This ensures the Confluence page always reflects the complete delivery history, not just the current batch.

#### 10.1 — Read Confluence credentials

```bash
CONFLUENCE_PAT=$(grep CONFLUENCE_PAT "$WORKSPACE_ROOT/local.config" | cut -d= -f2)
CONFLUENCE_PARENT=$(grep CONFLUENCE_PARENT "$WORKSPACE_ROOT/local.config" | cut -d= -f2-)
CONFLUENCE_BASE_URL=$(grep CONFLUENCE_BASE_URL "$WORKSPACE_ROOT/local.config" | cut -d= -f2-)
```

If `CONFLUENCE_PAT` or `CONFLUENCE_PARENT` is missing, log a warning and skip Confluence publishing (see Important Rule #10). Note the skip in the Step 11 report.

#### 10.2 — Read POD identity

```bash
POD_NAMESPACE=$(grep "POD Namespace:" ai/pod-info.md | cut -d: -f2- | xargs)
DOMAIN=$(grep "Domain:" ai/pod-info.md | cut -d: -f2- | xargs)
POD_GROUP=$(grep "POD Group:" ai/pod-info.md | cut -d: -f2- | xargs)
POD_NAME=$(grep "POD Name:" ai/pod-info.md | cut -d: -f2- | xargs)
```

#### 10.3 — Collect delivery data from ALL integrated specs

Scan every directory under `ai/specs/*/`. A spec counts as "delivered" if it has a `.knowledge-integrated` marker **or** was just processed in the current run (Step 7A created the marker).

For each delivered spec, extract:

| Field | Source | Fallback |
|-------|--------|----------|
| **ISSUE_ID** | Directory name (`ai/specs/{ISSUE_ID}/`) | — |
| **Spec Name** | First `#` heading from `ai/specs/{ISSUE_ID}/specs.md` | ISSUE_ID |
| **POD Developer** | `git log --format='%an' -1 -- ai/specs/{ISSUE_ID}/change-summary.md` | `Captured By` from `ai/pod-info.md` |
| **Delivered Date** | `Generated:` field in `ai/specs/{ISSUE_ID}/change-summary.md` (format `YYYY-MM-DD`) | File modification date of `.knowledge-integrated` |
| **Week & Year** | Derived from Delivered Date: `{YYYY} W{ISO_WEEK}` (e.g. `2026 W17`) | — |

```bash
DELIVERY_DATA=()
for dir in ai/specs/*/; do
    ISSUE_ID=$(basename "$dir")
    MARKER="$dir/.knowledge-integrated"
    CHANGE_SUMMARY="$dir/change-summary.md"

    # Only include specs that have been integrated (marker exists or was just created)
    if [ ! -f "$MARKER" ]; then
        continue
    fi

    # Extract spec name
    SPEC_NAME=$(head -5 "$dir/specs.md" 2>/dev/null | grep -m1 '^#' | sed 's/^#\+\s*//')
    [ -z "$SPEC_NAME" ] && SPEC_NAME="$ISSUE_ID"

    # Extract developer (git author of change-summary.md)
    DEVELOPER=$(git log --format='%an' -1 -- "$CHANGE_SUMMARY" 2>/dev/null)
    [ -z "$DEVELOPER" ] && DEVELOPER=$(grep "Captured By:" ai/pod-info.md | cut -d: -f2- | xargs)

    # Extract delivered date
    DELIVERED_DATE=$(grep -m1 'Generated:' "$CHANGE_SUMMARY" 2>/dev/null | grep -oP '\d{4}-\d{2}-\d{2}')
    [ -z "$DELIVERED_DATE" ] && DELIVERED_DATE=$(date -r "$MARKER" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)

    # Derive week & year (ISO week)
    WEEK_YEAR=$(date -d "$DELIVERED_DATE" +"%G W%V" 2>/dev/null)

    DELIVERY_DATA+=("$ISSUE_ID|$SPEC_NAME|$DEVELOPER|$DELIVERED_DATE|$WEEK_YEAR")
done
```

#### 10.4 — Compute summary tables

From the collected delivery data, compute three views:

**View 1 — Specs delivered per POD Developer:**

| POD Name | POD Developer | Specs Delivered |
|----------|---------------|-----------------|
| {POD_NAME} | {Developer A} | {count} |
| {POD_NAME} | {Developer B} | {count} |

**View 2 — Specs delivered per Week & Year:**

| POD Name | Week & Year | Specs Delivered |
|----------|-------------|-----------------|
| {POD_NAME} | 2026 W14 | {count} |
| {POD_NAME} | 2026 W15 | {count} |
| {POD_NAME} | 2026 W16 | {count} |

**View 3 — Full delivery log (all features, sorted by date descending):**

| # | POD Name | POD Developer | JIRA ID | Spec Name | Delivered Date |
|---|----------|---------------|---------|-----------|----------------|
| 1 | {POD_NAME} | {Developer A} | [{ISSUE_ID}]({JIRA_BASE_URL}/browse/{ISSUE_ID}) | {Spec Name} | {YYYY-MM-DD} |

#### 10.5 — Build page content

Compose the page body in **Confluence Storage Format** (XHTML). The page title is:

```
_Spec-Delivery-Summary
```

> The leading underscore (`_`) keeps it visually distinct and sorts it to the top of child pages under the parent.

The page must contain these sections in order:

```xml
<h1>Spec Delivery Summary</h1>

<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p>Auto-generated by the <code>/sdd-update-knowledge</code> skill. Last updated: {TIMESTAMP}.</p>
    <p><strong>POD:</strong> {POD_NAME} &nbsp;|&nbsp; <strong>POD Group:</strong> {POD_GROUP} &nbsp;|&nbsp; <strong>Domain:</strong> {DOMAIN}</p>
    <p><strong>Total specs delivered:</strong> {TOTAL_COUNT}</p>
  </ac:rich-text-body>
</ac:structured-macro>

<!-- ── Section 1: Delivery by Developer (bar chart) ── -->

<h2>Delivery by Developer</h2>

<ac:structured-macro ac:name="chart">
  <ac:parameter ac:name="type">bar</ac:parameter>
  <ac:parameter ac:name="title">Specs Delivered per Developer</ac:parameter>
  <ac:parameter ac:name="width">600</ac:parameter>
  <ac:parameter ac:name="colors">#0747A6,#00875A,#FF991F,#DE350B,#6554C0,#00B8D9</ac:parameter>
  <ac:rich-text-body>
    <table>
      <tr><th>Developer</th><th>Specs Delivered</th></tr>
      {FOR_EACH_DEVELOPER}
      <tr><td>{Developer Name}</td><td>{count}</td></tr>
      {END_FOR_EACH}
    </table>
  </ac:rich-text-body>
</ac:structured-macro>

<table>
  <tr><th>POD Name</th><th>POD Developer</th><th>Specs Delivered</th></tr>
  {FOR_EACH_DEVELOPER}
  <tr><td>{POD_NAME}</td><td>{Developer Name}</td><td>{count}</td></tr>
  {END_FOR_EACH}
</table>

<!-- ── Section 2: Delivery Trend by Week (line chart) ── -->

<h2>Delivery Trend by Week</h2>

<ac:structured-macro ac:name="chart">
  <ac:parameter ac:name="type">line</ac:parameter>
  <ac:parameter ac:name="title">Specs Delivered per Week</ac:parameter>
  <ac:parameter ac:name="width">700</ac:parameter>
  <ac:parameter ac:name="colors">#0747A6</ac:parameter>
  <ac:rich-text-body>
    <table>
      <tr><th>Week</th><th>Specs Delivered</th></tr>
      {FOR_EACH_WEEK_CHRONOLOGICAL}
      <tr><td>{YYYY WNN}</td><td>{count}</td></tr>
      {END_FOR_EACH}
    </table>
  </ac:rich-text-body>
</ac:structured-macro>

<table>
  <tr><th>POD Name</th><th>Week &amp; Year</th><th>Specs Delivered</th></tr>
  {FOR_EACH_WEEK_CHRONOLOGICAL}
  <tr><td>{POD_NAME}</td><td>{YYYY WNN}</td><td>{count}</td></tr>
  {END_FOR_EACH}
</table>

<!-- ── Section 3: Full Delivery Log ── -->

<h2>Delivery Log</h2>

<table>
  <tr>
    <th>#</th>
    <th>POD Name</th>
    <th>POD Developer</th>
    <th>JIRA ID</th>
    <th>Spec Name</th>
    <th>Delivered Date</th>
  </tr>
  {FOR_EACH_DELIVERED_SPEC_DESCENDING_BY_DATE}
  <tr>
    <td>{row_number}</td>
    <td>{POD_NAME}</td>
    <td>{Developer}</td>
    <td><a href="{JIRA_BASE_URL}/browse/{ISSUE_ID}">{ISSUE_ID}</a></td>
    <td>{Spec Name}</td>
    <td>{YYYY-MM-DD}</td>
  </tr>
  {END_FOR_EACH}
</table>

<!-- ── Footer ── -->

<ac:structured-macro ac:name="note">
  <ac:rich-text-body>
    <p>This page is auto-maintained by the <code>/sdd-update-knowledge</code> skill. Manual edits will be overwritten on the next run.</p>
  </ac:rich-text-body>
</ac:structured-macro>
```

**Charts use the Confluence `chart` macro** (built into Confluence Server / Data Center). The macro reads the HTML table inside its `<ac:rich-text-body>` and renders it as a bar or line chart. No external plugins required.

#### 10.6 — Create or update the Confluence page

**Parse parent page URL:**

```bash
SPACE_KEY=$(echo "$CONFLUENCE_PARENT" | grep -oP '/spaces/\K[^/]+')
PARENT_PAGE_ID=$(echo "$CONFLUENCE_PARENT" | grep -oP '/pages/\K[0-9]+')
```

**Check if the page already exists** under the parent:

```bash
PAGE_TITLE="_Spec-Delivery-Summary"

curl -s --header "Authorization: Bearer $CONFLUENCE_PAT" \
  "${CONFLUENCE_BASE_URL}/rest/api/content?title=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("'"$PAGE_TITLE"'"))')&spaceKey=${SPACE_KEY}&type=page"
```

**If the page exists — update it:**

```bash
EXISTING_PAGE_ID=$(echo "$RESPONSE" | jq -r '.results[0].id')
CURRENT_VERSION=$(echo "$RESPONSE" | jq -r '.results[0].version.number')
NEW_VERSION=$((CURRENT_VERSION + 1))

curl -s --request PUT \
  --header "Authorization: Bearer $CONFLUENCE_PAT" \
  --header "Content-Type: application/json" \
  --data '{
    "type": "page",
    "title": "'"$PAGE_TITLE"'",
    "version": {"number": '"$NEW_VERSION"'},
    "body": {
      "storage": {
        "value": "'"$PAGE_BODY"'",
        "representation": "storage"
      }
    },
    "ancestors": [{"id": '"$PARENT_PAGE_ID"'}]
  }' \
  "${CONFLUENCE_BASE_URL}/rest/api/content/${EXISTING_PAGE_ID}"
```

**If the page does not exist — create it:**

```bash
curl -s --request POST \
  --header "Authorization: Bearer $CONFLUENCE_PAT" \
  --header "Content-Type: application/json" \
  --data '{
    "type": "page",
    "title": "'"$PAGE_TITLE"'",
    "space": {"key": "'"$SPACE_KEY"'"},
    "ancestors": [{"id": '"$PARENT_PAGE_ID"'}],
    "body": {
      "storage": {
        "value": "'"$PAGE_BODY"'",
        "representation": "storage"
      }
    }
  }' \
  "${CONFLUENCE_BASE_URL}/rest/api/content"
```

**Error handling:** On non-2xx status, log a warning and skip (see Important Rule #10). Record success or failure in the Step 11 report.

---

### Step 11 — Report Results

```
=== Knowledge Integration Report ===

Features processed: {N_FEATURES}
  1. {ISSUE_ID-1} — {summary of changes integrated}
  2. {ISSUE_ID-2} — {summary of changes integrated}

Raw docs processed: {N_RAW}
  1. raw/{path-1} — {new|changed} — {summary of content integrated}
  2. raw/{path-2} — {new|changed} — {summary of content integrated}

Specs updated:
  - POD.md: {POD-level changes summary, or "no changes"}
  - api-spec.md: {N} endpoints added/modified
  - data-model-spec.md: {N} fields added/modified
  - functional-spec.md: {N} use cases added/modified
  - technical-spec.md: {changes or "no changes"}
  - flows/: {N} flow diagrams added/modified
  - nfr-spec.md / security-spec.md / deployment-spec.md / integration-spec.md: {as applicable}
  - AGENTS.md: {changes or "no changes"}
  - LEARNINGS.md: {N} entries added

Skipped:
  - Features with incomplete artifacts: {ISSUE_ID-X: missing specs.md}
  - Raw docs with no knowledge-spec mapping: {raw/minutes/2025-04-18.md}

Commit: {hash} — JIRA#JIRA-0000; Update knowledge for {N_FEATURES} feature(s) and {N_RAW} raw doc(s)

Confluence _Spec-Delivery-Summary:
  Status: {PUBLISHED — {page_url} | UPDATED — {page_url} | SKIPPED — {reason}}
  Total specs on page: {TOTAL_COUNT}
```

---

## Important Rules

1. **Run on develop only.** This skill modifies shared knowledge base files. Running on a feature branch defeats the purpose.
2. **Two input streams.** Always scan both `ai/specs/*/` (features) and `ai/raw/**` (human-authored docs). Either stream alone may trigger a run.
3. **`CHANGELOG.md` is mandatory.** Every run must append an entry to `ai/knowledge/CHANGELOG.md` before committing (Step 8). Never skip it — the changelog is the provenance spine of the knowledge base and downstream operators depend on it.
4. **Targeted edits only.** Never regenerate entire spec files — only update sections affected by the delivered features or raw docs.
5. **Preserve structure.** Maintain existing headings, tables, and formatting in all spec files.
6. **Source attribution.** When a raw doc drives a knowledge-spec edit, cite the raw file path inline so provenance is preserved.
7. **Idempotent.** The per-feature `.knowledge-integrated` marker and the `ai/knowledge/.raw-integrated.log` hash log together prevent re-processing. Safe to re-run.
8. **Skip incomplete inputs.** If a feature directory lacks essential artifacts (feature-spec, change-summary), or a raw doc has no knowledge-spec mapping, log a warning in the report and skip it (do not mark as integrated, so it can be revisited).
9. **Chronological order.** Process features oldest-first; process raw docs in lexical path order. Raw docs are applied **after** features so that manually curated corrections override auto-inferred feature content.
10. **Confluence _Spec-Delivery-Summary is best-effort.** If Confluence credentials are missing or the API is unreachable, log a warning and continue — never fail the knowledge integration because of a Confluence issue. The page uses **all** integrated specs (not just the current batch) so it is always a complete snapshot.

---

## When to Run

| Trigger | Frequency |
|---------|-----------|
| After a sprint ends | Once per sprint |
| After multiple features merge | Ad-hoc, as needed |
| After new raw docs are added to `ai/raw/` | Ad-hoc, as needed |
| Before starting a major new feature | To ensure specs are current |
| As part of periodic maintenance | Weekly or bi-weekly |
