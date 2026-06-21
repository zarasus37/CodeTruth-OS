## 5. Technical Work Model

The functional pipeline described in Chapter 2 — ingestion, parsing, reconstruction, evaluation, multi-model truth synthesis, planning, spatial visualization, and governance — is realized through a distributed service architecture specified in this chapter. The **Technical Work Model** defines the service decomposition that maps each of the eight functional layers to a deployable computational unit, the polyglot data tier that persists the entities produced at each stage, the synchronous and asynchronous APIs through which consumers and external systems interact with the platform, and the integration patterns connecting CodeTruth OS to Git providers, CI/CD pipelines, issue trackers, and communication systems. This chapter is the technical bridge between the functional capabilities defined in Chapter 2 and the operational governance of that architecture described in Chapter 6.

### 5.1 System Architecture

#### 5.1.1 Service Decomposition

Each of the eight functional layers defined in the product architecture is implemented as an independently deployable service[^1^]. This alignment ensures that each pipeline stage scales, fails, and evolves independently — a requirement following directly from the non-functional specification for analyzer failure isolation and queue-based orchestration[^2^].

The **Ingestion Service** (Layer 1) accepts repository connections via GitHub OAuth, App installation, or personal access token (PAT); handles folder uploads, ZIP archives, and cloud drive sync; and manages webhook-triggered continuous ingestion on commit or pull request events[^1^]. It performs framework and language auto-detection, applies ignore rules, and produces an immutable Snapshot Record with a hash-based identity chain. Its outputs — Snapshot Record, File Manifest, and Detected Stack Profile — form the downstream input contract.

The **Parsing Engine** (Layer 2) consumes Snapshot Records and performs language-specific AST extraction, symbol graph construction, dependency resolution, and infrastructure configuration parsing[^1^]. It detects entry points, API routes, database schemas, environment variables, secret patterns, and CI/CD definitions, producing a Symbol Index, Dependency Graph, Endpoint Map, Schema Map, and Infrastructure Configuration Map.

The **Reconstruction Engine** (Layer 3) assembles file-level evidence into a systems-level model[^1^]. It infers service boundaries, analyzes module coupling and cohesion, recognizes architecture patterns, reconstructs request-response and event flows, maps data flows, reconstructs authentication flows, and infers deployment topology. Its primary output is the **Architecture Graph** — a structured, traversable system representation in visual and JSON form — alongside Runtime Flow Maps and External Dependency Maps.

The **Evaluation Engine** (Layer 4) applies scoring across 10 domains: code structure, build readiness, runtime readiness, test maturity, security posture, DevOps maturity, observability, documentation, product completeness, and integration health[^1^]. It classifies findings into five severity tiers and produces a Build-State Scorecard, Maturity Classification, Missing Infrastructure Matrix, Risk Heatmap, and Priority-Ordered Finding List.

The **Truth Council Orchestrator** (Layer 5) coordinates five role-specialized model assessments: Architecture, Runtime, DevOps, Security, and Planning[^1^]. It manages independent first-pass assessment, cross-review with contradiction detection, consensus building that preserves disagreement, and confidence-weighted synthesis, producing the Contradiction Register, Consensus Truth Report, and Evidence Ledger.

The **Planner** (Layer 6) converts findings into executable plans[^1^]. It generates fix recommendations with prerequisite chain analysis, produces phased roadmaps across stabilize, complete, harden, optimize, and scale tracks, estimates effort in XS through XL bands, groups workstreams by domain, and generates ticket-ready tasks with acceptance criteria.

The **Spatial Renderer** (Layer 7) transforms the project model into a navigable spatial environment[^1^]: services, modules, and agents as spatial objects; data flows as spatial connections; missing infrastructure as visible gaps; build-phase progression as construction state — operating at interactive frame rates on consumer hardware without GPU acceleration[^2^].

