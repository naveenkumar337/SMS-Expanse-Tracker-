---
name: sdd-image-manager
version: 1.6.0
last_updated: 2026-10-11
description: "Generate Dockerfile and .gitlab-ci.yml for DevOps/Application images. Modes: create, migrate (TAC-bitnami → DHI, Dockerfile + BuildKit CI), upgrade, optimize, remediate. A JIRA Spec ID (e.g. CICDIMAGES-4) is the execute step of the SDD workflow (/sdd-create-specs → /sdd-create-plan → /sdd-image-manager → /sdd-wrap-up); --nosdlc = local generation only."
---

# sdd-image-manager

## Mode Selection

Pick exactly one mode from the arguments:

| Arguments | Mode | Git / JIRA changes |
|-----------|------|--------------------|
| Spec ID only (`CICDIMAGES-4` or `--spec=CICDIMAGES-4`) | **SDD Execute** (replaces `/sdd-execute`) | Yes, via `/sdd-execute` |
| Spec ID + `--nosdlc`, or Spec ID + explicit command | **Local Spec** | No |
| Explicit command only (`dockerfile …`, `migrate`, `ci`, `full`) | **Direct**: run the flow from **Flows** | No |
| No arguments | **Smart** | No |

SDD workflow: `/sdd-create-specs {SPEC-ID} → /sdd-create-plan {SPEC-ID} → /sdd-image-manager {SPEC-ID} → /sdd-wrap-up {SPEC-ID}`

## Commands

```bash
/sdd-image-manager CICDIMAGES-4                          # SDD Execute
/sdd-image-manager CICDIMAGES-4 --nosdlc [--yes]         # Local Spec
/sdd-image-manager dockerfile remediate CICDIMAGES-4     # Local Spec with explicit command
/sdd-image-manager dockerfile create|upgrade|optimize|remediate|migrate
/sdd-image-manager dockerfile remediate --cve=CVE-XXX    # or --report=snyk.json
/sdd-image-manager migrate [--file=Dockerfile]           # Application: Dockerfile TAC-bitnami → DHI + CI → BuildKit
/sdd-image-manager ci --type=devops|application --name=my-image
/sdd-image-manager full --type=devops                    # Dockerfile + CI
/sdd-image-manager                                       # Smart
```

| Param | Values | Description |
|-------|--------|-------------|
| `--type` | `devops`, `application` | DevOps = root, Application = non-root |
| `--name` | string | Image name (default: dir name) |
| `--file` | path | Target file path (`migrate`: Dockerfile to migrate, default `./Dockerfile`) |
| `--cve` | CVE ID | Fix specific vulnerability |
| `--report` | path | Snyk JSON report |
| `--spec` / positional | JIRA key (`^[A-Z][A-Z0-9_]+-\d+$`) | Spec ID |
| `--nosdlc` / `--no-sdlc` | flag | Local Spec instead of SDD Execute |
| `--yes` / `-y` | flag | Local Spec only: skip confirmation when R3 asked nothing |

---

## Shared Rules (all modes)

### R1 — Templates

Determine the image type first (`--type` → R2 → **Type detection**; still unknown → ask per R3; `migrate` is always Application), then fetch before any generation the shared files plus **only** that type's Dockerfile template:

```powershell
$BASE = "https://gitlab.dell.com/devops/devops-images/image-skills/image-sub-skills/-/raw/main"
$TPL  = if ($type -eq "devops") { "devops-dockerfile-template.md" } else { "application-dockerfile-template.md" }
foreach ($f in "questions.md","gitlab-ci-templates.md","vulnerability-remediation.md",$TPL) {
  curl.exe -sL -k "$BASE/$f" -o "$env:TEMP/$f"
}
```

| Type | Dockerfile template |
|------|---------------------|
| Application (create, migrate, upgrade, optimize, remediate) | `application-dockerfile-template.md` |
| DevOps (create, upgrade, optimize, remediate) | `devops-dockerfile-template.md` |

A run that touches both types (e.g. several files in a Spec) fetches both templates.

### R2 — Requirement Mapping

Source: the JIRA Spec's summary, description, acceptance criteria, labels, components and comments (Local Spec), or `specs.md` + `plan.md` (SDD Execute). Later comments override earlier text; CLI arguments override everything.

