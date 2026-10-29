# Skill: create-platform-knowledge

> Generate impact-centric knowledge for 3rd-party platform entities (`pod_type: 3PP`). Classifies the platform by orientation and hosting model, then deterministically resolves which files to generate. Produces a **mandatory** `PLATFORM.md` executive summary plus up to 11 spec files — all focused on Dell's footprint on the vendor platform and enterprise impact, NOT the vendor product itself.

---

## Purpose

This skill generates a comprehensive, impact-centric knowledge base for **3rd-party platform entities** in the AI-Native Knowledge Fabric.

**Key design principle:** Every file captures **Dell's footprint** on the vendor platform — what Dell has configured, customized, integrated, and extended. The skill deliberately avoids duplicating vendor product documentation. The goal is enterprise knowledge weaving: understanding cross-impact when platforms change, programs launch, or upgrades happen.

### What It Produces

**Mandatory outputs (always generated):**

| # | File | Description |
|---|------|-------------|
| 1 | `PLATFORM.md` | Executive summary: identity, purpose, business context, scope, collaborations. Business language only in sections 1-8. |
| 2 | `customization-spec.md` | Dell's customization footprint — custom objects, fields, code, workflows, automations. The delta from vanilla. |
| 3 | `integration-spec.md` | All connections in/out — source, target, protocol, data exchanged, frequency, owner. The enterprise wiring diagram. |
| 4 | `data-model-spec.md` | Dell's data implementation — custom ERD, custom objects/tables, data ownership, sensitivity. |
| 5 | `migration-spec.md` | Version history, upcoming upgrades, environments, what broke last time, rollback plans. |
| 6 | `security-spec.md` | Dell's security config — SSO, service accounts, certificates with expiry, roles/permissions. |
| 7 | `CHANGELOG.md` | Audit trail of all changes to `ai/knowledge/`. Appended to (never overwritten). |
| 8 | `AGENTS.md` | Workspace context for AI agents (mandatory, populated). |
| 9 | `LEARNINGS.md` | Persistent secondary memory template. Preserved if it already exists. |

**Conditional outputs (resolved by classification):**

| # | File | When Included |
|---|------|---------------|
| 10 | `functional-spec.md` | Vertical platforms with complex business processes (CRM, ERP, ITSM) |
| 11 | `deployment-spec.md` | Platforms Dell hosts/manages (Dell-hosted or Hybrid hosting) |
| 12 | `vendor-spec.md` | Vertical platforms and complex horizontal platforms |
| 13 | `process-catalog.md` | Horizontal platforms managing org-wide processes |
| 14 | `support-log.md` | Horizontal platforms handling adhoc support |

---

## Prerequisites

