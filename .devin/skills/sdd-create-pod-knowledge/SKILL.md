# Skill: create-pod-knowledge

> Generate a **mandatory** `POD.md` executive summary of the POD, plus comprehensive POD specification documents (functional, technical, data model, API, integration, security, deployment, NFR) by analyzing the workspace's codebase. Optionally generates an `AGENTS.md` workspace context file and a `LEARNINGS.md` secondary memory template.

---

## Purpose

This skill analyses a workspace's codebase — its Git projects, languages, frameworks, modules, configuration, tests, and documentation — and produces up to eight specification documents that fully describe the project. Each spec is written as a standalone Markdown file in `ai/knowledge/` (or a user-chosen directory). Human-written documentation (domain guides, architecture docs, requirements, onboarding material, etc.) lives in `ai/raw/` and is automatically loaded as input context during knowledge generation, enriching the AI-derived specs with business and domain understanding.

Additionally, it **must** generate an `AGENTS.md` file at the workspace root that serves as the primary context document for AI agents and a `LEARNINGS.md` template for persistent cross-session memory.

Supported spec types:

1. **POD.md** — concise executive summary of the POD's purpose, sub-domain, business entities, and flows (readable in 10–15 minutes). _(mandatory — see Step 15 and Important Rule #2)_
2. **Functional Specs** — includes functional flows and variations as Mermaid diagrams
3. **Technical Specs**
4. **Data Model Specs**
5. **API Specs**
6. **Integration Specs**
7. **Security Specs**
8. **Deployment / Infrastructure Specs**
9. **Non-Functional Requirements (NFR) Specs**

Additional outputs:

10. **AGENTS.md** — workspace context file for AI agents (**mandatory** — must be populated, not empty/template)
11. **LEARNINGS.md** — secondary memory template

---

## Prerequisites

- The current working directory is the root of a workspace containing one or more Git repositories (or a single repo root).
- The repository/repositories contain source code, configuration, and/or documentation to analyse.
- Write access to the output directory (default `ai/knowledge/`).
- Optional: Human-written documentation in `ai/raw/` (domain guides, architecture docs, requirements docs, onboarding material). If present, these are automatically loaded as additional context. **If `ai/raw/` is empty or does not exist, the skill proceeds normally — all specs are derived entirely from codebase analysis.**

---

## Skill Steps

### Step 1 — Collect Functional Documentation References

Before analysing code, check for human-written documentation in `ai/raw/` and ask the user whether they have any additional documentation that should be used as reference material for generating the specs. This ensures the specs incorporate domain knowledge that may not be directly visible in the codebase.

**1.1 — Load `ai/raw/` (Primary Default Location)**

The `ai/raw/` directory is the designated location for human-authored reference material that enriches the AI-generated knowledge. Check if it exists and load any files found there. If empty or absent, skip silently and continue.

```bash
# Check if ai/raw/ exists and list its contents
if [ -d "ai/raw" ]; then
  find ai/raw/ -type f \( -name "*.md" -o -name "*.txt" -o -name "*.pdf" -o -name "*.docx" -o -name "*.adoc" -o -name "*.rst" \) | sort
fi
```

Expected types of documents in `ai/raw/`:
- **Domain guides** — business domain overviews, glossaries, domain model descriptions
- **Architecture docs** — high-level architecture decisions, system context diagrams, ADRs
- **Requirements docs** — PRDs, functional requirements, user stories, acceptance criteria
- **Onboarding docs** — team onboarding guides, developer setup guides, coding conventions
- **API documentation** — external API references, integration guides, contract specs
- **UI/UX designs** — Figma exports, wireframes, mockups, screen flows, design system documentation (for UI applications)
- **Any other human-written reference material** — meeting notes, design proposals, technical RFCs

If `ai/raw/` exists and contains files, read all files and store their content as documentation context. These are human-authored inputs — treat them as high-value domain context for enriching the generated specs.

**1.2 — Ask the User for Additional Documentation**

Prompt the user:

> Do you have any additional documentation I should reference? (Confluence URLs, wiki pages, PRDs, ADRs, Swagger/OpenAPI files, Figma designs, domain guides, or any other reference material.)
>
> I have already loaded any documents found in `ai/raw/`. Provide URLs or file paths, or say "none" to proceed with codebase analysis.

**1.3 — Load Additional Documentation**

For each additional documentation source the user provides:

- **URLs (Confluence, wiki, etc.)**: Fetch the page content and extract the relevant information. If authentication is required, check `local.config` for the appropriate PAT (e.g., `CONFLUENCE_PAT`).
- **Figma URLs**: If the user provides Figma links, attempt to fetch the page and extract visual context (component names, screen names, layout descriptions). If the Figma URL is not publicly accessible, ask the user to export the relevant frames as images or PDFs and place them in `ai/raw/`. Describe the UI structure, components, navigation flows, and design patterns visible in the designs.
- **Local file paths**: Read the files and extract relevant content.
- **Existing repo files**: If the user points to files already in the repo (e.g., `docs/`, `README.md`, existing specs), read them.
- **None provided**: Proceed — codebase analysis (plus any `ai/raw/` content already loaded) is sufficient.

Store all loaded documentation context (from `ai/raw/` and user-provided sources) for reference during spec generation in subsequent steps.

**1.4 — Summarise Loaded Context**

If documentation was provided (from `ai/raw/` and/or user-provided sources), present a brief summary:

```
=== Documentation Context Loaded ===

From ai/raw/ (human-authored input docs):
  1. [ai/raw] domain-overview.md — 1,200 words
  2. [ai/raw] architecture-decisions.md — 950 words
  3. [ai/raw] onboarding-guide.md — 2,100 words

Additional sources:
  4. [Confluence] "DL Guide - Architecture Overview" — 2,450 words
  5. [Local file] docs/domain-model.md — 890 words
  6. [Repo file] README.md — 340 words

These will be cross-referenced with codebase analysis during spec generation.
```

If no documentation was loaded, confirm briefly and proceed immediately.

### Step 2 — Discover & Confirm Workspace Git Projects

Before diving into project structure, identify all Git repositories in the workspace and present them to the user for confirmation.

**2.1 — Scan for Git Repositories**

```bash
# Find all Git repositories in the workspace (top-level directories containing .git)
for dir in */; do
  if [ -d "$dir/.git" ]; then
    echo "$dir"
  fi
done
```

For each discovered Git repository, collect:

| Field | How to Detect |
|-------|---------------|
| **Project name** | Directory name |
| **Remote URL** | `git -C <dir> remote get-url origin 2>/dev/null` |
| **Current branch** | `git -C <dir> branch --show-current` |
| **Last commit** | `git -C <dir> log -1 --format="%h %s" 2>/dev/null` |
| **Primary language** | Scan for `pom.xml` (Java), `package.json` (Node.js), `Cargo.toml` (Rust), `go.mod` (Go), `requirements.txt`/`pyproject.toml` (Python), `CMakeLists.txt` (C/C++), etc. |
| **Framework** | Parse build files for framework indicators (Spring Boot, React, NestJS, Django, etc.) |
| **Build tool** | Maven, Gradle, npm, cargo, make, etc. |
| **Module count** | Count sub-modules (e.g., `pom.xml` modules, workspace packages) |
| **Has tests** | Check for test directories |
| **Description** | Parse from `README.md` first line or project description in build file |