| Field | Look for | Maps to |
|-------|----------|---------|
| Action | create / new image, upgrade / bump, optimize / reduce size, remediate / CVE / Snyk, migrate / convert / harden **+ Dockerfile, image, bitnami, TAC or DHI**, pipeline / CI / build-container / kaniko / BuildKit (pipeline only) | `dockerfile create` · `upgrade` · `optimize` · `remediate` · `migrate` (Dockerfile + CI) · `dockerfile migrate` (Dockerfile only, when explicitly limited) · `ci` · `full` |
| Image type | devops, application, root / non-root, `non-prod-devops`, DHI, bitnami | `--type` |
| Image name | image / repo name, component | `--name` |
| Language / runtime | Python, Go, Node.js, Java, .NET, PHP + versions | Q&A answers |
| Base image | Registry path, OS (Debian 12/13), FIPS | Must pass **Approved Registries** |
| Packages | Names + target versions | `upgrade` targets |
| CVEs | `CVE-\d{4}-\d+`, Snyk IDs | `--cve` (one or more) |
| Target files | Dockerfile / `.gitlab-ci.yml` paths | `--file` |
| Acceptance criteria | "Done when…", checklists | Final ✅ / ❌ checklist |

### R3 — Gaps & Policy

- Ask only fields that are missing, ambiguous or conflicting (e.g. root + Application), grouped, using `questions.md`.
- Policy violation (unapproved registry, public base image, root for Application, non-FIPS): explain it, propose the nearest compliant option, wait. Never accept silently.
- Never guess requirements or fill gaps with defaults.

### R4 — One Confirmation

Show one plan per run and get one confirmation; it covers every flow in the run (flows do not re-confirm, sub-flow Q&A asks only what is still unanswered).

**Hard stops** (always, even with `--yes` or an approved plan): breaking change · image outside approved paths · Harbor 401 / credentials needed · Snyk unavailable and no CVE/report given · fix plan differs materially from the confirmed plan (e.g. an extra base image change).

Everything else still applies in every mode: templates, approved registries, FIPS rules and backups.

`migrate` `BLOCK` / `TODO` findings are **not** hard stops: the files are written with inline markers, the CI is migrated, and the findings are reported (and, in SDD Execute, committed and listed in the MR description).

---

## SDD Execute Mode

### Pre-checks

1. POD workspace: `ai/` repo exists, the image repo is under `ai/submodules/`, its remote has a `develop` branch. Else STOP and suggest `--nosdlc`.
2. `ai/specs/{SPEC-ID}/specs.md` and `plan.md` exist. Else STOP: "Run `/sdd-create-specs {SPEC-ID}`" / "Run `/sdd-create-plan {SPEC-ID}`" first. Never generate them here.

### Step 1 — Image Plan Check

Skip if `plan.md` already has `## Image Manager Decisions` (re-run for MR review fixes).

1. Read `specs.md` + `plan.md`, apply R1.
2. For each Dockerfile / `.gitlab-ci.yml` in the plan, apply R2 (e.g. `dockerfile create --type=devops` → `devops-dockerfile-template.md` DEVOPS IMAGE; `migrate` → `application-dockerfile-template.md` Mode: MIGRATE + `gitlab-ci-templates.md` Application BuildKit), then R3.
3. Show the proposed `plan.md` changes, confirm per R4, then write:

   ```markdown
   ## Image Manager Decisions
   | File | Command | Type | Name | Base image | Template | Notes |
   ```

Only `plan.md` is updated; `specs.md` is read-only. A missing requirement (not an implementation detail) → STOP, direct to `/sdd-create-specs {SPEC-ID}`. Readiness, contract and fidelity gates belong to `/sdd-execute` Step 2; do not fix them here.

### Step 2 — Execute (MANDATORY: run `/sdd-execute`)

Do NOT generate files directly in this mode. Invoke the `sdd-execute` skill and run **all** its steps in order (Step 1 → 16, or the MR Review Fix Phase on re-entry). If it is not installed, STOP and report it. Only these points differ:

