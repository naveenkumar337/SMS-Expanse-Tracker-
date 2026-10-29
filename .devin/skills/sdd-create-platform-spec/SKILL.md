# Skill: create-platform-spec

> Convert unstructured platform change information into a structured platform change spec. Fetches JIRA issue details, cross-references platform knowledge, classifies the change by type, and produces a spec under `ai/specs/{ISSUE_ID}/` that `sdd-update-platform-knowledge` can consume to incrementally update `ai/knowledge/` files.

---

## Purpose

Platform knowledge is created once by `sdd-create-platform-knowledge`. Over time, platforms change — vendor upgrades happen, Dell adds customizations, integrations are modified, certificates expire, business processes evolve. These changes must be captured as structured specs so `sdd-update-platform-knowledge` can integrate them into the knowledge base.

This skill bridges the gap between **raw, unstructured change information** (vendor release notes pasted into JIRA, email descriptions of config changes, ad-hoc user input) and the **structured format** that `sdd-update-platform-knowledge` expects.

### Relationship to Other Skills

| Skill | Role |
|-------|------|
| `sdd-create-platform-knowledge` | One-time: creates `ai/knowledge/PLATFORM.md` + core & conditional specs |
| **`sdd-create-platform-spec`** | **Per-change: converts raw change info → structured spec in `ai/specs/{ISSUE_ID}/`** |
| `sdd-update-platform-knowledge` | Periodic: reads specs from `ai/specs/` + raw docs from `ai/raw/`, incrementally updates `ai/knowledge/` |

---

## Prerequisites

- Platform knowledge base exists at `ai/knowledge/` (created by `sdd-create-platform-knowledge`).
- `PLATFORM.md` exists in `ai/knowledge/` with valid frontmatter (platform classification).
- `local.config` at workspace root (for JIRA API access).

---

## Step 1 — Obtain JIRA Issue ID & Detect Mode

If the JIRA issue ID (e.g., `PLATFORM-1234`) was **not** provided as input, prompt the user for it before proceeding.

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

### Step 1.1 — Check if Spec Already Exists

If `ai/specs/{ISSUE_ID}/specs.md` already exists → enter **UPDATE mode**:
- Do NOT regenerate the spec from scratch
- Read the existing spec in full
- Compare against current JIRA issue content (updated description, new details)
- Apply **targeted amendments** to affected sections only
- Mark each new or changed item with `[UPDATED-{YYYY-MM-DD}]`
- Append a Change Log entry to the spec

Only bypass UPDATE mode and generate a fresh spec when:
- This is a **new JIRA issue** with no prior spec (the normal CREATE flow)
- The user explicitly requests a full regeneration

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
mcp2_jira_get_issue
  issue_key: {ISSUE_ID}
  fields: summary,description,issuetype,priority,labels,components
```

Extract: Summary, Description, Issue Type, Priority, Labels, Components.

> **If `{LINKED_STORY_ID}` exists:** Also fetch the Story issue to capture its original description and platform change details, which may contain richer requirement details than the auto-generated Spec description. Merge both sources when generating the spec.

**Error handling:** If MCP fails, fall back to curl using `local.config` (`JIRA_PAT`, `JIRA_BASE_URL`). If both fail, report to user.

---

## Step 3 — Load Platform Knowledge Context

Read the platform knowledge base to understand what exists today:

### 3.1 — Read Platform Classification

Read `ai/knowledge/PLATFORM.md` frontmatter to extract:
- `platform_name`, `vendor`, `vendor_product`
- `pod_type` (3PP)
- `orientation` (Vertical / Horizontal / Infrastructure)
- `hosting` (SaaS / Dell-hosted / Hybrid)

### 3.2 — Load Relevant Knowledge Specs

Based on the JIRA issue content, selectively load the knowledge specs that are relevant to the change:

| Keyword in JIRA description | Load |
|-----------------------------|------|
| Custom object, custom field, workflow, flow, trigger, code, Apex, ABAP | `customization-spec.md` |
| Integration, API, sync, feed, middleware, MuleSoft, connection | `integration-spec.md` |
| Upgrade, migration, version, release, deprecation, rollback | `migration-spec.md`, `vendor-spec.md` |
| Certificate, SSO, service account, auth, permission, role | `security-spec.md` |
| Entity, field, table, schema, data model, relationship | `data-model-spec.md` |
| Process, workflow (business), approval, routing | `functional-spec.md` (if exists) |
| Deploy, infrastructure, Kubernetes, environment | `deployment-spec.md` (if exists) |

Do not load all files by default. If a file is missing, note its absence and continue.

### 3.3 — Load Raw Docs (if user points to specific files)

If the user references specific files in `ai/raw/`, read and incorporate them as additional context.

---

## Step 4 — Classify Platform Change

Determine the change type based on JIRA content + user input. A single change spec may span multiple types.

### 4.1 — Change Type Classification

| Change Type | Indicators | Primary Target Specs |
|-------------|------------|---------------------|
| **vendor-upgrade** | Release notes, version bump, deprecation, breaking changes | `vendor-spec.md`, `migration-spec.md` |
| **customization** | New custom objects/fields, code changes, workflow updates | `customization-spec.md`, `data-model-spec.md` |
| **integration** | New/modified integrations, API changes, middleware updates | `integration-spec.md` |
| **security** | Certificate renewal, SSO changes, service account updates | `security-spec.md` |
| **data-model** | Schema changes, new entities, relationship changes | `data-model-spec.md` |
| **process** | Business process changes, approval flow updates | `functional-spec.md`, `process-catalog.md` |
| **infrastructure** | Deployment changes, environment updates | `deployment-spec.md` |

### 4.2 — Present Classification

```
=== Platform Change Classification ===