- The current working directory is the root of a platform workspace (the platform team's Git repository).
- Write access to the output directory (default `ai/knowledge/`).
- **Primary input:** Human-written documentation in `ai/raw/` — architecture docs, integration maps, customization inventories, data dictionaries, upgrade histories, security configs, process docs, runbooks. **If `ai/raw/` is empty or does not exist, the skill proceeds but will produce more `[TBD]` sections.**
- **Optional:** Vendor documentation URLs in `ai/raw/vendor-docs.yaml`.
---

## Workflow Steps

### Step 1 — Identify Platform & Classify

The skill must first determine WHAT platform this is and WHICH files to generate. This uses a deterministic resolution table — not AI inference — for reproducibility and auditability.

**1.1 — Check for `ai/platform-info.yaml`**

If this file exists, read it for pre-populated classification:

```yaml
platform_name: "Salesforce Sales Cloud"
vendor: "Salesforce"
vendor_product: "Sales Cloud"
pod_type: 3PP                    # 3PP (3rd-party platform) — always 3PP for this skill
orientation: Vertical            # Vertical | Horizontal | Infrastructure
hosting: SaaS                    # SaaS | Dell-hosted | Hybrid
```

If found and complete, skip to sub-step 1.4.

**1.2 — Auto-Classify from Known Vendor Lookup**

If `platform-info.yaml` does not exist, check the workspace for clues (README, existing docs, repo name) to identify the vendor/product, then look up in the pre-built vendor table:

| Vendor Product | Orientation | Hosting (default) |
|---------------|-------------|-------------------|
| Salesforce (Sales/Service/Marketing Cloud) | Vertical | SaaS |
| Oracle EBS | Vertical | Dell-hosted |
| SAP S/4HANA | Vertical | Dell-hosted |
| ServiceNow ITSM | Vertical | SaaS |
| Workday | Vertical | SaaS |
| Zuora | Vertical | SaaS |
| Contentstack | Vertical | SaaS |
| JIRA | Horizontal | SaaS |
| Confluence | Horizontal | SaaS |
| GitLab | Horizontal | Dell-hosted |
| Slack / Teams | Horizontal | SaaS |
| AWS / Azure / GCP | Infrastructure | Hybrid |
| Oracle DB / PostgreSQL | Infrastructure | Dell-hosted |
| Kafka / RabbitMQ / IBM MQ | Infrastructure | Dell-hosted |
| Snowflake / Databricks | Infrastructure | SaaS |
| MuleSoft / Boomi | Infrastructure | Hybrid |
| Okta / Azure AD | Infrastructure | SaaS |
| F5 / Cloudflare | Infrastructure | Dell-hosted |
| Vault / Secrets Manager | Infrastructure | Dell-hosted |
| Dynatrace / Datadog | Infrastructure | SaaS |
| Splunk | Infrastructure | Hybrid |
| SonarQube / Snyk | Horizontal | SaaS |
| Artifactory / Nexus | Horizontal | Dell-hosted |
| Jenkins | Horizontal | Dell-hosted |
| Terraform | Infrastructure | SaaS |

If the vendor/product is recognized, auto-classify and present to the user for confirmation.

**1.3 — Manual Classification (Fallback)**

If the vendor is unknown or `platform-info.yaml` does not exist, ask the user:

> I need to classify this platform to determine which knowledge files to generate. Please answer 2 questions:
>
> 1. **Orientation:** What type of platform is this?
>    - **Vertical** — Business process system (CRM, ERP, SCM, HCM, ITSM, Billing, Commerce, CMS)
>    - **Horizontal** — Organizational tooling used across all teams (project management, documentation, communication, DevOps)
>    - **Infrastructure** — Cloud, database, messaging, security, monitoring, data engineering
>
> 2. **Hosting Model:** Who manages the infrastructure?
>    - **SaaS** — Vendor fully manages (e.g., Salesforce, JIRA Cloud, Snowflake)
>    - **Dell-hosted** — Dell manages infrastructure (e.g., self-hosted GitLab, Oracle DB, Kafka)
>    - **Hybrid** — Vendor SaaS + Dell-managed middleware layer

**1.4 — Resolve File Set**

Apply the resolution table:

| Orientation | Hosting | File Set |
|-------------|---------|----------|
| **Vertical** | Any | Core 7 + functional-spec + vendor-spec + deployment-spec\* |
| **Horizontal** | Any | Core 7 + process-catalog + support-log + deployment-spec\* |
| **Infrastructure** | **Dell-hosted** | Core 7 + deployment-spec |
| **Infrastructure** | **SaaS** | Core 7 |
| **Infrastructure** | **Hybrid** | Core 7 + deployment-spec |

\* `deployment-spec` only when hosting = Dell-hosted or Hybrid.

Core 7 = PLATFORM.md, customization-spec.md, integration-spec.md, data-model-spec.md, migration-spec.md, security-spec.md, CHANGELOG.md.

**1.5 — Present & Confirm**

Display the resolved classification and file set to the user:

```
=== Platform Classification ===
Platform: Salesforce Sales Cloud
Vendor: Salesforce
POD Type: 3PP
Orientation: Vertical
Hosting: SaaS

=== File Set (9 files) ===
CORE (always):
  1. PLATFORM.md
  2. customization-spec.md
  3. integration-spec.md
  4. data-model-spec.md
  5. migration-spec.md
  6. security-spec.md
  7. CHANGELOG.md

CONDITIONAL (based on classification):
  8. functional-spec.md        (Vertical -> included)
  9. vendor-spec.md            (Vertical -> included)

NOT INCLUDED:
  - deployment-spec.md         (SaaS -> excluded)
  - process-catalog.md         (not Horizontal -> excluded)
  - support-log.md             (not Horizontal -> excluded)

INFRASTRUCTURE:
  + AGENTS.md
  + LEARNINGS.md

Would you like to override this file set? (add/remove files) [Y/N]
```

Allow the user to add or remove files. Proceed with the confirmed set.

---

### Step 2 — Collect Reference Inputs

Platform knowledge is primarily derived from human-written documentation, NOT codebase analysis.

**2.1 — Load `ai/raw/` (Primary Input)**

The `ai/raw/` directory is the primary knowledge source for platforms. Check if it exists and load all files:

```bash
if [ -d "ai/raw" ]; then
  find ai/raw/ -type f \( -name "*.md" -o -name "*.txt" -o -name "*.pdf" -o -name "*.docx" -o -name "*.xlsx" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" -o -name "*.adoc" -o -name "*.rst" \) | sort
fi
```

Expected document types in `ai/raw/` for platforms:

- **Architecture docs** — platform architecture overview, integration architecture
- **Integration maps** — documentation of all integrations in/out
- **Customization inventories** — exports from vendor admin (custom objects, fields, code listings)
- **Data dictionaries** — business data definitions, ERD exports
- **Upgrade histories** — past upgrade records, post-mortem reports
- **Security configs** — SSO configuration, certificate inventories, service account lists
- **Process docs** — business process documentation, workflow descriptions
- **Runbooks** — operational runbooks, incident response procedures
- **Vendor releases** — vendor release notes (for the update skill)

If `ai/raw/` is empty or absent, note this and proceed — the skill will produce more `[TBD]` sections.

**2.1A — Vendor Document Gate (Mandatory Pre-Screen)**

Before analyzing the full content of any document loaded from `ai/raw/` or provided by the user, perform a **lightweight pre-screen** to identify and reject vanilla vendor documents. This gate protects token budget and prevents vendor product documentation from polluting the Dell-specific knowledge base.

**Screening method — read only the first ~50 lines** (title, table of contents, introduction, copyright/header block) of each document. Do NOT read the full document for this check.

**Reject the document if ANY of these signals are present:**

1. **Vendor branding / copyright** — The document header, footer, or first page contains vendor copyright notices, vendor logo references, or statements like `"© {Vendor} Inc."`, `"Proprietary and Confidential — {Vendor}"`, `"{Vendor} Documentation"`, `"{Vendor} Product Guide"`.

2. **Generic product documentation language** — The introduction describes the vendor product in generic terms (`"This guide explains how to use {Product}..."`, `"Welcome to {Product}..."`, `"{Product} is a platform that..."`) without any mention of Dell, Dell-specific configuration, or Dell business context.

3. **Vendor user/admin guide structure** — The table of contents follows a vendor manual pattern: `"Getting Started"`, `"Installation Guide"`, `"Feature Overview"`, `"Administrator's Guide"`, `"User Reference"`, `"API Reference"` — with no Dell-specific sections.

4. **No Dell footprint signals** — After scanning the first ~50 lines, there is zero mention of: Dell, Dell Technologies, any Dell-specific team names, Dell project names, Dell business processes, Dell environment names, or Dell customization references.

**Accept the document if ANY of these signals are present:**

- References to Dell-specific configurations, customizations, or business processes
- Mentions of Dell teams, Dell environments (e.g., "Dell Prod", "Dell UAT"), Dell project IDs
- Describes how Dell uses or has modified the vendor product
- Contains Dell-specific architecture decisions, integration details, or operational procedures
- Is clearly a Dell-authored document about the platform (architecture doc, runbook, upgrade post-mortem, integration map, etc.)

**Edge cases:**

- **Vendor release notes with Dell impact annotations:** ACCEPT — these contain Dell-relevant change impact analysis, not just vanilla product features.
- **Vendor API reference:** REJECT — link to it in `vendor-spec.md §6` instead of consuming it. Exception: accept if the document contains Dell-specific API usage examples or Dell endpoint configurations.
- **Mixed documents** (part vendor, part Dell): ACCEPT with a warning — note in the Step 2.4 summary that the document contains vendor content and only Dell-specific sections should be extracted during generation.

**When a document is rejected:**

1. Log it in the Step 2.4 summary under a new **"Rejected (vendor document)"** section:
   ```
   Rejected (vendor document — not consumed):
     1. [ai/raw] salesforce-admin-guide.pdf — REJECTED: Vendor product manual
        (© Salesforce, no Dell references in first 50 lines)
     2. [ai/raw] servicenow-api-reference.md — REJECTED: Vendor API reference
        (generic product documentation, no Dell-specific content)
   ```
2. Do NOT read the full document. Do NOT use it for any spec generation.
3. Suggest to the user: _"Consider moving vendor reference documents to `ai/raw/vendor-docs.yaml` as URL references instead, so they are linked (not consumed) in `vendor-spec.md §6`."_

**2.2 — Load Vendor Documentation (`ai/raw/vendor-docs.yaml`)**

If this file exists, fetch each URL, extract content, and categorize by spec type:

```yaml
vendor_docs:
  - title: "ServiceNow REST API Reference"
    url: "https://docs.servicenow.com/bundle/rest-api"
    category: integration       # maps to integration-spec
    notes: "Primary API reference for Table and Import Set APIs"
  - title: "ServiceNow Upgrade Planning Guide"
    url: "https://docs.servicenow.com/bundle/upgrade-planning"
    category: migration          # maps to migration-spec
    notes: "Used for migration-spec upgrade impact assessment"
```

Valid categories: `functional`, `integration`, `data-model`, `security`, `deployment`, `migration`, `vendor`, `customization`, `general`.

For each URL:
- Fetch the page content and extract relevant information.
- If a URL is unreachable, log a warning and proceed. **Never block generation because a vendor URL is down.**
- Store fetched content tagged with its category for use during spec generation.

**2.3 — Ask User for Additional Inputs**

Prompt the user:

> Do you have any additional documentation I should reference? This could include:
>
> - Confluence pages (provide URLs)
> - Internal wiki pages
> - Architecture decision records
> - Integration documentation
> - Customization inventories or exports
> - Security configuration documents
> - Upgrade history records
> - Any other reference material
>
> **Note:** I have already loaded documents from `ai/raw/` and vendor documentation from `ai/raw/vendor-docs.yaml`.
>
> If you provide URLs, I will fetch and incorporate them. If you have local files, provide the file paths.
>
> If none are available, I will generate specs from the loaded context (with `[TBD]` for gaps).

For each source provided:
- **URLs (Confluence, wiki, etc.):** Fetch content. If authentication is required, check `local.config` for PAT.
- **Local file paths:** Read and extract content.
- **Existing repo files:** Read from the workspace.
- **None provided:** Proceed with loaded context.

**2.4 — Summarize Loaded Context**

Present what was loaded:

```
=== Documentation Context Loaded ===

From ai/raw/ (primary platform input):
  1. [ai/raw] architecture-overview.md — 2,400 words
  2. [ai/raw] integration-map.md — 1,800 words
  3. [ai/raw] customization-inventory.md — 3,200 words
  4. [ai/raw] upgrade-history.md — 900 words

From vendor documentation (ai/raw/vendor-docs.yaml):
  5. [Vendor URL] "ServiceNow REST API Reference" — 1,500 words (category: integration)
  6. [Vendor URL] "ServiceNow Upgrade Guide" — 800 words (category: migration)

Additional sources:
  7. [Confluence] "SNOW Platform Architecture" — 2,100 words

These will be mapped to spec sections during generation.
```

If very little context was loaded, warn:

```
WARNING: Limited input context loaded. The generated specs will contain many [TBD] sections.
Consider adding documentation to ai/raw/ before running this skill.
Proceeding with available context.
```

---

### Step 3 — Map Inputs to Sections & Identify Gaps

Before generating any files, map the loaded inputs to specific sections of each target file and identify gaps.

**3.1 — Input-to-Section Mapping**

For each file in the resolved set, determine which loaded inputs provide content for which sections. Use this mapping:

| File | Primary Inputs | Secondary Inputs |
|------|---------------|-----------------|
| `PLATFORM.md` | RAW docs, User answers | Vendor docs, JIRA, Confluence |
| `customization-spec.md` | Platform exports, RAW docs | User answers |
| `integration-spec.md` | Platform exports, RAW docs | CMDB, Confluence |
| `data-model-spec.md` | Platform exports, RAW docs | Vendor docs |
| `migration-spec.md` | RAW docs, User answers | CMDB, JIRA |
| `security-spec.md` | CMDB, Platform exports | RAW docs, User answers |
| `CHANGELOG.md` | Auto-generated | — |
| `functional-spec.md` | RAW docs, User answers | JIRA, Confluence, Vendor docs |
| `deployment-spec.md` | RAW docs, Platform exports | CMDB |
| `vendor-spec.md` | Vendor docs, RAW docs | User answers |

| `process-catalog.md` | RAW docs, Confluence | User answers, JIRA |
| `support-log.md` | JIRA, RAW docs | User answers |

**3.2 — Gap Report**

Present sections with no input coverage:

```
=== Input Coverage Report ===

customization-spec.md:
  §1 Customization Overview   -> COVERED (from ai/raw/customization-inventory.md)
  §2 Custom Objects & Fields  -> COVERED (from metadata export)
  §3 Custom Code & Logic      -> COVERED (from ai/raw/code-inventory.md)
  §7 Technical Debt Register  -> GAP — needs team assessment
  §8 Customization Dep Map    -> PARTIAL — needs validation

migration-spec.md:
  §3 Vendor Upgrade History   -> GAP — no historical records found
  §7 Rollback Plan            -> GAP — needs operational input

security-spec.md:
  §4 Certificates             -> GAP — expiry dates not found in loaded docs
```

**3.3 — Proceed or Pause**

Ask the user:

> I found **{N}** sections with no input coverage across the resolved file set. Options:
> 1. **Proceed** — I'll generate all files, marking gaps as `[TBD — needs: {input type}]`
> 2. **Add more inputs** — provide additional documentation and I'll re-scan
>
> Which would you prefer?

---

### Step 4 — Generate `PLATFORM.md` (Always First)

**Output file:** `{output_dir}/PLATFORM.md`

`PLATFORM.md` follows strict business-language rules:

- **Sections 1-8:** Written for business readers — zero technology mentions. No framework names, no API protocols, no database engines, no deployment details.
- **Section 9:** Technology permitted ONLY in this final section, as a brief summary linking to spec files.
- **Audience test:** If a sentence requires engineering knowledge to understand, it belongs in a spec file, not `PLATFORM.md`.
- **Length target:** 400-800 lines (10-15 minute read).

**4.1 — Set Frontmatter**

```yaml
---
type: platform
version: "1.0"
name: "[Platform Name]"
slug: "[platform-slug]"
pod_group: "[pod-group-slug]"
domain: "[domain-slug]"
lifecycle: "[lifecycle-slug]"
status: "[draft | active | inactive]"
platform_lead: "[Full Name]"
last_updated: "YYYY-MM-DD"
entity_type: "Platform"
pod_type: "3PP"
vendor: "[Vendor Name]"
vendor_product: "[Product Name]"
platform_type: "[Functional | Technical]"
orientation: "[Vertical | Horizontal | Infrastructure]"
hosting: "[SaaS | Dell-hosted | Hybrid]"
depends_on: []
depended_on_by: []
---
```

**4.2 — Section 1: Purpose & Mission**

2-3 sentences answering: What platform does this team manage? Why does Dell use it? What business outcome does it enable?

Write as if explaining to a new VP who just joined Dell. NO technology.

**4.3 — Section 2: Business Sub-Domain & Scope**

Position the platform within Dell's business landscape. Define which vendor modules/capabilities this platform entity covers and what it does NOT cover.

**4.4 — Section 3: Key Business Entities**

List the core business concepts Dell manages ON this platform. These are domain concepts, not database tables. Use plain domain language.

Include a simplified Mermaid `erDiagram` showing top-level business entities — no attributes, no technical types.

**4.5 — Section 4: Key Flows & Processes**

For each major business flow (3-5 maximum), provide:
- 2-4 sentence business narrative
- Mermaid `flowchart` with business-level nodes only (actors and outcomes, never technical components)

**4.6 — Section 5: Collaborations**

Two tables:
- **Within the platform boundary:** Internal teams/capabilities
- **Outside the platform:** External business counterparts (other pods, platforms, external parties)

Describe interactions in business terms only.

**4.7 — Section 6: Success Metrics**

KPIs, SLAs, and business outcomes this platform enables.

**4.8 — Section 7: Risks & Constraints**

Known limitations, vendor constraints affecting Dell, capacity risks.

**4.9 — Section 8: Glossary**

5-15 domain terms. Vendor terminology translated to Dell language. Plain-English definitions only.

**4.10 — Section 9: Further Reading**

Link to each generated spec file with a one-line summary. This is the ONLY section where technology terms are permitted.

**Formatting rules for PLATFORM.md:**

- Length target: 400-800 lines.
- Zero technology mentions in sections 1-8.
- Before saving, search the draft for technical keywords (`REST`, `API`, `gRPC`, `Kafka`, `database`, `SQL`, `Java`, `Docker`, `Kubernetes`, `Apex`, `SOQL`, `PL/SQL`, `ABAP`, etc.). If any appear outside §9, rewrite or delete.
- Include 3-5 Mermaid diagrams maximum with business-level nodes only.
- Every section must derive from actual evidence — `ai/raw/` docs, loaded context, inferences. No filler.

---

### Step 5 — Generate Core Spec Files

Generate in **dependency order** — each file may reference entities from earlier files:

1. `data-model-spec.md` — foundation: entities referenced by other specs
2. `customization-spec.md` — references data model entities
3. `integration-spec.md` — references data model entities and customizations
4. `security-spec.md` — references integrations for service accounts
5. `migration-spec.md` — references customizations for upgrade impact

For each file, follow the section structure defined in this skill document.

**Mark sections with insufficient input as `[TBD — needs: {input type}]`** so teams know exactly what to fill.

**5.1 — Generate `data-model-spec.md`**

**Output file:** `{output_dir}/data-model-spec.md`

Sections:
1. **Entities / Tables** — Dell's custom objects + Dell-modified standard objects. For each: field name, type, constraints, origin (vendor/Dell). For platforms, distinguish vendor standard objects from Dell custom objects.
2. **Relationships** — Vendor relationships + Dell-created relationships. Include Mermaid `erDiagram`. Annotate vendor vs Dell-created relationships.
3. **Indexes** — Dell-created indexes only (not vendor auto-managed).
4. **Enums & Reference Data** — Dell-configured picklists, lookup values, status codes.
5. **Data Lineage** — Source → transforms → target. Mermaid flowchart.
6. **Data Classification** — Sensitivity per entity/field: PII, confidential, internal, public.

**5.2 — Generate `customization-spec.md`**

**Output file:** `{output_dir}/customization-spec.md`

Sections:
1. **Customization Overview** — Summary counts table.
2. **Custom Objects & Fields** — Dell-created objects + Dell-added fields on vendor standard objects.
3. **Custom Code & Logic** — Programmatic extensions (Apex, PL/SQL, ABAP, scripts).
4. **Declarative Automations** — Flows, workflows, process builders, approval processes, assignment rules.
5. **UI Customizations** — Custom pages, components, layouts, apps.
6. **Reports & Analytics** — Custom reports, dashboards.
7. **Technical Debt Register** — Deprecated patterns, unsupported customizations, performance risks.
8. **Customization Dependency Map** — What breaks if a customization changes. Mermaid diagram.

**5.3 — Generate `integration-spec.md`**

**Output file:** `{output_dir}/integration-spec.md`

This is the **most critical** spec for platforms — it captures the enterprise wiring diagram.

Sections:
1. **Overview** — Integration landscape summary: total count, dominant patterns.
2. **Integration Summary Tables** — Quick-reference tables: direction, counterparty, protocol, data.
3. **Inbound Integrations** — Systems feeding data INTO this platform. Per integration: source, protocol, auth, data, frequency, volume, owner, SLA.
4. **Outbound Integrations** — Systems this platform feeds data TO.
5. **Bidirectional / Sync Integrations** — Two-way real-time data flows.
6. **Event / Message Integrations** — Kafka topics, platform events, webhooks, CDC streams.
7. **Batch / ETL Integrations** — Scheduled data movements.
8. **Integration Dependencies** — Certificates, middleware, connection strings, service accounts, shared stores — things that break silently.

**5.4 — Generate `security-spec.md`**

**Output file:** `{output_dir}/security-spec.md`

Sections:
1. **Authentication** — SSO config (SAML/OIDC), identity federation (Dell IdP → vendor), vendor API auth (OAuth, certificate auth, service accounts).
2. **Authorization** — Dell's role hierarchy, custom permission sets, field-level security, profile-based access.
3. **Data Protection** — Encryption at rest/transit, data masking, DLP policies.
4. **Service Accounts & Certificates** — Integration service accounts, certificates WITH EXPIRY DATES, rotation policies, credential storage location.
5. **Compliance & Audit** — Audit logging config, compliance controls (SOX, PCI, GDPR), access reviews.
6. **Security Dependencies** — What this platform's security depends on: IdP, CA, secrets manager, firewall rules.

**5.5 — Generate `migration-spec.md`**

**Output file:** `{output_dir}/migration-spec.md`

Sections:
1. **Current State** — Current vendor version, Dell customization baseline count, last upgrade date.
2. **Environment Inventory** — All environments: prod, sandbox, dev, UAT, DR. URL, version, purpose, last refreshed.
3. **Vendor Upgrade History** — Past upgrades: date, from/to version, impact level, issues encountered, resolution, effort.
4. **Upcoming Migrations** — Planned: name, type, target date, estimated effort, risk, dependencies.
5. **Impact Assessment Framework** — What to check per change type, checklist by spec file.
6. **Pre-Migration Checklist** — Steps before any migration (accrued from lessons learned).
7. **Rollback Plan** — Standard rollback procedure, decision criteria, time window.
8. **Post-Migration Validation** — Automated tests, manual checks, SLA verification.

---

### Step 6 — Generate Conditional Spec Files

For each conditional file in the resolved set, generate using the same approach: follow the section structure defined in this skill document, use mapped inputs, mark gaps as `[TBD]`.

**6.1 — Generate `functional-spec.md` (if resolved)**

**Output file:** `{output_dir}/functional-spec.md`

Sections:
1. **Overview** — What Dell uses this for, active modules, scope.
2. **Actors / Personas** — Who interacts: Dell users by role, integrations, batch jobs, vendor admin.
3. **Features & Use Cases** — Grouped by Dell business process (not vendor module). Feature, actors, step-by-step use cases.
4. **Business Rules** — Vendor-enforced + Dell-configured. Numbered (BR-001), traceable to features.
5. **Functional Flows** — Mermaid diagrams of Dell's business processes on the platform.
6. **Error Handling & Exceptions** — How Dell handles exceptions, manual overrides, approval paths.
7. **Data Dictionary** — Business definitions (distinct from data-model-spec's technical fields).

**6.2 — Generate `deployment-spec.md` (if resolved)**

**Output file:** `{output_dir}/deployment-spec.md`

Only for platforms where Dell manages infrastructure. NOT for pure SaaS.

Sections:
1. **Build & Package** — Build tools, artifact type, vendor-specific tools (SFDX, Copado).
2. **Containerization** — Docker/container config for Dell middleware.
3. **Orchestration** — K8s manifests, Helm charts, resource limits, health checks, HPA.
4. **CI/CD Pipeline** — Stages, deployment strategy, promotion, approval gates.
5. **Environment Configuration** — Environment-specific settings, feature flags, IaC.
6. **Observability** — Monitoring, logging, alerting for Dell's infrastructure.
7. **Vendor-Specific Deployment** — Change sets, sandbox promotion, release management.

**6.3 — Generate `vendor-spec.md` (if resolved)**

**Output file:** `{output_dir}/vendor-spec.md`

NOT product documentation. Only: how change works, what the limits are, what's coming.

Sections:
1. **Vendor Product Profile** — Identity card: vendor, product, version, license tier, contract renewal, support tier.
2. **Vendor Module Structure** — Modules, Dell usage status (active/planned/not licensed/deprecated), customization level per module.
3. **Change Management Model** — How change happens: config, code, vendor-managed, mandatory releases — with typical lead times.
4. **Vendor Constraints & Limitations** — API limits, governor limits, unsupported patterns, data limits.
5. **Vendor Upgrade & Roadmap** — Release cycle, upcoming deprecations, feature retirements, mandatory deadlines.
6. **External Documentation References** — Links to vendor docs (NOT duplicated content).

**6.4 — Generate `process-catalog.md` (if resolved)**

**Output file:** `{output_dir}/process-catalog.md`

Sections:
1. **Overview** — What processes this platform manages, scope.
2. **Process Inventory** — Process name, description, owner, frequency, teams impacted.
3. **Process Details** — Per critical process: steps, actors, tools, metrics, SLAs.
4. **Standards & Governance** — Standards this platform enforces across the org.
5. **Process Change Impact** — How a process change ripples across the organization.

**6.5 — Generate `support-log.md` (if resolved)**

**Output file:** `{output_dir}/support-log.md`

Sections:
1. **Overview** — Support model, request channels.
2. **Support Request Log** — Date, requestor, description, resolution, effort.
3. **Demand Patterns** — Recurring request types, seasonal patterns, volume trends.
4. **Escalation Trends** — What gets escalated, why, resolution patterns.

---

### Step 7 — Generate Infrastructure Files

**7.1 — Generate `AGENTS.md`**

**Output file:** Workspace root `AGENTS.md` (mandatory, populated — never empty/template).

Key sections:
1. Project Overview — platform name, vendor, pod_type (3PP), type, classification
2. Architecture Overview — platform architecture, Dell's middleware layer
3. Technology Stack Summary — vendor platform + Dell-side tech
4. Build, Test, Run Commands — vendor-specific + Dell-side
5. Platform Knowledge Reference — links to all generated specs with one-line summaries
6. Constitution & Governance — from `ai/harness/CONSTITUTION.md` if present
7. Git & Branching Conventions
8. Domain Quick Reference — 5-10 core domain concepts, key entities, primary flows
9. LEARNINGS.md — Secondary Memory section (see 7.2 below)
10. Security & Safety — never commit secrets, tokens, API keys; use `<REDACTED>` placeholders
11. Knowledge Base (LLM Wiki) — how AI agents should use the `ai/` directory structure

**7.2 — Generate `LEARNINGS.md`**

**Output file:** Workspace root `LEARNINGS.md`

If the file already exists, **preserve it** — do not overwrite. Only create if absent.

If absent, create with standard sections: Codebase Patterns, Gotchas & Pitfalls, User Preferences, Feature Learnings, Execution Log. Include update rules: append-only (never overwrite or compact), include discoveries, corrections, patterns, pitfalls, and design decisions.

**7.3 — Append `CHANGELOG.md` Entry**

**Output file:** `{output_dir}/CHANGELOG.md`

This step is **mandatory**. Append a new entry at the top (newest-first convention):

```markdown
## {ISO-8601 UTC timestamp} — /create-platform-knowledge

- **Author:** {resolved from git config, env vars, or skill param}
- **Trigger:** Initial platform knowledge-base generation
- **Platform:** {platform_name} ({vendor} {vendor_product})
- **Classification:** {orientation} / {hosting}
- **Files generated / updated:**
  - PLATFORM.md
  - customization-spec.md
  - integration-spec.md
  - {... all generated files}
- **Documentation sources referenced:** {count}
- **[TBD] sections:** {count} sections require manual input
- **Notes:** {any overrides, skipped steps, or assumptions}
```

---

### Step 8 — Cross-Validation

Before finalizing, run automated consistency checks across all generated files:

| Check | Rule | Action if violated |
|-------|------|--------------------|
| Custom objects | Every custom object in `customization-spec.md` §2 must appear in `data-model-spec.md` §1 | Add missing entity to data-model-spec |
| Integration data | Every integration in `integration-spec.md` §3-7 should have related entities in `data-model-spec.md` | Flag as warning |
| Service accounts | Every service account in `security-spec.md` §4 should appear in `integration-spec.md` §8 | Flag as warning |
| Vendor modules | Every vendor module in `vendor-spec.md` §2 should be referenced in `PLATFORM.md` §2 or `functional-spec.md` §1 | Flag as warning |
| Environments | Every environment in `migration-spec.md` §2 should have auth details in `security-spec.md` §1 | Flag as warning |
| Customization count | Overview count in `customization-spec.md` §1 must match actual items in §2-6 | Auto-fix count |

Report findings:

```
=== Cross-Validation Results ===
PASS: 4 custom objects in customization-spec all appear in data-model-spec
PASS: 10 integrations have related data entities
WARN: Service account "sfdc-integration-user" in security-spec not found in integration-spec §8
WARN: Environment "Dev Sandbox 2" in migration-spec not in security-spec §1
AUTO-FIX: Updated customization overview count from 12 to 15 (3 items added during generation)
```

---

### Step 9 — Summary & Handoff

Present the final summary:

```
=== Platform Knowledge Generated ===

Platform: {platform_name} ({vendor} {vendor_product})
Classification: {orientation} / {hosting}
Location: ai/knowledge/
Files generated: {count}

Section completion:
  Complete sections: {N}/{total}
  [TBD] sections: {M} (require manual team input)

Top [TBD] items requiring team input:
  1. migration-spec.md §3 — Vendor Upgrade History (no historical records found)
  2. customization-spec.md §7 — Technical Debt Register (needs team assessment)
  3. security-spec.md §4 — Certificate expiry dates (not in loaded docs)
  4. ...

Cross-validation: {pass_count} passed, {warn_count} warnings

Next steps:
  1. Review PLATFORM.md with business stakeholders
  2. Fill [TBD] sections with team knowledge
  3. Run /update-platform-knowledge after filling gaps
  4. Add new documentation to ai/raw/ for future updates
```

---

## Quality Rules

### QR-1: Impact-Centric, Not Product-Centric

Every section must capture **Dell's footprint** on the vendor platform, not the vendor's product documentation. Before writing any content, apply this test: "Does this describe what Dell has done, or what the vendor's product is?" If the latter, either rewrite to focus on Dell's usage or omit.

### QR-2: Business Language in PLATFORM.md

Sections 1-8 of `PLATFORM.md` must contain zero technology mentions. Before saving, grep the draft for technical keywords and rewrite any violations.

### QR-3: No Vendor Documentation Duplication

Never duplicate vendor product documentation in the generated specs. Link to vendor docs in `vendor-spec.md` §6 (External Documentation References). The generated specs capture Dell's implementation USING the vendor product, not the product itself.

### QR-4: Classification Determines File Set

The file set is determined by the resolution table in Step 1.4. Do not generate files that are not in the resolved set unless the user explicitly overrides.

### QR-5: `[TBD]` Over Fabrication

If input is insufficient for a section, mark it `[TBD — needs: {input type}]`. **Never fabricate content** to fill gaps. Fabricated platform knowledge is worse than no knowledge — it creates false confidence that leads to missed impacts during upgrades and program launches.

### QR-6: Dependency Order

Generate specs in the dependency order specified in Step 5. Later specs may reference entities, customizations, and integrations defined in earlier specs.

### QR-7: Cross-Spec Consistency

After generation, run the cross-validation checks in Step 8. Auto-fix where possible, flag warnings for the rest.

### QR-8: Frontmatter Required

Every generated spec file must include YAML frontmatter with at minimum: `type`, `version`, `entity_name`, `entity_type`, `pod_type`, `vendor`, `vendor_product`, `last_updated`.

### QR-9: Mermaid Diagrams

All Mermaid diagrams must render correctly. Use business-level labels in `PLATFORM.md` diagrams and technical labels in spec file diagrams. Limit diagrams to one concern per diagram.

### QR-10: CHANGELOG is Mandatory

The `CHANGELOG.md` entry in Step 7.3 must always be appended, even on re-runs or partial regenerations. Skipping it breaks the audit trail.

### QR-11: LEARNINGS.md is Preserved

If `LEARNINGS.md` already exists at the workspace root, preserve its contents. Only create it if absent.

### QR-12: Sensitivity in Security Spec

Never write actual secrets, passwords, tokens, or certificate private keys in any generated file. Use `<REDACTED>` placeholders. Certificate expiry dates and service account names are acceptable; credential values are not.

### QR-13: Vendor Document Intake Gate

Every document consumed from `ai/raw/`, user-provided URLs, or user-provided file paths must pass the Vendor Document Gate (Step 2.1A) before full analysis. Vanilla vendor documents — product manuals, admin guides, API references, feature overviews — that describe the vendor's product without Dell-specific context must be rejected at intake, not consumed and filtered during generation. This saves token budget and prevents vendor content contamination. The gate uses lightweight screening (first ~50 lines only) to minimize cost. Rejected documents should be suggested for relocation to `ai/raw/vendor-docs.yaml` as URL references instead.

---

## PLATFORM.md Detailed Template

The following defines the complete structure for `PLATFORM.md`.

### Frontmatter

See Step 4.1 above for the complete frontmatter schema.

### Section Templates

**Section 1: Purpose & Mission**

```markdown
## 1. Purpose & Mission

{2-3 sentences: What vendor platform does this team manage? Why does Dell use
this platform (what business need)? What business outcome does it enable?

Write as if explaining to a new VP who just joined Dell.

Example (do not copy): "Dell uses Salesforce Sales Cloud as the primary system
for managing the end-to-end sales process — from initial lead capture through
opportunity management to deal closure. The platform enables Dell's global sales
organisation to maintain a single, consistent view of every customer interaction
and forecast revenue accurately."}
```

**Section 2: Business Sub-Domain & Scope**

```markdown
## 2. Business Sub-Domain & Scope

**Business domain:** {The broader domain — e.g., "Revenue Management",
"IT Operations", "Developer Tooling"}

**Platform scope:** {What this platform entity covers — which vendor
modules/capabilities, which business processes}

**In scope:** {Business activities and capabilities this platform is responsible for}

**Out of scope:** {What is explicitly NOT covered by this platform entity}
```

**Section 3: Key Business Entities**

```markdown
## 3. Key Business Entities We Manage

{High-level view of the core business concepts Dell manages ON this platform.
These are domain concepts — NOT database tables or vendor object API names.}

| Entity | What it represents | Lifecycle |
|--------|--------------------|-----------|
| {Business entity} | {What it means in the business} | {e.g., "Draft -> Active -> Closed"} |
```

Include a simplified Mermaid `erDiagram` — business entities only, no attributes.

**Section 4: Key Flows & Processes**

```markdown
## 4. Key Business Flows

{3-5 major business flows. For each: 2-4 sentence narrative + Mermaid flowchart
with business-level nodes only.}
```

**Section 5: Collaborations**

```markdown
## 5. Who This Platform Works With

### 5.1 — Within the platform boundary
| Works with | Nature of interaction | What it enables |
|------------|-----------------------|-----------------|

### 5.2 — Outside the platform
| Direction | Counterpart | Nature of interaction | What it enables |
|-----------|-------------|-----------------------|-----------------|
```

**Section 6-9:** Follow the structure defined in Step 4.6-4.10 above.

---

## `ai/raw/` Directory Guidance

For platforms, the `ai/raw/` directory is the **primary input source**. Guide platform teams to populate it with:

```
ai/raw/
├── vendor-docs.yaml              <- URLs to vendor documentation to fetch
├── architecture-overview.md      <- Platform architecture description
├── integration-map.md            <- All integrations in/out documentation
├── customization-inventory.xlsx  <- Export from vendor admin
├── data-dictionary.md            <- Business data definitions
├── upgrade-history.md            <- Past upgrade records and post-mortems
├── security-config.md            <- SSO, certificates, service accounts
├── process-docs/                 <- Business process documentation
|   ├── order-process.md
|   └── approval-workflow.md
├── runbooks/                     <- Operational runbooks
|   ├── upgrade-runbook.md
|   └── incident-response.md
└── vendor-releases/              <- Vendor release notes (for update skill)
    ├── spring-26-release-notes.md
    └── summer-26-preview.md
```

### `ai/raw/vendor-docs.yaml` Format

```yaml
vendor_docs:
  - title: "Descriptive title"
    url: "https://docs.vendor.com/..."
    category: integration    # functional | integration | data-model | security |
                             # deployment | migration | vendor | customization | general
    notes: "Why this doc matters for Dell's knowledge"
```

---

## `ai/platform-info.yaml` Format

Pre-populate this file to skip the classification step:

```yaml
# Platform classification for the create-platform-knowledge skill.
# See the classification model in the skill's Step 1 workflow.

platform_name: "Salesforce Sales Cloud"
vendor: "Salesforce"
vendor_product: "Sales Cloud"

# POD Type: 3PP (3rd-party platform) — always 3PP for this skill
pod_type: 3PP

# Orientation: Vertical | Horizontal | Infrastructure
orientation: Vertical

# Hosting: SaaS | Dell-hosted | Hybrid
hosting: SaaS

# Optional overrides: add/remove files from the resolved set
include_additional:
  - deployment-spec.md    # include even though SaaS (Dell middleware exists)
exclude: []
```