**2.2 — Present Project Inventory to User**

Display the discovered projects in a table and ask the user to confirm:

```
=== Workspace Git Projects ===

Found N Git repositories in the workspace:

| # | Project           | Language   | Framework         | Build Tool | Modules | Remote                         |
|---|-------------------|------------|-------------------|------------|---------|--------------------------------|
| 1 | backend-api          | Java 21    | Spring Boot 3.5.6 | Maven      | 14      | git.example.com/.../backend-api   |
| 2 | integration-service  | Python 3.12| FastAPI 0.104      | pip        | 3       | git.example.com/.../integration   |
| 3 | query-service        | TypeScript | NestJS 10.x       | npm        | 5       | git.example.com/.../query-svc     |
| ...                                                                                                                |

(These are examples — the skill auto-detects the project's actual technology stack)

Which projects should I include in the spec generation?
  [A] All projects (default)
  [B] Select specific projects (provide numbers)
  [C] Exclude specific projects (provide numbers)
```

**2.3 — Record Confirmed Scope**

Store the user's selection. Only analyse confirmed projects in subsequent steps. If the user added or removed projects, respect their choices.

**2.4 — Generate `.gitmodules` File**

After confirming the project scope, generate (or update) a `.gitmodules` file at the workspace root that registers every confirmed Git project as a submodule. This enables the pod workspace root to track all project repositories as Git submodules, making it easy to clone the entire pod workspace with a single `git clone --recurse-submodules` command.

For each confirmed project, write a submodule entry with:
- **`path`** — the project's directory name relative to the workspace root
- **`url`** — the project's `origin` remote URL
- **`branch`** — the project's current branch (typically `develop` or `main`)

```ini
[submodule "<project-name>"]
	path = <project-directory>
	url = <origin-remote-url>
	branch = <current-branch>
```

**Example `.gitmodules`:**

```ini
[submodule "backend-api"]
	path = backend-api
	url = https://git.example.com/team/backend-api.git
	branch = develop

[submodule "query-service"]
	path = query-service
	url = https://git.example.com/team/query-service.git
	branch = develop

[submodule "ai"]
	path = ai
	url = https://git.example.com/team/ai.git
	branch = develop
```

**Rules:**
- Always include the `branch` entry — this tells `git submodule update --remote` which branch to track.
- If the workspace root already has a `.gitmodules` file, merge the discovered projects into it — do not overwrite entries for projects that already exist unless their remote URL has changed.
- If the workspace root is not itself a Git repository, initialise one first (`git init`) and inform the user.
- Include the `ai/` repository if it exists as a separate Git project in the workspace.

### Step 3 — Discover Project Structure

For each confirmed project, scan to build a comprehensive understanding before generating specs.

**3.1 — Languages & Frameworks**

```bash
# Identify primary languages by file extension counts
find . -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -20

# Look for framework indicators
cat pom.xml package.json build.gradle settings.gradle requirements.txt Gemfile go.mod Cargo.toml 2>/dev/null
```

**3.2 — Module / Package Layout**

```bash
# Map top-level and second-level directory structure
find . -maxdepth 2 -type d | grep -v '\.git' | sort

# For Java/Kotlin projects, list all modules
find . -name "pom.xml" -o -name "build.gradle" | sort
```

**3.3 — Configuration Files**

Locate and read all configuration files: `application.yml`, `application.properties`, `.env`, `docker-compose.yml`, `Dockerfile`, `Makefile`, CI/CD pipelines (`.gitlab-ci.yml`, `.github/workflows/`), Kubernetes manifests, Terraform files, etc.

**3.4 — Tests**

```bash
# Find test directories and count test files
find . -type d -name "test" -o -type d -name "tests" -o -type d -name "__tests__" -o -type d -name "spec" | sort
find . -type f -name "*Test.*" -o -name "*Spec.*" -o -name "test_*" -o -name "*.test.*" | wc -l
```

**3.5 — Existing Documentation (not already loaded in Step 1)**

Discover in-repo documentation that was not already loaded via `ai/raw/` or user-provided sources in Step 1 (e.g., auto-discovered READMEs, inline doc comments, ADRs in `docs/adr/`). Skip files already in context from Step 1.

```bash
# Check for existing docs
find . -type f -name "*.md" -o -name "*.adoc" -o -name "*.rst" | grep -iv changelog | sort
ls -la docs/ doc/ ai/ 2>/dev/null
```

**3.6 — Build a Mental Model**

From the above and the documentation context loaded in Step 1, determine:
- Primary language(s) and framework(s)
- Architectural style (monolith, microservice, modular monolith, library, CLI tool, etc.)
- Key modules/packages and their responsibilities
- External dependencies (databases, message brokers, external APIs, cloud services)
- Build system and toolchain
- Test strategy (unit, integration, e2e)

### Step 4 — Ask User Which Specs to Generate

Present the list of eight detailed spec types and ask the user which ones to generate. **Default: all eight.** (`POD.md` is always generated regardless — see Step 15.)

Also ask for the output directory. **Default: `ai/knowledge/`.**