Platform: {platform_name} ({vendor} {vendor_product})
JIRA Issue: {ISSUE_ID} — {summary}
Change Type(s): {comma-separated types}

Target knowledge specs for update:
  1. customization-spec.md — §2 Custom Objects, §3 Custom Code
  2. integration-spec.md — §4 Outbound Integrations
  3. security-spec.md — §4 Certificates
  ...

Proceed? [Y/N]
```

---

## Step 5 — Gather Change Details

For each classified change type, extract or prompt for structured details.

### 5.1 — Extract from JIRA Description

Parse the JIRA description to extract structured change details. Look for:
- Vendor release names and versions
- Custom object/field names and API names
- Integration names, endpoints, protocols
- Certificate names and expiry dates
- Service account names
- Business process names
- Environment names
- Issues encountered and resolutions

### 5.2 — Cross-Reference Against Existing Knowledge

For each extracted detail, check if it already exists in the knowledge base:
- Custom object `Dell_Order__c` — exists in `customization-spec.md` §2? → **UPDATE** vs **NEW**
- Integration to SAP — exists in `integration-spec.md` §4? → **UPDATE** vs **NEW**
- Certificate `sfdc-integration-cert` — exists in `security-spec.md` §4? → **UPDATE** vs **NEW**

Mark each item as `[NEW]` or `[UPDATE]` with the existing knowledge reference.

### 5.3 — Prompt for Missing Details

If the JIRA description lacks critical details for the classified change type, prompt the user with a **single structured prompt** (do not ask one field at a time):

```
=== Platform Change — Details Needed ===

Change Type: vendor-upgrade
Platform: Salesforce Sales Cloud

The JIRA description provides the upgrade version but is missing these details:

1. **Customization Impact:** Which custom objects/fields were affected by this upgrade?
2. **Integration Impact:** Did any integrations require changes? If so, which ones?
3. **Issues Encountered:** Were there any problems during/after the upgrade?
4. **Rollback:** Was the rollback plan tested? What was the rollback window?

Please provide what you can. I'll mark missing items as [TBD].
```

---

## Step 6 — Generate the Platform Change Spec

Create the output file at:

```
ai/specs/{ISSUE_ID}/specs.md
```

The spec **must** contain the following sections in order:

### Section 1 — Header

```markdown
# Platform Change Spec — {ISSUE_ID}

| Field | Value |
|-------|-------|
| **Issue ID** | {ISSUE_ID} |
| **Issue Type** | {from JIRA} |
| **Priority** | {from JIRA} |
| **Platform** | {platform_name} ({vendor} {vendor_product}) |
| **POD Type** | 3PP |
| **Change Type(s)** | {comma-separated types} |
| **Change Date** | {YYYY-MM-DD} |
| **Author** | {from git config or user} |
| **Generated** | {YYYY-MM-DD} |
```

### Section 2 — Change Summary

2-5 sentence business-level summary: what changed, why, and what the impact is. Derived from JIRA summary and description.

### Section 3 — Vendor Release Impact (if change_type includes vendor-upgrade)

```markdown
## 3. Vendor Release Impact