The **Governance Service** (Layer 8) manages multi-user workspaces, RBAC, human review workflows, audit logging, and retention policies[^1^]. It supports five workspace roles — owner, admin, engineer, reviewer, viewer — and maintains a tamper-evident audit trail.

**Table 5.1 — Service Decomposition Matrix**

| Service | Responsibility | Communication Pattern | Primary Data Store | Scalability Strategy |
|---|---|---|---|---|
| Ingestion Service | Repository connection, snapshot creation, file indexing, webhook handling | Synchronous REST for uploads; Async message queue for job dispatch | Object Storage (snapshots), Document Store (connections) | Horizontal scaling with queue distribution; incremental re-analysis on changed files only |
| Parsing Engine | AST extraction, symbol graph construction, dependency resolution, config parsing | Async: message queue for jobs; event bus for symbol publication | Graph DB (symbol/dependency nodes), Document Store (artifacts) | Stateless workers scaled by queue depth; language-specific parser plugins isolate memory |
| Reconstruction Engine | Service boundary inference, flow reconstruction, topology mapping, architecture synthesis | Async: event bus consuming symbols; message queue for reconstruction jobs | Graph DB (architecture graph nodes and edges) | Pipeline-parallel: coupling, flow, and topology as parallel sub-jobs |
| Evaluation Engine | 10-domain scoring, gap detection, severity classification, risk heatmap | Async: message queue for scoring; event bus for findings | Document Store (scorecards, findings), Graph DB (evidence links) | Domain-scoped worker pools with failure isolation per scoring domain |
| Truth Council Orchestrator | 5-model coordination, contradiction detection, consensus synthesis | Async: message queue for sessions; event bus for cross-model sharing | Document Store (reports, register, consensus), Graph DB (evidence chains) | Model-parallel: 5 assessments concurrent; cross-review after all first-pass complete |
| Planner | Fix recommendation, prerequisite analysis, roadmap generation, task export | Async queue consuming findings; sync REST for plan retrieval | Document Store (roadmaps, tasks, criteria) | Stateless: deterministic function of findings and workspace policies |
| Spatial Renderer | 3D/layered spatial rendering, confidence encoding, risk heat visualization | Sync: WebSocket for frames; REST for scene state | Object Storage (scene assets), Document Store (viewport state) | Client-side rendering; server pre-computes layouts to minimize GPU load |
| Governance Service | Workspace management, RBAC, audit logging, retention, review workflows | Sync: REST for CRUD; WebSocket for collaboration | Document Store (workspace/users/policies), Time-Series (audit logs) | Shard by workspace; read replicas for audit; permission caching at gateway |

The matrix reveals a deliberate pattern: Layers 2 through 5 — the core analytical pipeline — communicate exclusively through asynchronous patterns, decoupling stages and enabling independent scaling[^2^]. Layers 1, 6, 7, and 8 expose synchronous interfaces for user interaction while delegating long-running work to the async pipeline, optimizing responsiveness and throughput independently.

#### 5.1.2 Communication Patterns

The platform employs two communication paradigms matched to the latency and reliability requirements of each interaction type.

**Synchronous communication** serves query-oriented operations requiring immediate response. RESTful HTTP APIs handle resource CRUD for projects, snapshots, workspaces, and users. GraphQL supports flexible knowledge graph traversal and report customization without the N+1 query problem of naive REST. WebSocket connections stream analysis progress, notifications, and collaboration events such as shared review sessions with live comment threads[^1^].

**Asynchronous communication** handles all analytical and computational workloads. An **event bus** propagates domain events between pipeline stages — when the Parsing Engine publishes a Symbol Indexed event, the Reconstruction Engine consumes it to begin service boundary inference without blocking continued parser work. Events include: Snapshot Created, Symbol Indexed, Graph Reconstructed, Score Computed, Finding Published, Council Completed, and Plan Generated. A **message queue** manages analysis jobs with durability guarantees: ingestion, reconstruction, scoring, and truth council sessions are enqueued with priority ordering, retry policies with exponential backoff, and dead-letter handling for terminally failed jobs[^2^]. This queue-based orchestration enables concurrent workspace processing and ensures that a failure in one scoring domain does not cascade to abort the full analytical run.