Also confirm whether to generate:
- **AGENTS.md** at the workspace root (default: yes)
- **LEARNINGS.md** template (default: yes, if it doesn't already exist)

```bash
# Create the output directory
mkdir -p ai/knowledge
```

If the user requests only a subset of the eight detailed specs, skip the corresponding steps below.

### Step 5 — Generate Functional Specs

**Output file:** `{output_dir}/functional-spec.md`

Analyse the codebase to identify actors, features, use cases, business rules, and functional flows. If documentation was loaded from Step 1, cross-reference it to enrich the output — but the codebase is always the primary source and is sufficient on its own. Write the spec with the following sections:

**5.1 — Overview**
- Project name and one-paragraph summary of what the system does.
- High-level goals and scope.

**5.2 — Actors / Personas**
- List every actor that interacts with the system (end users, admins, external systems, scheduled jobs, etc.).
- For each actor: name, description, and key interactions.

**5.3 — Features & Use Cases**
- Group features by domain area or module.
- For each feature:
  - **Feature name**
  - **Description** — what it does from the user's perspective.
  - **Actors involved**
  - **Preconditions**
  - **Postconditions / Expected outcomes**
  - **Use cases** — numbered list of specific scenarios (UC-001, UC-002, etc.).

**5.4 — Business Rules**
- Extract business rules from the code (validation logic, state machines, conditional branches, access control rules).
- Number each rule (BR-001, BR-002, etc.) with a clear description.

**5.5 — Functional Flows**
This section is critical. For every significant feature or use case, produce **Mermaid diagrams** showing the flow.

**5.5.1 — Happy-Path Flows**
For each major flow, create a Mermaid `sequenceDiagram` or `flowchart` showing the normal/successful path:

````markdown
```mermaid
sequenceDiagram
    participant User
    participant API
    participant Service
    participant Database

    User->>API: POST /resource
    API->>Service: validate & process
    Service->>Database: INSERT record
    Database-->>Service: OK
    Service-->>API: 201 Created
    API-->>User: 201 + resource body
```
````

**5.5.2 — Variation Flows**
For each happy-path flow, identify variations (alternate paths that still succeed but take a different route):

````markdown
```mermaid
flowchart TD
    A[Request received] --> B{Has cached data?}
    B -->|Yes| C[Return cached response]
    B -->|No| D[Fetch from database]
    D --> E[Update cache]
    E --> C
```
````

**5.5.3 — Error Flows**
For each flow, identify error/exception paths and diagram them:

````markdown
```mermaid
sequenceDiagram
    participant User
    participant API
    participant Service

    User->>API: POST /resource (invalid payload)
    API->>Service: validate
    Service-->>API: ValidationException
    API-->>User: 400 Bad Request + error details
```
````

**Formatting rules for Mermaid diagrams:**
- Use `sequenceDiagram` for request/response flows between components.
- Use `flowchart TD` (top-down) for decision trees and branching logic.
- Use `stateDiagram-v2` for state machine / lifecycle flows.
- Label every arrow with the action or message.
- Keep diagrams focused — one flow per diagram, not the entire system.
- Use participant aliases to keep diagrams readable.

### Step 6 — Generate Technical Specs

**Output file:** `{output_dir}/technical-spec.md`

**6.1 — Architecture Overview**
- Architectural style (microservices, modular monolith, etc.).
- High-level component diagram (as Mermaid `flowchart` or `C4Context`).
- Key design decisions and patterns used (CQRS, event sourcing, hexagonal, etc.).

**6.2 — Technology Stack**

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Language | e.g. Java | 17 | From `pom.xml` / `build.gradle` |
| Framework | e.g. Spring Boot | 3.x | From dependencies |
| Database | e.g. PostgreSQL | 15 | From config / docker-compose |
| ... | ... | ... | ... |

**6.3 — Module Breakdown**
For each module/package:
- Name and responsibility.
- Key classes/files and their roles.
- Dependencies on other modules.
- Public API surface.

**6.4 — Control Flow**
Trace the request lifecycle from entry point to response:
- HTTP request handling -> controller/handler -> service -> repository -> response.
- Message consumption -> handler -> processing -> acknowledgement.
- Scheduled job -> trigger -> processing -> completion.

**6.5 — Error Handling Strategy**
- Global exception handlers.
- Error response format.
- Retry policies.
- Dead-letter queues / fallback mechanisms.

**6.6 — Configuration Management**
- Configuration sources (files, environment variables, config server).
- Key configuration properties and their purpose.
- Environment-specific overrides.

**6.7 — Testing Strategy**
- Unit test framework and patterns.
- Integration test setup (testcontainers, embedded databases, etc.).
- Test coverage areas and any gaps identified.

### Step 7 — Generate Data Model Specs

**Output file:** `{output_dir}/data-model-spec.md`

**7.1 — Entities / Tables**
For each entity:
- Entity/table name.
- All fields: name, type, constraints (NOT NULL, UNIQUE, DEFAULT, etc.).
- Primary key.
- Description of what the entity represents.

**7.2 — Relationships**
- All foreign keys and associations.
- Cardinality (one-to-one, one-to-many, many-to-many).
- Join tables if applicable.
- Mermaid `erDiagram` showing all entities and relationships:

````markdown
```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    ORDER_ITEM }o--|| PRODUCT : references
```
````

**7.3 — Indexes**
- All declared indexes (from entity annotations, migration scripts, or DDL).
- Composite indexes.
- Unique constraints.

**7.4 — Enums & Reference Data**
- All enums used in the data model.
- Static reference data / lookup tables.

**7.5 — Migrations**
- Migration tool (Flyway, Liquibase, Alembic, etc.).
- List of migration scripts and what each one does.
- Current schema version.

**7.6 — ER Summary**
A complete Entity-Relationship diagram as a Mermaid `erDiagram` covering all entities, with field-level detail for key entities.

### Step 8 — Generate API Specs

**Output file:** `{output_dir}/api-spec.md`

**8.1 — API Overview**
- API style (REST, GraphQL, gRPC, etc.).
- Base URL / path prefix.
- Versioning strategy.
- Content types.

**8.2 — Endpoints**
For each endpoint:

| Field | Detail |
|---|---|
| **Method** | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` |
| **Path** | `/api/v1/resource/:id` |
| **Description** | What this endpoint does |
| **Request headers** | Required headers (auth, content-type, custom) |
| **Path parameters** | Name, type, description |
| **Query parameters** | Name, type, required/optional, description |
| **Request body** | JSON schema or example with all fields documented |
| **Response (success)** | Status code + JSON schema or example |
| **Response (error)** | Possible error codes and their meanings |
| **Authorization** | Required roles/permissions |

**8.3 — Authentication & Authorization (API-consumer view)**
- Auth mechanism from the API consumer's perspective (what headers/tokens to send, error codes on auth failure).
- _For the full auth design (identity providers, token lifecycle, authorization model, enforcement): see `security-spec.md` (Step 10)._

**8.4 — Common Patterns**
- Pagination (format, default/max page sizes).
- Filtering and sorting conventions.
- Error response format (standard error envelope).
- Rate limiting (if applicable).

**8.5 — Outbound API Clients**
- Brief list of external APIs consumed by the project (name, purpose).
- _For full outbound integration detail (connection config, retry/circuit-breaker, failure handling): see `integration-spec.md` Section 9.B._

### Step 9 — Generate Integration Specs

**Output file:** `{output_dir}/integration-spec.md`

The integration spec captures every interface the POD has with other systems. It is organised into exactly **two top-level groups**:

- **9.A — Internal Integrations** — interactions *between git repos that are part of this POD workspace* (i.e. projects listed in Step 2's workspace git projects table). Example: `backend-api` calling `query-service` over REST, both owned by this POD.
- **9.B — External Interfaces** — any interaction that *crosses the POD workspace boundary*, either inbound (consumed by other PODs or external clients) or outbound (calling systems owned by other PODs or third parties). Example: a REST endpoint exposed for another POD to consume, or a call to a vendor billing API.

> **Classification rule:** if both endpoints of an integration are owned by this POD (i.e. both repos appear in the workspace git projects table), it is **Internal**. Otherwise it is **External**. When in doubt, default to **External** and flag for review.

Every entry under either group must record the **integration type** (sync REST/gRPC, async message, shared DB, batch/ETL, file transfer, etc.) and **direction** (inbound or outbound, from this POD's perspective).

---

#### 9.A — Internal Integrations

Interactions between git repos inside this POD workspace. For each one, record: *source repo → target repo*, integration type, protocol, and purpose.

**9.A.1 — Synchronous (REST / gRPC / in-process)**
- Calling service and called service (both from this POD).
- Endpoint/method invoked, auth mechanism, timeout and retry configuration, circuit breaker settings.

**9.A.2 — Messaging & Events (internal topics/queues)**
- Producer repo and consumer repo (both from this POD).
- Broker and topic/queue name, message schema/format, consumer-group config, ordering and idempotency guarantees, dead-letter handling.

**9.A.3 — Shared Data Stores**
- Databases, caches, object stores, or search indexes shared across multiple POD repos.
- Which repos read, which write, schema ownership, access patterns, and coupling risks.

**9.A.4 — Internal Batch / ETL**
- Scheduled jobs that move data between POD repos.
- Source, target, cadence, volume, consistency strategy (eventual, transactional, saga).

---

#### 9.B — External Interfaces

Anything crossing the POD workspace boundary. For each entry, record **direction** (`inbound` = into this POD; `outbound` = out of this POD) and **counterparty** (name of the other POD, team, or third party).

**9.B.1 — Inbound APIs (external consumers → this POD)**
- REST/gRPC/GraphQL endpoints exposed to consumers outside this POD.
- Consumers (known POD names, external clients, or partner systems), auth & authorisation, SLAs, rate limits, versioning policy.
- Cross-reference `api-spec.md` for request/response schemas.

**9.B.2 — Outbound Synchronous Calls (this POD → external)**
- REST/gRPC/SOAP calls this POD makes to systems outside the workspace.
- Target system name, owner (other POD or third party), integration type, auth, connection config (with secrets redacted), timeout/retry/circuit-breaker config, failure handling.

**9.B.3 — Inbound Messaging (this POD consumes externally-published events)**
- External producer (other POD or third party), broker, topic, schema, consumer group, ordering/idempotency, DLQ strategy.

**9.B.4 — Outbound Messaging (this POD publishes events consumed externally)**
- Broker, topic, schema, publication cadence, known consumers, retention, contract versioning.

**9.B.5 — External Batch / ETL / File Transfer**
- Scheduled data exchanges with external systems (SFTP, S3, MFT, etc.).
- Direction, cadence, file format, volume, encryption, checksum/validation, failure handling.

**9.B.6 — Third-Party Dependencies**
- Vendor APIs, SaaS products, infrastructure services (DNS, secrets, observability, CDN, etc.) this POD depends on.
- Contract/SLA, environment-specific endpoints, credential rotation policy.

---

#### 9.C — Summary Tables

Include two consolidated tables at the top of the spec for quick reference:

```markdown
### Internal Integrations — Summary

| Source Repo | Target Repo | Type | Protocol | Purpose |
|-------------|-------------|------|----------|---------|
| backend-api | query-service | Sync | REST | Read-model queries |
| ... | ... | ... | ... | ... |

### External Interfaces — Summary

| Direction | Counterparty | Owner | Type | Protocol | Purpose |
|-----------|--------------|-------|------|----------|---------|
| inbound   | POD-orders   | Other POD | Sync  | REST   | Order lookup |
| outbound  | Stripe       | Third-party | Sync | REST | Payment capture |
| outbound  | POD-audit    | Other POD | Async | Kafka  | Emit audit events |
| ... | ... | ... | ... | ... | ... |
```

Any existing integration that does not cleanly fit the new grouping must be placed under the closest sub-section; if truly ambiguous, default it to **External** and add a `TODO: Confirm ownership boundary with team` note.

### Step 10 — Generate Security Specs

**Output file:** `{output_dir}/security-spec.md`

**10.1 — Authentication**
- Authentication mechanism and flow.
- Identity provider(s).
- Token lifecycle (issuance, validation, refresh, revocation).
- Session management (if applicable).

**10.2 — Authorization**
- Authorization model (RBAC, ABAC, ACL, etc.).
- Roles and permissions defined in the system.
- How authorization is enforced (annotations, middleware, policy engine).
- Resource-level access control.

**10.3 — Data Protection**
- Encryption at rest (database encryption, encrypted columns).
- Encryption in transit (TLS configuration).
- Sensitive data handling (PII masking, audit logging redaction).
- Secrets management (vault, environment variables, sealed secrets).

**10.4 — Security Dependencies**
- Security libraries used (Spring Security, Passport.js, etc.).
- Known security configurations (CORS, CSP, CSRF protection).
- Input validation and sanitisation approach.
- Dependency vulnerability scanning (if configured).

### Step 11 — Generate Deployment Specs

**Output file:** `{output_dir}/deployment-spec.md`

**11.1 — Build & Package**
- Build tool and commands.
- Artifact type (JAR, WAR, Docker image, npm package, binary, etc.).
- Build profiles / configurations.

**11.2 — Containerisation**
- Dockerfile analysis (base image, layers, exposed ports, entrypoint).
- Docker Compose setup (services, networks, volumes).
- Image registry and tagging strategy.

**11.3 — Orchestration**
- Kubernetes manifests (Deployments, Services, ConfigMaps, Secrets, Ingress).
- Helm charts (if present).
- Resource requests/limits.
- Health checks (liveness, readiness, startup probes).
- Horizontal Pod Autoscaler configuration.

**11.4 — CI/CD Pipeline**
- Pipeline definition file and tool (GitLab CI, GitHub Actions, Jenkins, etc.).
- Pipeline stages and what each stage does.
- Deployment strategy (rolling update, blue-green, canary).
- Environment promotion flow (dev -> staging -> prod).

**11.5 — Environment Configuration**
- Environment-specific settings and how they are managed.
- Feature flags (if present).
- Infrastructure-as-code (Terraform, CloudFormation, Pulumi).

**11.6 — Observability (tooling & setup)**
- Logging framework and configuration (log levels, structured logging, log aggregation).
- Metrics collection (Prometheus, Micrometer, StatsD, etc.).
- Distributed tracing (OpenTelemetry, Jaeger, Zipkin).
- Alerting rules (if defined in code/config).
- Dashboards (Grafana, Datadog, etc.).
- _For observability requirements and gap analysis (thresholds, coverage, retention), see `nfr-spec.md` Section 12.5._

### Step 12 — Generate NFR Specs

**Output file:** `{output_dir}/nfr-spec.md`

**12.1 — Performance**
- Response time requirements/expectations (inferred from timeouts, SLAs in config).
- Throughput expectations (from thread pool sizes, connection pool sizes, consumer concurrency).
- Known performance optimisations (caching, connection pooling, async processing).

**12.2 — Scalability**
- Horizontal scaling capability (stateless services, HPA configuration).
- Vertical scaling considerations.
- Database scaling (read replicas, sharding, partitioning).
- Message processing scalability (consumer groups, partitions).

**12.3 — Availability**
- Deployment redundancy (replica counts, multi-AZ).
- Health check configuration.
- Graceful shutdown handling.
- Dependency failure tolerance.

**12.4 — Reliability**
- Retry mechanisms and policies.
- Circuit breaker configuration.
- Idempotency guarantees.
- Data durability (backup, replication).
- Transaction management.

**12.5 — Observability (requirements & gaps)**
- Monitoring coverage gaps (what is monitored vs what should be).
- Alerting thresholds and SLA alignment.
- Log retention policies.
- Trace sampling rates.
- _For observability tooling and setup detail, see `deployment-spec.md` Section 11.6._

**12.6 — Maintainability**
- Code organisation and modularity.
- Documentation coverage.
- Test coverage.
- Dependency management (how up-to-date are dependencies).
- Code quality tools (linters, formatters, static analysis).

### Step 13 — Generate AGENTS.md

**Output file:** `AGENTS.md` at the workspace root (same level as the project directories).

If the user opted out of AGENTS.md generation in Step 4, skip this step.

Generate a comprehensive `AGENTS.md` that serves as the primary context document for AI agents (Claude, Devin, Windsurf, Cursor, Copilot, etc.) working in this workspace. The file must be derived entirely from the codebase analysis performed in earlier steps and any documentation loaded in Step 1.

**13.1 — Header & Purpose**

```markdown
# AGENTS.md — {Application Name} Workspace Context

> This file provides workspace context for AI coding agents. It is auto-generated
> by the `create-pod-knowledge` skill and should be kept up to date as the codebase evolves.

---
```

**13.2 — Workspace Overview**
- Application name and one-paragraph purpose.
- Owner / team (if identifiable from code, config, or documentation).
- Workspace structure: note that this is a multi-project workspace (if applicable) and that the workspace root is not itself a Git repository.

**13.3 — Project Inventory**

Include a table of all Git projects discovered in Step 2 (filtered by user confirmation):

```markdown
## Projects

| Project | Path | Description | Language | Framework | Build Tool |
|---------|------|-------------|----------|-----------|------------|
| backend-api | `backend-api/` | Core API service | Java 21 | Spring Boot 3.5.6 | Maven |
| ... | ... | ... | ... | ... | ... |
```

For each project, include a brief (2-3 sentence) summary of its responsibility and key modules.

**13.4 — Technology Stack (summary)**

Include a concise summary table (language, framework, build tool per project). For the full consolidated stack with versions and layers, reference `technical-spec.md` Section 6.2.

**13.5 — Architecture & Key Patterns (summary)**

Brief summary of architectural style(s) and key design patterns. For full module breakdown and control flow, reference `technical-spec.md` Sections 6.1 and 6.3.

**13.6 — Build & Test Reference**

A consolidated table of build and test commands for every project:

```markdown
## Build & Test

| # | Project | Type | Command | Working Dir | Notes |
|---|---------|------|---------|-------------|-------|
| 1 | backend-api | unit | `{build_command}` (e.g., `mvn clean install`, `npm test`, `cargo build`) | `backend-api/` | Full build with tests |
| 2 | backend-api | e2e | `{e2e_test_command}` | `backend-api/` | Requires running service |
| ... | ... | ... | ... | ... | ... |
```

Include instructions for running services locally (ports, profiles, JVM args).

**13.7 — POD Knowledge Reference**

Link to each generated spec (path + one-line summary). Include a "Quick Reference" guide: when to consult which spec (e.g., "Adding an API endpoint? -> api-spec.md + technical-spec.md"). Generate the table from the specs actually produced in this run — columns: Spec, Path, Contents.

> **Exclude from AGENTS.md:** `ai/knowledge/CHANGELOG.md` and `ai/knowledge/.raw-integrated.log` are provenance/audit artefacts only. They must **not** be linked, referenced, or described in AGENTS.md, and they are not consumed by feature-spec lifecycle skills (`sdd-create-specs`, `sdd-create-plan`, `sdd-execute`, `sdd-wrap-up`).

**13.8 — Constitution & Governance**

If `ai/harness/CONSTITUTION.md` exists, read it and include a `## Constitution & Governance` section in AGENTS.md containing:
- A statement that all agents and developers must comply.
- Extracted core principles (numbered list) and quality gates (summary table).
- A link to the full constitution file, noting that `/sdd-create-plan` validates against it.

If `ai/harness/CONSTITUTION.md` does not exist, note its absence and suggest creating it.

**13.9 — Git & Branching Conventions**
- Remote URL pattern (inferred from Git remotes).
- Branch naming conventions (inferred from existing branches).
- Commit message format (inferred from `git log` patterns, CI hooks, or documentation). Default convention for this workspace is `JIRA#<JIRA-ID>; <comment>`. For operational commits that sit outside a single feature-delivery workflow (e.g. `/sdd-update-knowledge` batch runs, `setup.py` scaffold bootstraps), use the reserved placeholder ID `JIRA-0000` — e.g. `JIRA#JIRA-0000; Update knowledge for 3 feature(s)`.
- MR/PR target branch rules.

**13.10 — Domain Quick Reference**
- 5-10 core domain concepts with one-line definitions (extracted from the functional spec and codebase).
- Key data entities and their relationships (summary from data model spec).
- Primary user/system flows (summary from functional spec).

**13.11 — LEARNINGS.md — Secondary Memory**

Include a `## LEARNINGS.md — Secondary Memory` section in AGENTS.md with:
- **Purpose:** persistent secondary memory for AI agents (user review surface, memory reconstruction across sessions, cross-session persistence).
- **Update rules:** append-only after every significant interaction; create sections as needed (Codebase Patterns, Gotchas, User Preferences, Feature Learnings, Execution Log); never overwrite or compact.
- **Format:** `## {Section} > ### {Date/Feature ID} — {Title} > - Learning items`
- **Categories to record:** codebase patterns, gotchas, user preferences, feature learnings, corrections, build/deploy notes.

**13.12 — Security & Safety**

```markdown
## Security & Safety

- **Never** commit secrets, tokens, API keys, or credentials to any repository.
- Sensitive data in configuration files must be referenced via environment variables or secret stores, never hardcoded.
- When documenting configuration, use `<REDACTED>` placeholders for actual secret values.
- Before performing destructive operations (database drops, force pushes, branch deletions), always confirm with the user.
```

**13.13 — Knowledge Base (LLM Wiki)**

Include a section that teaches the AI agent to treat the `ai/` directory as a structured knowledge base:

```markdown
## Knowledge Base — LLM Wiki

The `ai/` repository is a structured knowledge base containing comprehensive documentation that serves as the AI's long-term memory for this workspace. **Every AI session should treat `ai/` as the primary knowledge source** before grepping the codebase.

### How to Use the Wiki

1. **Consult POD knowledge first**: Before modifying code, read the relevant spec in `ai/knowledge/` to understand current behavior.
2. **Check feature history**: Before implementing a feature, scan `ai/specs/` for related past work and per-feature `change-summary.md` files for recent changes.
3. **Read domain resources**: For business-level understanding, read human-authored docs in `ai/raw/`.

### Wiki Structure

| Directory | Purpose | When to Read |
|-----------|---------|-------------|
| `ai/harness/CONSTITUTION.md` | Architectural governance, core principles, quality gates | Before any implementation — to ensure compliance |
| `ai/raw/` | Human-authored domain documentation, guides, requirements | For business context and domain understanding |
| `ai/knowledge/POD.md` | Executive POD summary — purpose, sub-domain, capabilities, entities, flows | Quick orientation for new team members, stakeholders, or AI agents |
| `ai/knowledge/` | AI-generated specs (functional, technical, API, data model, flows, sample data) | Before any code change |
| `ai/specs/{ISSUE_ID}/` | Per-feature specs, implementation plans, change summaries, MR links | Before implementing related features |
| `ai/specs/{ISSUE_ID}/change-summary.md` | Per-feature change summaries (generated by `execute`) | To understand recent changes, traceability, and patterns |
| `ai/sdlc/` | SDLC workflow documentation and diagrams | When running or debugging the SDLC pipeline |
```

Adapt the directory names and descriptions to match the actual workspace structure discovered in earlier steps. If the workspace does not use the `ai/` directory convention, substitute the actual documentation directory. The Wiki Structure table above serves as the directory reference — do not duplicate it as a separate tree listing.

#### AGENTS.md Population Validation

After generating `AGENTS.md`, verify it is populated and not an empty template:

1. **Read the generated file** and check it contains actual content (not just template headings with empty sections).
2. **Mandatory minimum content** — the file must contain all of the following with real values (not placeholders):
   - Project name and description
   - Tech stack (languages, frameworks, runtime versions)
   - Build commands (how to compile/build each project)
   - Test commands (how to run unit tests, integration tests)
   - Module-to-project mapping (which source module maps to which Git project under `ai/submodules/`)
   - Coding conventions (indentation, naming, import style)
3. **If any mandatory section is empty or contains only placeholder text** (e.g., `TODO`, `TBD`, `[fill in]`), re-scan the codebase for the missing information and populate it.
4. **If information genuinely cannot be determined from the codebase** (e.g., no tests exist, build tool is non-standard), document it explicitly: "Test commands: Not detected — no test framework found in project."

> **Why this matters:** Feedback showed that empty/template AGENTS.md files forced every new session to re-discover project context from scratch, wasting significant time. A populated AGENTS.md is the primary mechanism for cross-session continuity.

### Step 14 — Generate LEARNINGS.md (if needed)

If a `LEARNINGS.md` file does not already exist at the workspace root, generate a template:

```markdown
# Learnings & Best Practices

> This file serves as persistent secondary memory for AI agents working in this workspace.
> It is append-only — do not overwrite or compact existing content.
> See AGENTS.md for full instructions on how to maintain this file.

---

## Codebase Patterns

<!-- Add discoveries about codebase patterns, conventions, and architecture here -->

---

## Gotchas & Pitfalls

<!-- Add gotchas, pitfalls, and things that don't work as expected here -->

---

## User Preferences

<!-- Add user preferences for workflow, coding style, tooling, etc. here -->

---

## Execution Log

<!-- Log notable AI-assisted tasks with date, approach, and outcome here -->

| Date | Task | Approach | Outcome / Learning |
|------|------|----------|--------------------|
```

If `LEARNINGS.md` already exists, do NOT overwrite it. Inform the user that it already exists and skip this step.

### Step 15 — Generate POD.md (MANDATORY)

**Output file:** `{output_dir}/POD.md` — i.e. `ai/knowledge/POD.md` by default. **Never write `POD.md` at the workspace root** or anywhere outside the output directory. It is a knowledge spec, not a workspace-context file like `AGENTS.md`.

This step is **mandatory** — always generate `POD.md`, regardless of which detailed specs the user opted in or out of in Step 4.

**Audience: business users.** `POD.md` is written for a **business audience** — product managers, domain experts, business analysts, stakeholders from other PODs, and executives. It must be readable by someone with zero engineering background. The goal is for the reader to understand **what the POD does for the business** in 10–15 minutes.

**Strict language rules — enforce these throughout the document:**

- **Use business language only.** Describe capabilities, outcomes, and user journeys — not systems, services, endpoints, or queues.
- **Do NOT mention technology.** No languages, frameworks, databases, brokers, protocols, cloud providers, container platforms, or infrastructure terms. No "REST", "gRPC", "Kafka", "SQL", "Java", "Spring Boot", "Docker", "Kubernetes", "AWS", etc.
- **Do NOT mention project or repository names.** Do not reference `{project-name}`, repo URLs, module names, or any Git artefact.
- **Do NOT mention code-level artefacts.** No class names, method names, file paths, DTO names, package names, or API endpoint URLs.
- **Do NOT use technical shorthand or acronyms without a business gloss.** If a domain acronym (e.g. `SKU`, `POS`) is essential, define it inline in plain English the first time.
- **Use the POD's own business vocabulary.** Extract domain terms (e.g. "Order", "Entitlement", "Customer Registration") from the codebase's domain models, raw docs in `ai/raw/`, and JIRA/Confluence context — not from class names or table names.
- **Mermaid diagrams must use business-level nodes** — actors, capabilities, and outcomes — never classes, services, or technology components.

If a concept cannot be expressed without leaking technical detail, **omit it** — it belongs in `technical-spec.md`, not `POD.md`.

**Sanity-check before saving:** search the draft for obvious technical keywords (`REST`, `API` outside the §9 "Further Reading" table, `gRPC`, `Kafka`, `queue`, `database`, `SQL`, `Java`, `Spring`, `Docker`, `Kubernetes`, `AWS`, `.git`, `src/`, `module`, `package`, `endpoint`, `microservice`, `service mesh`, etc.). If any appear outside §9, rewrite or delete.

**Do not duplicate the detailed specs.** `POD.md` is a high-altitude business map; the eight detailed specs are the implementation-level detail. Summarise, synthesise, and cross-reference — never copy-paste whole sections from the detailed specs.

**Primary source: `ai/raw/` documentation (the best source of business language).**

Before drafting `POD.md`, consult the documentation context loaded in Step 1 — especially `ai/raw/` content, which is the **authoritative source of business framing** (written by POD members in the POD's actual business vocabulary).

Treatment rules for `ai/raw/` content:
1. **Prioritise raw wording over inferred wording** — when `ai/raw/` and the codebase disagree on terminology or scope, use the `ai/raw/` wording in `POD.md`. The codebase names are often technical shorthand; raw docs hold the official business language.
2. **Cite the raw source** — when a capability, flow, or rule is taken directly from a raw document, add a trailing `_Source: ai/raw/<file>_` reference under the relevant section (useful for traceability and for future `/sdd-update-knowledge` runs).
3. **Flag gaps** — if `ai/raw/` is empty or does not cover a particular business area, note the gap explicitly in the relevant section (e.g. *"No raw documentation covers the dispute-resolution flow; content below is inferred from the codebase — please review and refine."*).

Draw business-level content from, in priority order:
1. **`ai/raw/` documents** (loaded in Step 1) — primary source of business language, scope statements, user journeys, business rules, and terminology.
2. **User-provided documentation** from Step 1 (Confluence, Figma, JIRA links the user pasted in) — secondary source, same treatment.
3. **Domain models inferred in Step 3** and **`functional-spec.md` generated in Step 5** — tertiary source; use only to confirm or supplement what's in raw docs.

**Do not draw from `technical-spec.md`, `api-spec.md`, `integration-spec.md`, `deployment-spec.md`, or `nfr-spec.md`** — those are technical sources and will pollute the business framing.

Write the file with the following sections:

**15.1 — POD Identity & Purpose**

```markdown
# {POD Name} — What This POD Does

## 1. Purpose & Mission

{2–3 sentences answering: Why does this POD exist? What business problem does it solve?
What outcome does it deliver to customers, partners, or internal stakeholders?}
```

**15.2 — Sub-Domain & Scope**

```markdown
## 2. Business Sub-Domain & Scope

**Business domain:** {The broader domain this POD belongs to, in business terms —
e.g., "Order Fulfilment", "Customer Lifecycle", "Licensing & Entitlement".}

**Sub-domain / responsibility:** {The specific business slice this POD owns —
e.g., "Converting accepted orders into active customer entitlements".}

**In scope:** {Business activities and outcomes this POD is responsible for.}

**Out of scope:** {Adjacent business activities explicitly owned by other PODs.}

**Business counterparts:**
- *Upstream* (who provides input to this POD): {Other PODs or business functions —
  e.g., "Sales & Order Capture POD", "Product Catalogue team".}
- *Downstream* (who consumes this POD's outputs): {Same format.}
```

**15.3 — What the POD Does — Capabilities**

```markdown
## 3. Business Capabilities

{A narrative summary (3–5 paragraphs) of what the POD does for the business,
grouped by capability theme. Focus on outcomes, not mechanisms.}

### Capability Catalogue

| # | Capability | What it delivers to the business |
|---|-----------|----------------------------------|
| 1 | {Business capability name} | {1–2 sentences on the business value — who benefits, and how} |
| 2 | ... | ... |
```

**15.4 — Business Data Entities**

```markdown
## 4. Business Entities We Manage

{High-level view of the core business concepts this POD is the authoritative
source for. These are domain concepts, not technical artefacts.}

| Entity | What it represents | Lifecycle (business states) |
|--------|--------------------|------------------------------|
| {Business entity name} | {What it means in the business} | {e.g., "Draft → Submitted → Approved → Active → Expired"} |
| ... | ... | ... |

### How these entities relate (high-level)
```

Include a simplified Mermaid `erDiagram` showing only the top-level business entities and their relationships — no attributes, no technical types:

````markdown
```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : "places"
    ORDER ||--o{ ENTITLEMENT : "generates"
    ENTITLEMENT }o--|| PRODUCT : "grants access to"
```
````

**15.5 — Business Flows**

```markdown
## 5. Key Business Flows

{For each major business flow, provide a short narrative (2–4 sentences) and a Mermaid
diagram. Limit to the 3–5 flows that define the POD's reason for existing.}
```

For each flow, use a Mermaid diagram with **business-level nodes only**:

````markdown
### 5.1 — {Business flow name}

{2–4 sentence business narrative.}

```mermaid
flowchart TD
    A[Customer submits order] --> B{Order valid?}
    B -->|Yes| C[Entitlements generated for the customer]
    C --> D[Customer notified and access activated]
    B -->|No| E[Customer sees correction guidance]
```
````

**15.6 — Business Interactions**

```markdown
## 6. Who This POD Works With

{Two tables — one for internal business counterparts inside the POD's delivery boundary,
one for external business counterparts.}

### 6.1 — Within the POD's delivery boundary
| Works with | Nature of interaction | What it enables |
|------------|-----------------------|-----------------|
| {Internal team / capability} | {e.g., "Looks up active product definitions"} | {1-line business value} |
| ... | ... | ... |

### 6.2 — Outside the POD (external business counterparts)
| Direction | Counterpart | Nature of interaction | What it enables |
|-----------|-------------|-----------------------|-----------------|
| inbound / outbound | {Business name of other POD or external party} | {Business description of the exchange} | {1-line business value} |
| ... | ... | ... | ... |

> For the technology-level view of these interactions (protocols, systems, payloads,
> retry policies, etc.), see the technical integration spec.
```

**15.7 — Key Business Rules (Top 5–10)**

```markdown
## 7. Key Business Rules

{List the 5–10 most important business rules — the ones a new PM, stakeholder, or
business analyst needs to know immediately.}

| # | Rule | What it means for the business |
|---|------|--------------------------------|
| 1 | {Rule in plain business language} | {1-sentence impact on customers / partners / internal users} |
| ... | ... | ... |
```

**15.8 — Glossary**

```markdown
## 8. Glossary

{Define the 5–15 domain terms a business reader must understand to use this document.}

| Term | Meaning |
|------|---------|
| {Business term} | {Plain-English definition} |
| ... | ... |
```

**15.9 — Further Reading (for technical readers only)**

```markdown
## 9. Further Reading (for technical readers)

> The rest of this knowledge base is written for technical readers — engineers,
> architects, and AI coding agents. Business readers can stop here; the sections below
> are for those who need implementation-level detail.

| Document | Path | What You'll Find |
|----------|------|-----------------|
| Functional Spec | `ai/knowledge/functional-spec.md` | Detailed features, use cases, all business rules, flow diagrams |
| Technical Spec | `ai/knowledge/technical-spec.md` | Architecture, modules, technology stack, control flow, error handling |
| Data Model Spec | `ai/knowledge/data-model-spec.md` | All entities, fields, indexes, full ER diagrams |
| API Spec | `ai/knowledge/api-spec.md` | Every API endpoint with request/response schemas |
| Integration Spec | `ai/knowledge/integration-spec.md` | Internal integrations (between POD repos) and external interfaces (across POD boundary) |
| Security Spec | `ai/knowledge/security-spec.md` | Auth, authorisation, data protection |
| Deployment Spec | `ai/knowledge/deployment-spec.md` | Build, CI/CD, infrastructure, observability |
| NFR Spec | `ai/knowledge/nfr-spec.md` | Performance, scalability, reliability |
```

**Formatting rules for POD.md:**
- **Length target: 400–800 lines of Markdown** (roughly 10–15 minute read). If it exceeds 800 lines, trim detail — push it to the detailed specs and cross-reference.
- Include **3–5 Mermaid diagrams** maximum — business entity overview + top business flows.
- Every section must derive from actual domain evidence — `ai/raw/` docs, functional spec, and domain models inferred from the codebase. No filler, no generic boilerplate.
- If the POD's domain is not obvious from the codebase alone, note assumptions explicitly and suggest the user refine them.
- Enforce the **Strict language rules** and **sanity-check** defined above in this step — they apply to all sections 1–8.

### Step 16 — Append Knowledge CHANGELOG Entry (MANDATORY)

**Output file:** `{output_dir}/CHANGELOG.md` (i.e. `ai/knowledge/CHANGELOG.md`)

This step is **mandatory** — always update the changelog before finishing the skill, even on re-runs or partial regenerations. Skipping it breaks the audit trail that downstream operators and the `/sdd-update-knowledge` skill rely on.

Maintain a human-readable audit trail of every change to `ai/knowledge/`. This file is **metadata about the knowledge base** — it is deliberately **excluded** from AGENTS.md generation and from feature-spec lifecycle skills (`sdd-create-specs`, `sdd-create-plan`, `sdd-execute`, `sdd-wrap-up`). Its sole purpose is provenance.

**16.1 — Ensure the changelog file exists**

If `{output_dir}/CHANGELOG.md` does not exist, create it with this header:

```markdown
# Knowledge Base Changelog

> Audit trail of all changes to `ai/knowledge/`. Appended to by `/sdd-create-pod-knowledge`
> and `/sdd-update-knowledge`. Newest entries at the top.
>
> **Not consumed by feature-spec lifecycle skills.** AGENTS.md must not reference
> this file, and `/sdd-create-specs`, `/sdd-create-plan`, `/sdd-execute`, and `/sdd-wrap-up` must
> ignore it.

---

```

**16.2 — Resolve author identity**

```bash
AUTHOR_NAME=$(git config user.name 2>/dev/null || whoami)
AUTHOR_EMAIL=$(git config user.email 2>/dev/null || echo "unknown@local")
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

**16.3 — Prepend a new entry**

Insert the following block immediately after the `---` divider (so newest is on top):

```markdown
## {TIMESTAMP} — create-pod-knowledge

- **Author:** {AUTHOR_NAME} <{AUTHOR_EMAIL}>
- **Trigger:** initial knowledge-base generation (or regeneration)
- **Files generated / regenerated:**
  - `POD.md`
  - `functional-spec.md`
  - `technical-spec.md`
  - `data-model-spec.md`
  - `api-spec.md`
  - `integration-spec.md`
  - `security-spec.md`
  - `deployment-spec.md`
  - `nfr-spec.md`
  - `../../AGENTS.md` (if generated)
  - `../../LEARNINGS.md` (if generated)
- **Documentation sources referenced:** {M}
- **Git projects analysed:** {P}
- **Notes:** {any overrides, skipped steps, or assumptions worth preserving}

---
```

Only list files that were actually (re)generated in this run — skip entries for files the user opted out of in Step 4.

---

### Step 17 — Review & Finalise

After generating all requested specs and files:

**17.1 — Present Summary**

```
=== create-pod-knowledge Summary ===

Output directory: ai/knowledge/

Generated specs:
  1. functional-spec.md    — X sections, Y Mermaid diagrams
  2. technical-spec.md     — X sections
  3. data-model-spec.md    — X entities, Y relationships
  4. api-spec.md           — X endpoints documented
  5. integration-spec.md   — X internal + Y external integrations
  6. security-spec.md      — X sections
  7. deployment-spec.md    — X sections
  8. nfr-spec.md           — X sections

Additional files:
  9. AGENTS.md             — Workspace context (N sections)
 10. LEARNINGS.md          — Secondary memory template (created / already existed)
 11. POD.md                — POD executive summary (N sections, M Mermaid diagrams)
 12. CHANGELOG.md          — Knowledge-base audit trail (entry appended)

Total files generated: N
Documentation sources referenced: M
Git projects analysed: P
```

**17.2 — User Review**
- Ask the user to review the generated specs.
- Offer to expand any section that needs more detail.
- Offer to add additional Mermaid diagrams for specific flows.
- Offer to regenerate any spec with a different focus or scope.
- Offer to customise the AGENTS.md with additional sections.

---

## Important Rules

1. **Analyse the actual codebase.** Do not guess or hallucinate — every fact in the specs must be traceable to code, configuration, or documentation found in the repository (or user-provided documentation from Step 1). The codebase alone is always sufficient to generate all specs — `ai/raw/` documentation is an optional enrichment, not a prerequisite.
2. **`POD.md` is mandatory and lives at `ai/knowledge/POD.md`.** Always generate it, even if the user opts out of every other detailed spec. **Never write `POD.md` at the workspace root or any other location** — it is a knowledge spec, not a workspace-context file. It is the executive summary of the POD's business and functional purpose and is the first file anyone reads to understand what the POD does. Never skip it.
3. **`CHANGELOG.md` is mandatory.** Always append an audit entry to `ai/knowledge/CHANGELOG.md` before finishing the skill — even on re-runs or partial regenerations. The changelog is the provenance spine that `/sdd-update-knowledge` and downstream operators depend on. Never skip Step 16.
4. **Use Mermaid diagrams liberally** in functional specs. Every significant flow should have at least a happy-path diagram.
5. **Keep specs self-contained.** Each spec file should be readable on its own without needing to cross-reference other specs (though cross-references are allowed for convenience).
6. **Preserve existing files.** Do not overwrite files outside the output directory. If specs already exist in the output directory, ask the user before overwriting.
7. **Use consistent formatting.** All specs should use the same Markdown style: H1 for title, H2 for major sections, H3 for subsections, tables for structured data, code blocks for examples.
8. **Redact secrets.** Never include actual passwords, API keys, tokens, or connection strings in the specs. Use placeholder values like `<REDACTED>` or `***`.
9. **Document unknowns.** If something cannot be determined from the codebase alone, note it explicitly (e.g., "**TODO:** Confirm expected response time SLA with team").
10. **Default output directory is `ai/knowledge/`.** Respect user overrides if a different path is requested.
11. **AGENTS.md must be workspace-generic.** Write AGENTS.md so any AI agent (not just Devin) can use it. Avoid tool-specific instructions — use neutral language like "AI agent" or "coding assistant".
12. **LEARNINGS.md is append-only.** Never overwrite an existing LEARNINGS.md. If it exists, leave it untouched.
13. **Cross-reference documentation.** When user-provided documentation (Step 1) supplements or contradicts codebase findings, note the discrepancy and prefer the codebase as the source of truth (but flag the conflict).
