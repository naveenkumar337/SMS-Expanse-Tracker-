# Skill: story-to-spec

> When a user provides a Jira issue ID that resolves to a **Story** (not a Spec), this skill creates a corresponding **Spec** issue in the same project, generates spec-oriented content from the story, links the two via "Relates to", and returns the Spec issue ID for downstream SDD skills.

---

## When to Invoke

This skill is invoked automatically by other SDD skills (`/sdd-create-specs`, `/sdd-sdlc`, `/sdd-fix`, etc.) when the user-provided Jira issue is detected as a **Story** rather than a **Spec**. It can also be invoked directly by the user.

**Detection logic (used by calling skills):**
1. Fetch the issue via `jira_get_issue` with `fields: issuetype,summary,description,priority,labels,components`
2. Read `issuetype.name`
3. If `issuetype.name` is `Story` (case-insensitive) → invoke this skill
4. If `issuetype.name` is `Spec` → skip, proceed with the Spec issue directly
5. For any other issue type → check if a linked Spec already exists (see Step 1 below); if not, invoke this skill

---

## Prerequisites

- The `jira-it` MCP server is connected and accessible.
- The user-provided Jira issue exists and is accessible.

---

## Step 1 — Fetch the Story & Check for Existing Spec Link

Accept the Jira Issue ID (the Story). Fetch its full details:

```
jira_get_issue
  issue_key: {STORY_ID}
  fields: summary,description,issuetype,priority,labels,components,issuelinks
  include: remote_links
```

Extract: Summary, Description, Issue Type, Priority, Labels, Components, Issue Links.

### 1A — Verify Issue Type

If the issue type is already `Spec`, announce and return:

```
Issue {STORY_ID} is already a Spec. No conversion needed.
Proceeding with Spec issue: {STORY_ID}
```

Return `{STORY_ID}` as the Spec ID to the calling skill.

### 1B — Check for Existing Linked Spec

Scan the issue's `issuelinks` for an existing linked Spec:
- For each link, check if the linked issue's `issuetype.name` is `Spec`
- If found, announce and return:

```
Story {STORY_ID} already has a linked Spec: {SPEC_ID}
Proceeding with existing Spec issue: {SPEC_ID}
```

Return `{SPEC_ID}` to the calling skill. Do not create a duplicate.

### 1C — No Existing Spec Found

If no linked Spec exists, proceed to Step 2 to create one.

---

## Step 2 — Generate Spec Content from Story

Using the story's summary and description, generate spec-oriented content suitable for a Jira Spec issue.

### 2A — Generate Spec Summary

Transform the story summary into a spec-oriented summary:
- Prefix: Keep the same summary text but ensure it is clearly a specification
- Format: `[Spec] {Original Story Summary}`

### 2B — Generate Spec Description

Generate a structured spec description from the story content. The description should be in Jira wiki markup:

```
h3. Specification Overview

{2-4 sentence summary of what this spec covers, derived from the story description. Focus on the technical specification aspect rather than the user story narrative.}

h3. Source Story

This spec was generated from Story [{STORY_ID}|{JIRA_BASE_URL}/browse/{STORY_ID}].

h3. Story Summary

{Original story summary}

h3. Story Description

{Original story description — cleaned up and reformatted for clarity}

h3. Acceptance Criteria

{Extract acceptance criteria from the story description if present. If not present, note: "Acceptance criteria to be defined during spec elaboration."}

h3. Technical Scope

{Derive a preliminary technical scope from the story description:
- What systems/components are likely impacted
- What data entities are involved
- What integrations may be needed}

h3. Open Items

- [ ] Detailed functional requirements to be elaborated via /sdd-create-specs
- [ ] Non-functional requirements to be assessed
- [ ] Impacted areas to be confirmed via codebase analysis
```

---

## Step 3 — Create the Spec Issue

Extract the project key from the Story ID (e.g., `PROJECT-1234` → `PROJECT`).

Create the Spec issue in the same project:

```
jira_create_issue
  project_key: {PROJECT_KEY}
  summary: [Spec] {Original Story Summary}
  issue_type: Spec
  description: {Generated spec description from Step 2B}
  additional_fields: {
    "priority": {"name": "{same priority as story}"},
    "labels": [{story labels}, "AI-Generated-Spec"]
  }
```

If the story has components, include them:
```
  components: {same components as story}
```

Record the created Spec issue key (e.g., `PROJECT-5678`).

**Error handling:**