#### 5.1.3 Data Stores

**Table 5.2 — Data Store Allocation**

| Data Store | Stores | Access Pattern | Scale Target | Retention Policy |
|---|---|---|---|---|
| Graph Database | Architecture Graph nodes (services, modules, agents, contracts, endpoints); edges (calls, depends, flows-to, authenticates, imports, serves); Symbol relationships; Finding-to-evidence chains | Traversal queries; batch write during reconstruction | 1M+ nodes, 5M+ edges per project; sub-100ms for 3-hop | Snapshot-scoped with diff-based incremental updates |
| Document Store | Snapshot records; Scorecards/findings; Model reports; Contradiction registers; Roadmaps/tasks; Workspace/user records; RBAC policies | CRUD with secondary indexes; aggregations for dashboards | 10K+ docs per snapshot; 100K+ findings across histories | Tiered: active per workspace policy (default 90d); delete-on-demand with zero retention |
| Object Storage | Snapshot file trees (immutable, content-addressed); Spatial scene assets; Report exports (PDF/MD/CSV); Audit archives | Write-once-read-many; streaming reads; batch downloads | 10GB+ per snapshot; 1TB+ per workspace with history | Snapshots until deletion; exports TTL 30d; audit 7 years |
| Time-Series | Job execution metrics; API latency/throughput; Render frame timing; Audit event stream | Time-range queries; downsampling; real-time streaming | 1M+ events per workspace per day; 30-day hot | Hot 30d at full resolution; hourly aggregates 1 year; archived annually |

The Graph Database materializes the **Architecture Graph**, the platform's central structure. Nodes represent services, modules, agents, contracts, endpoints, databases, and external systems. Edges encode calls, depends, flows-to, authenticates, imports, and serves relationships. This schema enables the traversal underlying both spatial scene construction and evidence chain linkage[^1^]. The Document Store handles metadata-rich entity storage; the Graph handles relationship-dense traversal queries. Object Storage guarantees immutability via content-addressed hashing — each snapshot's SHA-256 identity ensures identical file sets produce identical IDs[^1^].

### 5.2 Data Models

#### 5.2.1 Core Entities

The platform operates on a closed entity set. A **Project** represents a connected codebase with source configuration, stack profile, and latest Snapshot reference. A **Snapshot** is an immutable, content-addressed file tree capture linked to its parent in a version chain[^1^]. A **File** carries path, content hash, language detection, and symbol references. A **Symbol** is a typed element — functions, classes, interfaces, exports, imports — linked via the graph database.

A **Relationship** is a typed Architecture Graph edge. A **Finding** carries severity, confidence, domain attribution, evidence chain, description, and remediation path[^1^]. A **Task** is a work item with effort estimate, workstream, prerequisites, acceptance criteria, and status. A **Report** is an aggregated output — Executive Truth, Engineering, Infrastructure, Security, Planner, or Spatial — in JSON, Markdown, PDF, CSV, GitHub Issues, or Jira/Linear formats[^1^]. A **Workspace** contains Projects, Users, policies, and audit scope. A **User** has workspace memberships and role assignments.

#### 5.2.2 Knowledge Graph Schema

**Node types:** Service (deployable boundary), Module (code package), Agent (AI/autonomous unit), Contract (API/smart contract), Endpoint (route/entry point), Database (data store with schema), ExternalSystem (third-party dependency), Configuration (infra/environment artifact). Each node carries a confidence annotation — confirmed, strongly inferred, weakly inferred, unknown, or contradicted — governing rendering weight and scoring inclusion[^1^].

**Edge types:** CALLS (runtime invocation), DEPENDS_ON (compile-time dependency), FLOWS_TO (data movement), AUTHENTICATES (trust validation), IMPORTS (module inclusion), SERVES (endpoint binding), TRIGGERS (event/job), HOSTS (deployment). Directionality is significant: FLOWS_TO encodes data direction; AUTHENTICATES encodes trust direction.