- **Step 6:** generate/modify files via the flow named in `Image Manager Decisions` (see **Flows**). The Step 1 confirmation satisfies R4.
- **Commits:** never commit backups (`*.bak`, `*.bak.*`, `Dockerfile.backup`); Git history keeps the originals.
- **`migrate` MR:** commit and open the MR even when the verdict is `MANUAL_REVIEW`; put the DHI Migration Report (findings, `TODO`/`BLOCK` list, verdict) in the MR description.
- **Tests:** local checks only, each if the tool is available: `hadolint Dockerfile`, `docker build`, YAML syntax check of `.gitlab-ci.yml`. Skip unavailable tools and note it.
- **No pipeline waits:** never poll or wait for GitLab pipelines (before or after push/MR). CI results are reviewed on the MR by humans.
- **MCP fallback:** if `local.config` is missing, a key is missing, or the curl/API call fails (401/403/network error), retry the same operation via MCP (`mcp_list_tools` first):

  | Operation | Instead of | Use |
  |-----------|-----------|-----|
  | Attach `specs.md` / `plan.md` (Step 3) | curl + `JIRA_PAT` | `jira-it` → `jira_update_issue` with `fields: "{}"`, `attachments: "<abs path>/specs.md,<abs path>/plan.md"` |
  | JIRA comments / transitions | curl + `JIRA_PAT` | `jira-it` → `jira_add_comment`, `jira_get_transitions`, `jira_transition_issue` |
  | MR list / create / discussions / replies (Steps 1A, 12, 14, R1–R7) | GitLab API + `GIT_PAT` | `gitlab` MCP server tools |
  | Branch, commit, push (Steps 5, 10, 11) | — | local `git` (existing credentials) |

  Report ❌ (with both errors) only if both paths fail.

If `/sdd-execute` stops (Step 2 gate, no credentials via `local.config` or MCP), report its exact reason and STOP. Never fall back to local-only generation.

### Completion Check

Not complete until every item is done (fresh run). Report each ✅ / ❌ with the reason:

| # | Item | `/sdd-execute` step |
|---|------|---------------------|
| 1 | `specs.md` + `plan.md` attached to the JIRA Spec | 3 |
| 2 | JIRA Spec → In Development | 4 |
| 3 | `develop-{SPEC-ID}` branch in the image repo and `ai/` | 5 |
| 4 | Changes committed and pushed | 10–11 |
| 5 | MR(s) for the image repo and `ai/` (show URLs) | 12, 14 |
| 6 | JIRA Spec → Ready to Deploy | 15 |

On MR review re-entry, report the MR Review Fix Summary instead. Exit immediately after the report (do not wait for pipelines). End with:

```
Next: after MR review comments are added, re-run /sdd-image-manager {SPEC-ID} to fix them.
Once the MR(s) are merged to develop, run /sdd-wrap-up {SPEC-ID} to close the Spec.
```

---

## Local Spec Mode

Local files only; no Git or JIRA updates unless the user explicitly asks.