### Vendor Release
| Field | Value |
|-------|-------|
| Release Name | {e.g., Summer '26} |
| Release Date | {YYYY-MM-DD} |
| Previous Version | {version} |
| New Version | {version} |

### Key Vendor Changes Affecting Dell
- {Change 1 — what it is, why it matters to Dell}
- {Change 2}

### Deprecations & Retirements
| Feature | Sunset Date | Dell Impact | Action Required |
|---------|-------------|-------------|-----------------|
| {feature} | {date} | {impact} | {action} |
```

### Section 4 — Customization Changes (if change_type includes customization)

```markdown
## 4. Customization Changes

### Custom Objects Added/Modified
| Object API Name | Change | Status | Knowledge Ref |
|-----------------|--------|--------|---------------|
| {Object__c} | [NEW] / [UPDATE] | {description} | customization-spec.md §2 |

### Custom Fields Added/Modified
| Object | Field API Name | Type | Change | Knowledge Ref |
|--------|---------------|------|--------|---------------|
| {Object} | {Field__c} | {type} | [NEW] / [UPDATE] | customization-spec.md §2 |

### Custom Code Changes
| Component | Type | Change | Knowledge Ref |
|-----------|------|--------|---------------|
| {ClassName} | Apex Class / Trigger / Flow | {description} | customization-spec.md §3/§4 |
```

### Section 5 — Integration Changes (if change_type includes integration)

```markdown
## 5. Integration Changes

### Integrations Added/Modified
| Integration Name | Direction | Protocol | Change | Knowledge Ref |
|------------------|-----------|----------|--------|---------------|
| {name} | Inbound/Outbound/Bidirectional | {protocol} | [NEW] / [UPDATE] | integration-spec.md §3/§4/§5 |

### Integration Detail (per integration)
For each affected integration:
- **Source:** {system}
- **Target:** {system}
- **Data Exchanged:** {what data}
- **Frequency:** {real-time / batch / scheduled}
- **What Changed:** {description}
```

### Section 6 — Data Model Changes (if change_type includes data-model)

```markdown
## 6. Data Model Changes

### Entities Added/Modified
| Entity Name | Change | Fields Affected | Knowledge Ref |
|-------------|--------|-----------------|---------------|
| {Entity} | [NEW] / [UPDATE] | {field list} | data-model-spec.md §1 |

### Relationships Changed
| Parent | Child | Cardinality | Change |
|--------|-------|-------------|--------|
| {entity} | {entity} | {1:N / M:N} | [NEW] / [UPDATE] |
```

### Section 7 — Security Changes (if change_type includes security)

```markdown
## 7. Security Changes

### Certificates
| Certificate Name | Service | Expiry Date | Change | Knowledge Ref |
|------------------|---------|-------------|--------|---------------|
| {cert-name} | {service} | {YYYY-MM-DD} | [NEW] / [RENEWED] | security-spec.md §4 |

### Service Accounts
| Account Name | Purpose | Permissions | Change | Knowledge Ref |
|--------------|---------|-------------|--------|---------------|
| {account} | {purpose} | {permissions} | [NEW] / [UPDATE] | security-spec.md §4 |

### SSO / Authentication Changes
- {description of SSO changes, if any}
```

### Section 8 — Migration Notes (if change_type includes vendor-upgrade or infrastructure)

```markdown
## 8. Migration Notes

### Pre-Migration Actions
- [x] / [ ] {action item}

### Issues Encountered
| # | Issue | Impact | Resolution | Time to Resolve |
|---|-------|--------|------------|-----------------|
| 1 | {description} | {what broke} | {how fixed} | {duration} |

### Rollback Plan
- **Rollback tested:** {Yes / No / N/A}
- **Rollback window:** {duration}
- **Rollback procedure:** {brief or link to runbook}

### Lessons Learned
- {Lesson 1}
- {Lesson 2}
```

### Section 9 — Business Process Impact (if change_type includes process)

```markdown
## 9. Business Process Impact

### Processes Affected
| Process Name | Change | User Impact | Training Required |
|--------------|--------|-------------|-------------------|
| {process} | {what changed} | {how users are affected} | {Yes / No} |
```

### Section 10 — Target Specs Mapping

This section explicitly maps each change to the knowledge spec sections that `sdd-update-platform-knowledge` should update.

```markdown
## 10. Target Specs Mapping

| Knowledge Spec | Section | Change Summary | Status |
|----------------|---------|----------------|--------|
| `PLATFORM.md` | §{N} {section name} | {what to update, or "no changes"} | pending |
| `customization-spec.md` | §{N} {section name} | {what to update} | pending |
| `integration-spec.md` | §{N} {section name} | {what to update} | pending |
| `data-model-spec.md` | §{N} {section name} | {what to update} | pending |
| `migration-spec.md` | §{N} {section name} | {what to update} | pending |
| `security-spec.md` | §{N} {section name} | {what to update} | pending |
| `vendor-spec.md` | §{N} {section name} | {what to update} | pending |
| `functional-spec.md` | §{N} {section name} | {what to update, or "N/A"} | pending |
| `deployment-spec.md` | §{N} {section name} | {what to update, or "N/A"} | pending |
```

Only include rows where changes apply. Mark all as `pending` — `sdd-update-platform-knowledge` will update status to `integrated` after processing.

### Section 11 — Open Questions & Assumptions

```markdown
## 11. Open Questions & Assumptions

### Open Questions
1. {question — what detail is missing}
2. {question}

### Assumptions
1. {assumption — with rationale}
2. {assumption}
```

### Change Log

```markdown
## Change Log
| Date | Type | Summary |
|------|------|---------|
| {YYYY-MM-DD} | Initial | Spec created from {ISSUE_ID} |
```

---

## Step 7 — Spec Quality Validation

After generating `specs.md`, verify:

1. **Section 1 (Header)** — All metadata fields populated; change type(s) valid.
2. **Section 2 (Summary)** — Business language; 2-5 sentences; no implementation details.
3. **Sections 3-9** — Only sections for the classified change type(s) are populated; others are omitted (not left empty).
4. **Knowledge references** — Every `[NEW]` / `[UPDATE]` item has a valid Knowledge Ref pointing to the correct spec and section.
5. **Cross-reference validation** — Every item in the Target Specs Mapping (§10) corresponds to an actual change described in §3-9.
6. **No fabrication** — Items marked `[TBD]` for missing details rather than guessed values.
7. **`[TBD]` items** — Each `[TBD]` has a corresponding Open Question in §11.

Fix any failures before presenting to the user.

---

## Step 8 — Transition JIRA to "Defining Details"

Fetch current status via MCP. If not already "Defining Details", get available transitions and execute the matching one:

```
mcp2_jira_get_transitions
  issue_key: {ISSUE_ID}

mcp2_jira_transition_issue
  issue_key: {ISSUE_ID}
  transition_id: {TRANSITION_ID}
```

JIRA transition failure is **non-blocking**. Log a warning and continue.

> **Note:** This is the only JIRA status transition performed by the platform skill chain. All subsequent status transitions (e.g., after implementation, review, deployment) are **manual**.

---

## Step 8A — Sync Linked Story (Dual-Update)

**Skip if `{LINKED_STORY_ID}` is null** (no linked Story exists).

If a linked Story exists, post a status-sync comment on the Story:

```
jira_add_comment
  issue_key: {LINKED_STORY_ID}
  body: |
    {panel:title=Platform Change Spec Generated|borderStyle=solid|borderColor=#0052cc|titleBGColor=#deebff|bgColor=#f0f8ff}
    Platform change specification has been generated for this story.

    *Spec Issue:* [{ISSUE_ID}|{JIRA_BASE_URL}/browse/{ISSUE_ID}]
    *Spec File:* {{ai/specs/{ISSUE_ID}/specs.md}}
    *Platform:* {platform_name} ({vendor} {vendor_product})
    *Change Type(s):* {comma-separated types}
    *Items:* [NEW]: {N} | [UPDATE]: {N} | [TBD]: {N}

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

## Step 9 — Confirm Output

Report to the user:

```
=== create-platform-spec Summary ===

Issue:         {ISSUE_ID} — {summary}
Linked Story:  {LINKED_STORY_ID or "None — Spec provided directly"}
Platform:      {platform_name} ({vendor} {vendor_product})
POD Type:      3PP
Change Type:   {comma-separated types}
Output:        ai/specs/{ISSUE_ID}/specs.md
JIRA Status:   Spec transitioned to "Defining Details" (or skipped/failed)
Story Sync:    {LINKED_STORY_ID} comment posted + status synced (or "N/A")

Target knowledge specs:
  1. {spec} §{N} — {summary}
  2. {spec} §{N} — {summary}
  ...

Items:
  [NEW]:     {N} new items to add to knowledge base
  [UPDATE]:  {N} existing items to update
  [TBD]:     {N} items needing manual input

Open Questions:
  1. {question}
  2. {question}

Next step:
  Run sdd-update-platform-knowledge to integrate this spec into ai/knowledge/.
```

---

## Important Rules

1. **Platform knowledge must exist.** This skill requires `ai/knowledge/PLATFORM.md` to exist. If it does not, tell the user to run `sdd-create-platform-knowledge` first.
2. **Cross-reference, don't duplicate.** Every change item must reference the specific section in the knowledge spec it will update. Do not duplicate knowledge base content into the change spec.
3. **[NEW] vs [UPDATE] is mandatory.** Every item must be tagged as `[NEW]` (not in knowledge base) or `[UPDATE]` (modifying existing knowledge). This drives how `sdd-update-platform-knowledge` applies the change.
4. **[TBD] over fabrication.** If change details are unknown, mark `[TBD]` and add an Open Question. Never guess platform configuration values, certificate expiry dates, or integration endpoints.
5. **Target Specs Mapping is mandatory.** Section 10 tells `sdd-update-platform-knowledge` exactly which specs and sections to update. Without it, the update skill would need to re-classify the entire spec.
6. **Change types drive section inclusion.** Only include sections 3-9 that correspond to the classified change type(s). Do not include empty sections.
7. **Sensitive data.** Never write actual secrets, passwords, tokens, or certificate private keys. Use `<REDACTED>` placeholders. Certificate names, expiry dates, and service account names are acceptable.
8. **UPDATE mode preserves history.** When updating an existing spec, append to the Change Log. Do not discard prior change entries.