Graph construction occurs in two phases. **Parsing** creates symbol-level nodes and IMPORTS edges from ASTs. **Reconstruction** lifts these into service-level abstractions: symbol clusters become Modules, module groupings become Services, endpoint bindings become SERVES edges. Every high-level claim is traceable to file-level evidence through graph traversals.

#### 5.2.3 Insight Model

A **Finding** contains: unique identifier; domain from 10 scoring domains; severity (Critical blocker, High-risk flaw, Medium-priority weakness, Low-priority debt, Informational observation); confidence (Confirmed, Strongly Inferred, Weakly Inferred, Unknown, Contradicted); description; **evidence chain** linking to files/symbols via graph references; **remediation path** from the Planner; and contradiction flag from the Truth Council[^1^].

The evidence chain is the distinguishing feature. Each Evidence Record contains: snapshot hash, file path and line range, symbol identifier, raw text snippet, and extraction method (AST, pattern match, or inference). This enables verification of every claim against source material — the operational standard separating evidence-linked analysis from assertion-based reporting[^1^].

#### 5.2.4 Snapshot Versioning

Snapshots are the platform's fundamental unit of temporal identity. Each is **immutable** — once created, file trees and metadata never change, enabling reproducible analysis. Identity is **content-addressed** via SHA-256 hash computed over the complete file tree structure and content[^1^]. Identical files produce identical IDs regardless of when or how they were ingested, enabling deduplication and cache-friendly incremental processing.

Snapshots form a **parent-child chain** through explicit parent references, creating a directed acyclic graph of project history. The diff engine computes a Merkle-style tree diff between parent and child snapshots by comparing content hashes at each directory and file level. This diff drives **incremental re-analysis**: only files whose hashes changed trigger re-parsing and downstream re-evaluation[^2^]. Unchanged files retain their symbol indexes and architectural inferences from the parent snapshot. For a typical large project where commits modify 2-5% of files, incremental processing reduces analysis time by 90% or more compared to full re-analysis. The immutable, content-addressed model also serves as the foundation for the platform's zero-retention guarantee: deleting a snapshot removes all derived artifacts, and no copy of the source data persists beyond the explicit retention window.

### 5.3 API Design

#### 5.3.1 REST Resources

The REST API exposes seven resource collections. All endpoints require JWT bearer tokens; authorization is workspace-scoped by user role[^1^].

**Table 5.3 — API Resource Mapping**

| Resource | Methods | Purpose | Auth Required |
|---|---|---|---|
| /projects | GET (list/filter), POST (create), GET /:id, PATCH /:id, DELETE /:id | Project lifecycle: connect repos, configure profile, set triggers, archive | Yes — workspace member; POST requires Engineer+ |
| /snapshots | GET (list/filter), POST (trigger), GET /:id, GET /:id/download | Snapshot management: history, captures, file tree downloads | Yes — member; POST requires Engineer+ |
| /analyses | GET (list), POST (trigger), GET /:id/status, GET /:id/results, DELETE /:id | Pipeline orchestration: enqueue, track progress, retrieve findings | Yes — member; POST requires Engineer+; results Viewer+ |
| /findings | GET (filter), GET /:id (with evidence), PATCH /:id, GET /:id/tasks | Finding management: browse, apply review decisions, link tasks | Yes — member; PATCH requires Engineer+ |
| /reports | GET (list), POST (generate), GET /:id, GET /:id/download | Report generation: on-demand in JSON/MD/PDF/CSV | Yes — member; POST requires Viewer+ |
| /workspaces | GET, POST, GET /:id, PATCH /:id, GET /:id/members, POST /:id/invite | Workspace admin: boundaries, retention, member access | Yes — PATCH and invite require Admin+ |
| /users | GET /me, PATCH /me, GET /me/workspaces, DELETE /me/workspaces/:id | Self-management: profile, membership visibility | Yes — all /me endpoints |