1. **Fetch the Spec**
   - Preferred: `jira-it` → `jira_get_issue` (`fields: summary,description,issuetype,status,priority,labels,components,issuelinks,attachment,subtasks`, `comment_limit: 20`).
   - Fallback: `local.config` (`JIRA_BASE_URL`, `JIRA_PAT`):
     ```powershell
     $cfg = Get-Content local.config | ConvertFrom-StringData
     curl.exe -sL -k -H "Authorization: Bearer $($cfg.JIRA_PAT)" `
       "$($cfg.JIRA_BASE_URL)/rest/api/2/issue/<SPEC-ID>?fields=summary,description,issuetype,status,labels,components,issuelinks,attachment,comment"
     ```
   - Fetch linked issues/sub-tasks the description refers to. Download an attached Snyk JSON / Dockerfile to `$env:TEMP` as `--report` / reference.
   - Never print or store `JIRA_PAT`. Not found / 401 / 403 → report, ask the user to check the key, VPN or `JIRA_PAT`.
2. **Map & resolve:** apply R2, show `Spec ID · Summary · Action · Type · Name · Key inputs`, then R3.
3. **Confirm** per R4. `--yes` skips the confirmation only if R3 asked nothing.
4. **Run** the flow(s), then map each acceptance criterion to ✅ / ❌ with notes.

---

## Smart Mode

| Condition | Action |
|-----------|--------|
| Both missing | `dockerfile create` → `ci` |
| Only Dockerfile missing | Detect type from CI → `dockerfile create` |
| Only CI missing | Detect type from Dockerfile → `ci` (legacy `harbor.dell.com/tac-bitnami-containers` base → offer `migrate`, which also creates the CI job) |
| Both exist | Security scan (below) → menu: Optimize · Update CI · Upgrade packages · Remediate · Full review. Legacy `harbor.dell.com/tac-bitnami-containers` Application base → **Migrate to DHI (recommended)** is listed first |

**Security scan:** whenever a Dockerfile exists and Snyk CLI is available, run `snyk container test --file=Dockerfile --json`, show `Critical:X High:X Medium:X Low:X`, ask "Remediate now? (yes/no)".

**Type detection:** DevOps = registry contains `non-prod-devops`, no USER directive, runs as root. Application = has USER directive, base from an **Approved Registries** Application path (`dhi-*-stack-images/debian13` or `tac-bitnami-containers/debian-12`), or legacy `harbor.dell.com/tac-bitnami-containers` (suggest `migrate`). `harbor.dell.com/devops-images/*` bases follow the DevOps rules unchanged (no DHI migration).

---

## Flows

| Command | Scope | Steps |
|---------|-------|-------|
| `dockerfile create` | Application: DHI Debian 13 FIPS (default) or Bitnami Debian 12 (fallback), non-root, multi-stage `-fips-dev` → `-fips`. DevOps: Harbor Debian 12, root. Python, Go, Node.js, Java, .NET, PHP | R1 → Q&A → base image via Artifactory storage API (Application) / Harbor API (DevOps) → Generate |
| `dockerfile migrate` | Application only: TAC-bitnami (Harbor) or non-approved `dhi-*` → DHI Debian 13 FIPS; bitnami Debian 12 (Artifactory) fallback | R1 → analyze D1–D26 (`application-dockerfile-template.md` → Mode: MIGRATE) → plan → R4 → `Dockerfile.bak` → edit in place → report + verdict |
| `migrate` | `dockerfile migrate` + Application CI | `dockerfile migrate` → `ci` (Application BuildKit, `.gitlab-ci.yml.bak` → edit in place), one R4 confirmation for both |
| `dockerfile upgrade` | Single/multiple packages. Application: + DHI Check; legacy bitnami base → offer `migrate` | Parse → dependency analysis → breaking-change detection → Apply |
| `dockerfile optimize` | Combine RUN, layer order Base → System → Lang → App, multi-stage, remove caches, pin versions. Application: + DHI Check | Backup → Apply template rules |
| `dockerfile remediate` | Snyk CLI, Snyk JSON, direct CVE | See below |
| `ci` | DevOps: full pipeline (build → test → deploy → verify → prod). Application: replace build-container job with BuildKit | Detect type → R1 → Generate/migrate |
| `full` | Dockerfile + CI | `dockerfile create` → `ci` |

### dockerfile remediate

1. Verify the Dockerfile exists.
2. Input priority: `--cve` → `--report` → Snyk CLI → ask for `--report` / `--cve`.
3. Categorize: Base Image | APT | PIP/NPM | Unfixable. Prefer base image upgrades; cascade dependency updates.
4. Check dependencies, then verify fix availability (approved Artifactory paths / Harbor / apt / PyPI / npm). CVE not found → Debian tracker, Snyk DB. Not applicable → inform, no action.
5. Confirm per R4.
6. Backup → Apply → Offer verification scan. Details: `vulnerability-remediation.md`.

---

## Error Handling

| Error | Action |
|-------|--------|
| Template fetch fails | Check network/VPN |
| Artifactory / Harbor unreachable | Manual input validated against **Approved Registries** |
| Harbor 401 (DevOps) | Prompt credentials (never store) |
| Legacy image not in the TAC → DHI mapping (`migrate`) | Never guess a DHI name: bitnami Debian 12 fallback, else `BLOCK` marker |

Policy violations, breaking changes and unapproved images: see R3 / R4.

---

## DHI FIPS Compliance

| Requirement | Application | DevOps |
|-------------|-------------|--------|
| Non-root user | ✅ UID/GID 65532 (DHI) · 1000 (bitnami fallback) | ❌ Root |
| No secrets | ✅ | ✅ |
| No own CA certificates (Dell CA ships in DHI; `dfn_*` excepted) | ✅ | – |
| Java FIPS options preserved (append `JAVA_TOOL_OPTIONS`, BCFKS) | ✅ | – |
| UID/GID ≤ 65535 | ✅ | – |
| Clean artifacts | ✅ | ✅ |
| Pinned versions | ✅ | ✅ |
| --no-install-recommends | ✅ | ✅ |

## Approved Registries

### Application: `artifacts.dell.com/kob-1006479-oci-dev-local` (ONLY these paths)

| Priority | Path |
|----------|------|
| 1 | `dhi-os-stack-images/debian13` |
| 1 | `dhi-tech-stack-images/debian13` |
| 1 | `dhi-software-stack-images/debian13` |
| 1 | `dhi-dependencies-stack-images/debian13` |
| 2 (fallback) | `tac-bitnami-containers/debian-12` |

Any other folder or public registry is NOT approved for Application images (including builder stages). Anonymous pull; browse via `https://artifacts.dell.com/artifactory/api/storage/kob-1006479-oci-dev-local/<path>`. See `application-dockerfile-template.md` → Approved Base Images (and Legacy TAC → DHI Mapping).

### DevOps

- `harbor.dell.com/non-prod-devops/debian-12`