| Error | Action |
|---|---|
| **Issue type 'Spec' not available** | Try alternative names: `Technical Spec`, `Specification`. If none work, fall back to `Task` with label `Spec`. Report to user which type was used. |
| **401/403 Unauthorized** | Report: "Cannot create Spec issue — insufficient Jira permissions." STOP. |
| **Project not found** | Report. STOP. |

---

## Step 4 — Link the Story to the Spec

Link the Story and Spec using "Relates to":

```
jira_create_issue_link
  link_type: Relates to
  inward_issue_key: {SPEC_ID}
  outward_issue_key: {STORY_ID}
```

**Error handling:**

| Error | Action |
|---|---|
| **Link type not found** | Fetch available link types via `jira_get_link_types`. Use the closest match (e.g., "Relates", "Related"). If no suitable type exists, report and continue — the spec was created, just not linked. |
| **401/403** | Report but do not fail — the spec was created successfully. |

---

## Step 5 — Post a Comment on the Story

Add a comment on the original Story referencing the new Spec:

```
jira_add_comment
  issue_key: {STORY_ID}
  body: |
    {panel:title=Spec Created|borderStyle=solid|borderColor=#0052cc|titleBGColor=#deebff|bgColor=#f0f8ff}
    A specification issue has been created for this story.

    *Spec Issue:* [{SPEC_ID}|{JIRA_BASE_URL}/browse/{SPEC_ID}]
    *Link Type:* Relates to
    *Generated by:* SDD (AI-assisted)

    All detailed specifications, plans, and implementation tracking will be managed on the Spec issue.
    {panel}
```

Comment failure is **non-blocking**.

---

## Step 6 — Report & Return

Announce the result:

```
=== Story-to-Spec Conversion Complete ===

Story:     {STORY_ID} — {story summary}
Spec:      {SPEC_ID} — [Spec] {story summary}
Project:   {PROJECT_KEY}
Link:      {STORY_ID} ↔ {SPEC_ID} (Relates to)
Comment:   Posted on {STORY_ID}

The Spec issue ({SPEC_ID}) will be used as the primary tracking issue
for all SDD skill artifacts (specs.md, plan.md, change-summary.md).

The original Story ({STORY_ID}) remains linked and will be updated
alongside the Spec at each SDD stage.
```

Return `{SPEC_ID}` to the calling skill.

---

## Dual-Update Convention

When this skill creates a Spec from a Story, the **Spec becomes the primary SDD tracking issue** — all specs, plans, and artifacts reference the Spec ID. However, the **Story must also be kept in sync** with key status updates. This convention is enforced by downstream skills:

| SDD Stage | Skill | Jira Transition | Spec (Primary) | Story (Linked) |
|---|---|---|---|---|
| **Spec generation** | `/sdd-create-specs` | → **Defining Details** | Full spec created at `ai/specs/{SPEC_ID}/specs.md` | Comment posted + status synced to Defining Details |
| **Plan generation** | `/sdd-create-plan` | → **Ready for Dev** | Plan created at `ai/specs/{SPEC_ID}/plan.md` | Comment posted + status synced to Ready for Dev |
| **Execute start** | `/sdd-execute` | → **In Development** | JIRA transitioned, implementation started | Status synced to In Development |
| **Execute complete** | `/sdd-execute` | → **Ready to Deploy** | MRs created, full JIRA updates, change-summary | Comment with MR links + status synced to Ready to Deploy |
| **Wrap-up** | `/sdd-wrap-up` | → **Complete** | Full summary comment, Confluence page, label, transition to Complete | Status synced to Complete, comment with Confluence link |

### Helper: Resolve Linked Story

Downstream skills use this logic to find the linked Story for a Spec:

1. Fetch the Spec issue with `fields: issuelinks`
2. Scan `issuelinks` for a linked issue where `issuetype.name` is `Story`
3. If found, record it as `{LINKED_STORY_ID}` for dual-update
4. If not found (Spec was created independently, not from a Story), skip Story updates silently

---

## Important Rules

1. **Never create a duplicate Spec.** Always check for existing linked Specs before creating (Step 1B).
2. **Same project.** The Spec is always created in the same Jira project as the Story.
3. **"Relates to" link type.** Use this link type by default. If unavailable, use the closest available type.
4. **Non-blocking on link/comment failures.** The Spec creation is the critical action. Link and comment failures are reported but do not fail the skill.
5. **Return the Spec ID.** The calling skill always receives the Spec ID to use as `{ISSUE_ID}` for all downstream operations.
6. **Preserve Story content.** The generated Spec description includes the full Story content for reference. Nothing is lost.
7. **AI-Generated-Spec label.** Always add this label to auto-created Specs for traceability.