Resources follow HATEOAS conventions: each response includes links to related resources (snapshots link to parent and project; findings link to evidence chains and tasks), enabling graph navigation without hardcoded URLs.

#### 5.3.2 GraphQL Schema

GraphQL supplements REST with flexible traversal. Root queries expose `project` (with nested history), `snapshot` (with architecture graph and findings), and `finding` (with filterable evidence expansion). Mutations support analysis triggering, annotation, and report generation.

GraphQL is essential for the **Spatial Renderer**, which requires selective Architecture Graph expansion. A query requesting a project's latest snapshot → Architecture Graph → Service nodes → CALLS/FLOWS_TO edges → nested Endpoints/Databases to depth 3 resolves server-side in a single request, avoiding REST round-trips.

#### 5.3.3 Real-Time Streams

WebSocket connections deliver three streams. **Analysis progress** publishes stage-completion events through the pipeline, enabling granular progress indicators[^2^]. **Notifications** push finding alerts, report completions, and invitations. **Collaboration** enables shared review sessions where mutations broadcast to all participants in real time[^1^].

#### 5.3.4 Webhook Integrations

Outgoing webhooks deliver structured, signed (HMAC-SHA256) payloads for three event categories: **analysis completion** (report metadata, download URLs, summary statistics), **finding threshold breach** (alert when new Critical or High-Risk findings are detected with full finding metadata), and **snapshot creation** (snapshot ID, parent reference, branch, commit hash). Consumers verify payload authenticity using a workspace-specific secret and validate the signature before processing.

Incoming webhooks from GitHub and GitLab drive continuous ingestion: push events enqueue new snapshot creation for the affected branch, pull request events trigger branch-targeted analysis with results posted back as PR comments, and issue comment webhooks enable finding discussion threads linked to specific evidence chains[^1^]. Webhook endpoint configuration is workspace-scoped, and delivery failures trigger automatic retry with exponential backoff up to a configured maximum.

### 5.4 Integration Patterns

#### 5.4.1 Git Providers

Integration follows a common abstract interface: connect, list, select, ingest, webhook. **GitHub** supports OAuth, GitHub App, and PAT with repository access, webhooks, and PR comment integration[^1^]. **GitLab** supports OAuth and PAT with webhooks and merge request notes. **Bitbucket** supports OAuth and App Password with webhooks. New providers require only adapter implementation.

#### 5.4.2 CI/CD Integration

The platform integrates as a quality gate. **GitHub Actions** uses a published action triggering analysis via REST API with check run results. **Jenkins** uses a pipeline step plugin enqueuing jobs and polling for completion. **CircleCI** uses an orb gating subsequent steps on severity thresholds.

**Advisory mode** runs analysis in parallel with non-blocking annotations. **Gating mode** fails the build when findings exceed thresholds (e.g., new Critical blockers block deployment). Deployment events captured via webhook correlate with snapshot history for retrospective investigation.

#### 5.4.3 Issue Tracker Integration

**GitHub Issues** export generates drafts with descriptions, evidence links, severity labels, and remediation suggestions. **Jira** export uses the REST API with custom field mappings for severity, confidence, domain, and finding ID. **Linear** export uses the GraphQL API with label categorization[^1^].

**Bidirectional sync** records external issue identifiers on export. Status changes in external systems reflect back to finding review state via webhook or polling, eliminating manual reconciliation.

#### 5.4.4 Communication Integrations

**Slack** uses incoming webhooks and the Slack API for alerts, report links, and severity routing. A slash command enables analysis triggering and status queries from Slack. **Discord** uses webhook posting to server channels.

Routing is workspace-configurable by severity (Critical → alerts channel, Informational → digest) and domain (security → security channel, DevOps → infrastructure). Payloads include summaries with direct links to evidence chains, minimizing channel noise while preserving analytical depth.
