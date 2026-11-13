# Development Plan and Architecture Decisions

> Implementation roadmap and working contract for the multi-tenant,
> metadata-driven application platform.

**Document status:** Initial baseline. Review and amend through explicit
architecture decisions.\
**Product strategy:** Self-hostable first, SaaS-ready from day one.\
**V1 application:** Headless CMS template built on a generic
metadata-driven core.\
**Primary stack:** TypeScript, Next.js, NestJS, PostgreSQL, Prisma,
pnpm, Turborepo, Docker Compose.

------------------------------------------------------------------------

# 1. Purpose of This Document

This document is the detailed engineering plan for developers and AI
coding agents. It exists to prevent architectural drift, mismatched
frontend/backend assumptions, premature complexity, and accidental loss
of tenant customizations.

It defines: - Product scope and non-goals - Architecture and dependency
boundaries - Data and metadata strategy - Multi-tenancy and security
requirements - API and Admin Studio contracts - CLI, configuration,
templates, and plugins - Development phases and acceptance criteria -
Testing and release gates - Risks and unresolved decisions - Rules for
AI-assisted implementation

If implementation reality changes, update this document and record the
reason. Do not let code and architecture documentation quietly diverge.

------------------------------------------------------------------------

# 2. Product Goal and Scope

## 2.1 Goal

Build a reusable application platform where users/developers define
entities, fields, relationships, permissions, and application
configuration as metadata. The platform provides the runtime to store,
validate, authorize, query, and expose those records through APIs and a
default Admin Studio.

The first application is a headless CMS template. Other application
types are future templates.

## 2.2 Primary users

1.  **Self-hosting organization:** installs the platform on its own
    infrastructure and manages one organization by default.
2.  **SaaS tenant:** uses an isolated tenant on a shared hosted
    platform.
3.  **Platform administrator:** provisions installations/tenants and
    manages platform-level operations.
4.  **Tenant administrator:** configures entities, fields, roles, and
    content.
5.  **Developer:** uses APIs, SDK, CLI, config files, and plugins to
    build custom applications.
6.  **Frontend developer:** builds a website/mobile app without being
    forced to use the Admin Studio.

## 2.3 Product boundaries

The core is a generic metadata and application runtime. CMS-specific
content models and publishing concepts belong in the CMS template or a
CMS-specific extension.

The core must not contain conditional logic such as: -
`if (module === 'crm')` - `if (entity === 'article')` to implement
CMS-only behavior - Ecommerce order/payment assumptions in generic
record services

Generic capabilities belong in core. Domain-specific behavior belongs in
a template/plugin using stable extension points.

## 2.4 Non-goals for initial release

Do not implement all of these during the foundation phase: - CRM,
ecommerce, HRMS, projects - GraphQL - Workflow automation builder -
Visual page builder - Plugin marketplace - Multi-region SaaS -
Kubernetes - Generic support for PostgreSQL, MySQL, MongoDB, SQLite, and
arbitrary databases - Arbitrary custom SQL or DDL from tenant UI -
Complex billing and metering - Distributed microservices

------------------------------------------------------------------------

# 3. Architecture Baseline

## 3.1 Logical architecture

``` text
Customer Frontends / Mobile Apps / Admin Studio / CLI
                         |
                  REST API v1
                         |
              API and Application Layer
                         |
        Tenant Context + Authentication + Authorization
                         |
       Metadata Engine + Validation + Relationship Engine
                         |
             Record Query / Command Services
                         |
             Persistence Abstraction
                         |
                 PostgreSQL
                         |
        Events / Audit / Background Jobs (later)
```

The Admin Studio is a client. It is not the application engine.

## 3.2 Four architectural layers

### Layer A: Experience

-   Admin Studio
-   Customer frontends
-   Mobile apps
-   CLI and developer tooling

### Layer B: Application engine

-   Tenant context
-   Metadata registry
-   Entity/field/relationship definitions
-   Record storage/querying
-   Validation
-   Authorization
-   API serialization
-   Audit trail

### Layer C: Extension platform

-   Templates
-   Plugins
-   Events/hooks
-   SDK
-   CLI
-   Configuration sync
-   Migrations/upgrades

### Layer D: Infrastructure

-   PostgreSQL
-   Object storage
-   Cache/queue
-   Search
-   Logs/metrics
-   Deployment and backup

## 3.3 Dependency direction

Allowed: - Admin app -\> API contracts/SDK - API -\> application
services -\> domain packages - Domain packages -\> defined persistence
interfaces - Template -\> public platform contracts - Plugin -\>
documented extension APIs

Not allowed: - Core -\> CMS template - Core -\> CRM/ecommerce-specific
logic - Database adapter -\> frontend - React components -\> direct
database access - Template -\> private internal implementation details
of core - Circular package dependencies

## 3.4 Architecture style

Begin with a **modular monolith**, not microservices.

Reasons: - One developer/small team can build and debug it. -
Transactions and metadata operations are easier to coordinate. -
Deployment and infrastructure costs stay low. - Modules can be separated
later if scale or team boundaries justify it.

Enforce module boundaries in code. A modular monolith is not permission
to put everything in one giant service.

------------------------------------------------------------------------

# 4. Architecture Decision Records

The following decisions are the initial baseline. Each should be
revisited only with a clear reason and migration impact.

Each ADR below also exists as its own file in `docs/decisions/`, which
is the canonical location. New decisions (ADR-013 onward) are recorded
only there.

## ADR-001: One product for self-hosted and SaaS

**Decision:** Use the same codebase and runtime for self-hosted and SaaS
deployments.

**Rationale:** Avoid maintaining two products. Self-hosted customers
operate their own infrastructure; SaaS uses shared infrastructure and
tenant provisioning.

**Consequences:** - Tenant context is a core concern. - Deployment
configuration controls single-tenant or multi-tenant mode. -
SaaS-specific billing/provisioning is layered around the same runtime. -
Do not build a separate SaaS codebase.

## ADR-002: Self-hostable first, SaaS-ready

**Decision:** Prioritize local Docker development and self-hosted
installation, while enforcing SaaS-quality tenant isolation from the
beginning.

**Rationale:** Current budget does not justify expensive infrastructure.
A reliable self-hosted product can be developed and tested before
significant SaaS hosting investment.

**Consequences:** - Docker Compose is a first-class development and
deployment path. - Free cloud tiers are for demos/testing, not
production guarantees. - Avoid infrastructure that is not needed by
current usage.

## ADR-003: PostgreSQL first

**Decision:** PostgreSQL is the only required database for V1.

**Rationale:** JSONB, transactions, indexing, constraints, and mature
tooling fit the metadata-driven design.

**Consequences:** - Use PostgreSQL-specific features intentionally. - Do
not promise MySQL compatibility in V1. - Keep persistence behind an
internal interface where useful, but do not build speculative adapters.

## ADR-004: Relational system tables + JSONB records

**Decision:** Platform/system data uses relational tables.
Metadata-managed business record values use JSONB in a generic records
table.

**Rationale:** Avoid both constant physical schema changes and the
complexity of pure EAV storage.

**Consequences:** - Metadata drives validation and serialization. -
Query/index design must be tested for common field types. - Add
specialized physical tables only when a measured use case requires
them. - Do not expose arbitrary DDL to tenant users.

## ADR-005: NestJS and TypeScript backend

**Decision:** Use NestJS with TypeScript for the API and application
runtime.

**Rationale:** Modular structure, dependency injection, validation,
OpenAPI support, and shared language with frontend/CLI.

**Consequences:** - Keep controllers thin. - Domain/application services
own behavior. - Avoid NestJS decorators becoming the only definition of
dynamic tenant metadata.

## ADR-006: Next.js Admin Studio, independently headless

**Decision:** Use Next.js for the default Admin Studio. Customer
frontends use APIs/SDK independently.

**Rationale:** A strong default UX without locking customers into a
platform-owned frontend.

**Consequences:** - Admin Studio consumes API contracts. - Dynamic
forms/tables are rendered from metadata. - No business-critical
authorization is implemented only in the UI.

## ADR-007: REST first, OpenAPI as contract

**Decision:** Versioned REST API first. OpenAPI is the published
contract. GraphQL is deferred.

**Rationale:** Broad compatibility and straightforward integration with
web/mobile clients.

**Consequences:** - Standardize response, error, pagination, filtering,
and auth behavior. - Generate client types/SDK from the API
specification where possible. - Avoid undocumented endpoint behavior.

## ADR-008: Modular monolith

**Decision:** One deployable backend with explicit modules and
dependency boundaries.

**Rationale:** Lower operational complexity and faster development while
the product is small.

**Consequences:** - Use module contracts and tests. - Extract services
only when operational/team needs justify it. - No premature message
broker or service mesh.

## ADR-009: Templates define applications

**Decision:** CMS, CRM, ecommerce, projects, and HRMS are template
packages built on core capabilities.

**Rationale:** The platform should not become a collection of hardcoded
application modules.

**Consequences:** - Core exposes stable contracts. - CMS-specific
publishing logic stays outside generic record CRUD. - Template versions
and dependencies must be explicit.

## ADR-010: Config files are version-controlled desired state

**Decision:** Runtime database metadata is authoritative for the live
installation; config files are a version-controlled representation used
for diff/import/export.

**Rationale:** Developers need Git workflows without creating two
silently competing sources of truth.

**Consequences:** - CLI provides diff/preview before sync. - Migrations
represent ordered changes. - Secrets are excluded from exported
config. - Conflicts require explicit resolution.

## ADR-011: Upgrade safety is a core platform capability

**Decision:** Templates/plugins/platform upgrades must be versioned and
migration-driven.

**Rationale:** Tenant customizations and data must survive updates.

**Consequences:** - Track installed versions and ownership of managed
metadata. - Produce migration plans and conflict reports. - Preserve
tenant-created definitions. - Back up before risky production upgrades.

## ADR-012: SaaS infrastructure is staged

**Decision:** Do not design for massive scale or pay for unnecessary
infrastructure before there are users.

**Rationale:** The early goal is product validation, not speculative
infrastructure.

**Consequences:** - Local Docker first. - Small demo/private beta
environment next. - Add managed database, object storage, workers,
monitoring, and redundancy as real usage requires.

------------------------------------------------------------------------

# 5. Technology and Repository Plan

## 5.1 Proposed stack

  Concern            Choice                               Timing
  ------------------ ------------------------------------ -----------------------------
  Runtime            Supported Node.js LTS                Foundation
  Language           TypeScript strict mode               Foundation
  Package manager    pnpm                                 Foundation
  Monorepo           pnpm workspaces + Turborepo          Foundation
  Backend            NestJS                               Foundation
  Frontend           Next.js + React                      Foundation
  Styling            Tailwind + shadcn/ui                 Admin UI phase
  API                REST + OpenAPI                       Foundation/API phase
  Database           PostgreSQL                           Foundation
  ORM                Prisma                               Foundation
  Dynamic records    JSONB                                Metadata phase
  Forms              React Hook Form + Zod                Admin UI phase
  API state          TanStack Query                       Admin UI phase
  Local deployment   Docker Compose                       Foundation
  Object storage     Storage interface; local initially   Media phase
  Redis/BullMQ       Deferred                             When async jobs require it
  Search engine      Deferred                             When query needs justify it
  SDK                TypeScript                           API/DX phase
  CLI                TypeScript                           API/DX phase

Use currently supported versions at implementation time. Pin versions
and commit the lockfile.

## 5.2 Suggested repository

``` text
platform/
├── apps/
│   ├── admin/
│   └── api/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── metadata/
│   ├── database/
│   ├── auth/
│   ├── permissions/
│   ├── validation/
│   ├── api-engine/
│   ├── events/
│   ├── sdk/
│   ├── cli/
│   └── template-engine/
├── templates/
│   └── cms/
├── plugins/
├── infrastructure/
│   └── docker/
├── docs/
│   ├── architecture/
│   ├── decisions/
│   └── api/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
└── developmentPlan.md
```

Do not create every package as an empty folder on day one. Start with
the actual modules needed for the first vertical slice. Split packages
when a stable boundary exists.

## 5.3 Module responsibilities

  -----------------------------------------------------------------------
  Module                  Owns                    Must not own
  ----------------------- ----------------------- -----------------------
  Tenant context          Tenant resolution and   Business record rules
                          request/job context     

  Auth                    Identity, sessions,     Tenant-specific
                          credentials, API keys   business permissions

  Permissions             Authorization policies  UI visibility as sole
                          and checks              enforcement

  Metadata                Entity, field, relation CMS-specific publishing
                          definitions and         
                          versioning              

  Validation              Metadata-driven input   Frontend-only rules
                          validation              

  Database                Persistence             HTTP request handling
                          implementation and      
                          transactions            

  API engine              Generic record          Template-specific
                          operations and          business processes
                          serialization           

  Template engine         Install, upgrade,       Core record engine
                          dependency checks       internals

  Events                  Typed internal          Arbitrary untrusted
                          events/hooks            code execution

  SDK                     Client API contracts    Server-side
                                                  authorization
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 6. Multi-Tenancy Design

## 6.1 Modes

  -----------------------------------------------------------------------
  Mode                                Behavior
  ----------------------------------- -----------------------------------
  Self-hosted single tenant           One organization context; tenant
                                      features may still be internally
                                      represented consistently

  Self-hosted multi-tenant            Multiple isolated organizations in
                                      one installation

  SaaS                                Multiple isolated organizations on
                                      shared runtime
  -----------------------------------------------------------------------

Prefer a consistent internal tenant model even for single-tenant
installations. A single-tenant mode can resolve to the installation's
configured tenant.

## 6.2 Tenant resolution

Tenant identity must come from trusted server-side resolution: -
Verified domain/subdomain mapped to a tenant - Authenticated user's
membership and selected tenant - Installation configuration in
single-tenant mode - A trusted platform gateway context, if later
introduced

Do not accept a client-provided tenant ID as proof of access.

## 6.3 Tenant-aware data

Tenant scope must be applied to: - Records - Entity and field
definitions where tenant-owned - Users/memberships where applicable -
Roles and permissions - Media metadata and object keys - API keys -
Audit events - Background jobs - Cache keys - Exports/imports - Rate
limits and usage metrics

## 6.4 Defense in depth

-   Explicit tenant scope in repository/query methods.
-   Composite uniqueness constraints where needed.
-   RLS considered as a second layer.
-   Tenant context established per request and per job.
-   Cross-tenant integration tests.
-   No unscoped "find by ID" for tenant-owned resources unless the
    tenant is also supplied and verified.

## 6.5 Required isolation tests

For two tenants A and B: - A cannot list B's records. - A cannot read
B's record by guessed ID. - A cannot update or delete B's record. - A
cannot read B's metadata unless explicitly shared. - A cannot access B's
media. - A cannot use B's API key. - Background job for A cannot process
B's data. - Cache results never cross tenants. - Search results,
exports, and audit views remain tenant-scoped.

These are release blockers, not optional quality improvements.

------------------------------------------------------------------------

# 7. Metadata and Record Architecture

## 7.1 Core concepts

-   **Entity:** a collection/type of records, such as Product.
-   **Field:** a typed property of an entity, such as `name`.
-   **Relationship:** a typed connection between entities.
-   **Record:** one instance of an entity.
-   **View:** presentation/query configuration, not the source of
    authorization.
-   **Metadata version:** a versioned snapshot/change history of
    definitions.

## 7.2 Stable identifiers

Use stable IDs for entities, fields, and relationships. Human-readable
keys/slugs may change under controlled migration, but internal
references should not rely exclusively on mutable labels.

## 7.3 Metadata lifecycle

At minimum, distinguish: - Draft metadata, if editing/publishing
definitions is needed - Active metadata used by runtime requests -
Archived/deleted definitions - System/template-managed definitions -
Tenant-created definitions - Extension-managed definitions

Do not delete metadata that is still referenced by records without an
explicit migration/deprecation strategy.

## 7.4 Metadata versioning

When definitions change: 1. Validate the proposed metadata. 2. Determine
whether the change is compatible. 3. Identify affected records and
indexes. 4. Generate a migration/impact plan. 5. Apply the metadata
change. 6. Record version and actor. 7. Keep enough history to diagnose
or recover.

Do not assume every metadata edit needs a physical database migration.
JSONB field additions may be metadata-only; type changes, uniqueness,
indexing, and relationship changes may need data validation or
backfills.

## 7.5 Field types and behavior matrix

Every supported field type must define: - Metadata schema - Input
validation - Default value behavior - Storage representation - API
serialization - Filtering and sorting support - Admin UI input/display
component - Permission behavior - Migration behavior

Initial field types: - text - integer - decimal - boolean - date -
datetime - single select - multi-select - relation - media reference

Add rich text, computed fields, geospatial, formula, and advanced JSON
only after their contracts are designed.

## 7.6 JSONB record model

Conceptual table:

``` text
records
- id
- tenant_id
- entity_id
- data JSONB
- created_at
- updated_at
- created_by
- updated_by
```

Consider soft deletion, optimistic concurrency, and metadata version
references during schema design. Do not add them blindly; define their
semantics first.

## 7.7 Query engine requirements

Support in stages: - List and get - Pagination with a hard maximum -
Sorting by allowed fields - Filtering by supported operators and field
types - Field selection - Relationship expansion with depth/complexity
limits

Never trust arbitrary field names/operators. Build query plans from
validated metadata and safe parameterized queries.

------------------------------------------------------------------------

# 8. Relationships

Define relation metadata explicitly. Required dimensions: - Source
entity/field - Target entity - Cardinality - Required/optional -
Ownership - Delete behavior - Tenant compatibility - Read/write
permissions - Serialization and expansion rules

Start with many-to-one and one-to-many if that provides the cleanest
first implementation. Add many-to-many when its storage, query, and UI
behavior are fully tested.

A relation must never allow a record from Tenant A to reference a record
from Tenant B unless cross-tenant references become an explicit, highly
controlled platform feature. They are not part of V1.

------------------------------------------------------------------------

# 9. API Contract and Security

## 9.1 Endpoint direction

Proposed generic record routes:

``` text
GET    /api/v1/entities/:entityKey/records
GET    /api/v1/entities/:entityKey/records/:recordId
POST   /api/v1/entities/:entityKey/records
PATCH  /api/v1/entities/:entityKey/records/:recordId
DELETE /api/v1/entities/:entityKey/records/:recordId
```

Proposed admin metadata routes:

``` text
GET    /api/v1/admin/entities
POST   /api/v1/admin/entities
GET    /api/v1/admin/entities/:entityId
PATCH  /api/v1/admin/entities/:entityId
POST   /api/v1/admin/entities/:entityId/fields
```

Finalize exact route structure and naming before implementing multiple
modules.

## 9.2 API surfaces

-   Public: published/publicly accessible data only.
-   Authenticated: user-accessible records.
-   Admin: metadata and platform/tenant management.

Public access must be opt-in. Drafts and internal fields must not leak
through generic serialization.

## 9.3 Standard contracts

Define before building the full Admin Studio: - Success response shape -
Error response shape and error codes - Pagination - Sorting and
filtering syntax - Field selection - Relationship expansion -
Authentication - Tenant resolution - Rate limits - Idempotency
requirements for relevant operations - API versioning and deprecation

## 9.4 Authorization order

A generic request should follow a controlled sequence: 1. Resolve
installation and tenant context. 2. Authenticate caller. 3. Verify
tenant membership/API key scope. 4. Load entity metadata within
tenant/system scope. 5. Authorize entity action. 6. Load record with
tenant and entity scope. 7. Authorize record action. 8. Validate
readable/writable fields. 9. Validate input and relationships. 10.
Execute persistence operation. 11. Serialize only permitted fields. 12.
Emit audit event.

The exact implementation can differ, but the security guarantees must
remain.

## 9.5 OpenAPI and SDK

-   Publish OpenAPI for each supported API version.
-   Use it to generate API documentation and TypeScript client types.
-   Avoid maintaining duplicate hand-written API interfaces in multiple
    places.
-   Add contract tests for critical routes.
-   Keep SDK version compatibility explicit.

------------------------------------------------------------------------

# 10. Admin Studio Plan

## 10.1 UX scope

Build only the UI needed to complete the first vertical slice: - Login -
Tenant/workspace context - Entity list - Entity create/edit - Field
create/edit - Record list - Dynamic record create/edit form - Record
detail

Later: - Relationship manager - Media library - Roles/permissions UI -
API explorer - Template/plugin manager - Audit log - Dashboard

## 10.2 Dynamic UI contract

Backend metadata determines: - Field component type - Label and help
text - Required status - Defaults - Validation - Read-only/hidden
status - Relation options and permissions

The UI may provide immediate feedback, but the backend must repeat all
security and validation checks.

## 10.3 Avoid the previous integration failure

Do not build a large UI first and retrofit APIs later.

For each feature: 1. Define metadata/API contract. 2. Implement backend
behavior. 3. Add integration tests. 4. Implement UI using the contract.
5. Test the same operation through UI and API. 6. Verify tenant
isolation.

------------------------------------------------------------------------

# 11. CLI and Configuration System

## 11.1 CLI scope, later phase

Potential commands:

``` bash
yourplatform dev
yourplatform build
yourplatform entities:list
yourplatform generate entity Product
yourplatform export
yourplatform import
yourplatform schema:pull
yourplatform schema:diff
yourplatform schema:push
yourplatform template:install cms
yourplatform template:update cms
yourplatform plugin:install example-plugin
yourplatform update:check
yourplatform upgrade
```

Command names are provisional.

## 11.2 Config layout

Potential structure:

``` text
platform.config.ts
entities/
  product.json
  article.json
relationships/
  article-category.json
templates/
plugins/
themes/
migrations/
```

## 11.3 Sync rules

-   Database metadata is runtime truth.
-   Config files represent desired, version-controlled definitions.
-   `diff` must be read-only.
-   `push` must show a plan before applying changes.
-   Destructive operations require explicit confirmation.
-   Import/export must exclude secrets and tenant-private runtime data
    unless explicitly requested.
-   Conflicts must be reported, not silently overwritten.

------------------------------------------------------------------------

# 12. Template and Plugin System

## 12.1 CMS template first

CMS template should eventually define: - Article or Page entity -
Categories/tags - Media references - Draft/published state - Slug and
SEO metadata - Publishing permissions - Public API visibility rules -
Optional starter views

Do not put CMS-only publishing semantics into generic record CRUD.

## 12.2 Template manifest

A template manifest should eventually identify: - Name and unique ID -
Version - Compatible platform versions - Dependencies - Included
metadata definitions - Migrations - Permissions/capabilities -
Install/upgrade hooks - Documentation

## 12.3 Managed versus custom metadata

Every installed definition should have ownership information: -
Core-managed - Template-managed - Plugin-managed - Tenant-created

Upgrade engine must distinguish these. Template upgrades may update
managed definitions but must preserve tenant-created customizations. If
a tenant edits a template-managed definition, record the override and
surface conflicts during upgrades.

## 12.4 Plugin trust model

Start with trusted plugins installed by an administrator. Do not execute
arbitrary uploaded code as a tenant feature.

Define capabilities and permissions. A plugin should receive only the
APIs it needs. Plugin lifecycle and failure handling must not compromise
tenant isolation.

------------------------------------------------------------------------

# 13. Infrastructure and Deployment

## 13.1 Local development

Docker Compose should eventually run: - PostgreSQL - API - Admin -
Optional object storage service for media development

Redis, queue workers, and search should be added only when required by
implemented features.

## 13.2 Self-hosted deployment

Provide: - Environment variable template - Docker Compose deployment -
Database migration command - Initial admin/tenant setup - Persistent
volume guidance - Backup and restore documentation - Upgrade
instructions - Health checks - Secure production configuration checklist

Never ship default production credentials.

## 13.3 SaaS deployment progression

### Stage 1: Development

-   Local Docker Compose
-   Local database
-   Seed/test tenants

### Stage 2: Demo/private beta

-   One small hosted environment
-   Managed PostgreSQL or carefully managed database
-   Cloudflare or equivalent edge/DNS protection
-   Basic monitoring and backups
-   No uptime or scale promises based on free-tier infrastructure

### Stage 3: First paying tenants

-   Small VPS or suitable managed hosting
-   Automated database backups and restore drills
-   Persistent object storage
-   Error monitoring
-   Resource limits and tenant quotas
-   Basic usage metering

### Stage 4: Growing SaaS

-   Separate web/API and worker processes as justified
-   Database monitoring and connection-pool management
-   Queue-backed background work
-   Multiple app instances
-   Stronger observability and incident response
-   Optional dedicated database/isolated deployment for larger customers

Do not optimize for thousands of tenants before validating the product
with real users.

## 13.4 Backups

Define: - What is backed up (database, media, configuration, secrets
recovery process) - Frequency and retention - Encryption and access
controls - Restore procedure - Recovery point and recovery time
objectives when known - Regular restore tests

A backup that has never been restored is merely an optimistic file.

------------------------------------------------------------------------

# 14. Development Roadmap

Build in phases. Each phase has a measurable exit condition. Do not
start the next phase just because the current one has a polished
screenshot.

## Phase 0: Repository and engineering foundation

**Goal:** A reproducible project structure with working local
development.

Tasks: - Initialize pnpm workspace and Turborepo. - Add strict
TypeScript configuration. - Add formatting, linting, and test
conventions. - Create NestJS API app. - Create Next.js Admin app. - Add
PostgreSQL through Docker Compose. - Add Prisma and initial migration
workflow. - Add environment variable validation. - Add health
endpoints. - Add CI for install, lint, typecheck, and tests. - Document
local setup.

Acceptance criteria: - New developer can clone and start the project
using documented commands. - API and Admin start locally. - Database
migrations run predictably. - CI catches lint/type/test failures. - No
secrets are committed.

Do not create all future packages as empty scaffolding.

## Phase 1: Identity, tenancy, and authorization foundation

**Goal:** Prove tenant context and user access before business data
exists.

Tasks: - Define installation and tenant model. - Implement user identity
and authentication. - Implement tenant membership. - Implement trusted
tenant resolution. - Implement basic roles and permissions. - Add
request-scoped tenant context. - Add tenant-aware repository/query
conventions. - Add audit event foundation. - Add two-tenant integration
tests.

Acceptance criteria: - Two tenants can be initialized. - Users can
authenticate and access only their tenant. - Tenant context is not
accepted blindly from the client. - Cross-tenant tests fail safely. -
Tenant context works in API requests and is designed for background
jobs.

## Phase 2: Metadata engine

**Goal:** Create and version entities and fields.

Tasks: - Define entity metadata schema. - Define field metadata
schema. - Define supported field types. - Implement metadata CRUD
through protected admin APIs. - Implement metadata validation. -
Implement metadata ownership and status. - Add metadata version
history. - Define safe metadata update behavior. - Add unit and
integration tests.

Acceptance criteria: - Tenant admin can create an entity. - Tenant admin
can add/edit supported fields. - Invalid definitions are rejected. -
Metadata is tenant-scoped. - Stable IDs and keys are used. - Metadata
can be read by the runtime record engine.

## Phase 3: Generic record engine

**Goal:** Create and query records using metadata.

Tasks: - Create JSONB record persistence. - Implement
create/read/update/delete. - Validate record data using field
metadata. - Implement default values and required fields. - Implement
safe filtering, sorting, pagination. - Implement field-level read/write
filtering. - Add audit events. - Add tenant-aware indexes. - Add
concurrency strategy if required by observed use cases.

Acceptance criteria: - A Product entity with text, decimal, and boolean
fields works. - Valid records can be created and read. - Invalid records
are rejected with stable error codes. - Records cannot cross entity or
tenant boundaries. - List/query limits are enforced. - API serialization
respects field permissions.

## Phase 4: First Admin Studio vertical slice

**Goal:** Use the engine through the UI, not only through manual API
calls.

Tasks: - Login and tenant context UI. - Entity list/create/edit. - Field
builder for initial types. - Dynamic record list. - Dynamic create/edit
form. - Error and loading states. - API client generated/typed from
contract. - End-to-end UI tests.

Acceptance criteria: - Admin creates Product and fields in the UI. -
Admin creates and edits a Product record in the UI. - The same record is
accessible through REST. - API-created records appear in the UI. - UI
and backend agree on field types and validation. - Tenant isolation
remains enforced.

This phase explicitly prevents the earlier failure mode where the UI and
API evolve as separate systems.

## Phase 5: Relationships and query expansion

**Goal:** Add controlled entity relationships.

Tasks: - Define relationship metadata. - Implement initial
cardinalities. - Validate target records and tenant scope. - Add
relationship UI controls. - Add API serialization/expansion. - Add
cycle/depth/query complexity limits. - Add migration behavior for
relationship changes.

Acceptance criteria: - A record can reference an allowed record in the
same tenant. - Invalid and cross-tenant references are rejected. - Read
permissions apply to related records. - Query expansion cannot create
unbounded recursive loads.

## Phase 6: API hardening and developer experience

**Goal:** Make the platform usable by external developers.

Tasks: - Finalize REST API conventions. - Publish OpenAPI. - Add
TypeScript SDK generation. - Add API key management and scopes. - Add
API explorer or usable docs. - Add config export/import. - Add schema
diff/preview. - Add initial CLI commands. - Add rate and request limits.

Acceptance criteria: - A separate frontend can consume the API without
depending on Admin internals. - API docs match actual behavior. - SDK
types match OpenAPI. - Config export/import round-trips supported
metadata. - Destructive sync operations require explicit confirmation.

## Phase 7: Media and CMS template

**Goal:** Build the first real application on top of the core.

Tasks: - Define storage abstraction. - Implement media metadata and
upload validation. - Add local development storage. - Define CMS
entities and publishing model. - Add draft/published lifecycle. - Add
public read API rules. - Add SEO fields and slug behavior. - Add CMS
template manifest and install process. - Add basic CMS documentation.

Acceptance criteria: - CMS template installs on a clean platform. - CMS
definitions are template-managed. - Tenant custom definitions are
preserved. - Public API exposes only published/public content. - Media
access follows tenant and permission rules.

## Phase 8: Template/plugin lifecycle and upgrades

**Goal:** Safely evolve installations.

Tasks: - Version template manifests. - Track installed template/plugin
versions. - Track metadata ownership. - Implement migration plan/diff. -
Detect tenant customization conflicts. - Implement upgrade history. -
Add backup guidance and recovery workflow. - Define plugin manifest and
capability model. - Add trusted plugin lifecycle hooks.

Acceptance criteria: - Template upgrade can be previewed. -
Tenant-created fields and records survive. - Breaking changes are
reported. - Migration failures are visible and recoverable. - Plugin
permissions are explicit. - No arbitrary untrusted plugin execution.

## Phase 9: Production readiness and first SaaS pilot

**Goal:** Operate a small real installation safely.

Tasks: - Production Docker configuration. - Secure secrets and
environment setup. - Health/readiness checks. - Structured logs and
error tracking. - Database backup automation and restore test. - Storage
persistence and lifecycle. - Rate limits and basic tenant quotas. -
Basic resource/usage visibility. - Deployment and upgrade runbooks. -
Security review and dependency scan.

Acceptance criteria: - Fresh self-hosted installation follows documented
steps. - Upgrade path is documented and tested. - Backup restore has
been demonstrated. - Tenant isolation suite passes in CI. - Basic
operational failures are observable. - SaaS pilot limits are explicit
and monitored.

------------------------------------------------------------------------

# 15. The First Vertical Slice: Detailed Acceptance Test

This is the first end-to-end milestone and should be treated as the
primary proof of architecture.

1.  Start local services.
2.  Create Tenant A and Tenant B.
3.  Create an admin user for each tenant.
4.  Sign in as Tenant A.
5.  Create entity `Product`.
6.  Add:
    -   `name`: text, required
    -   `price`: decimal, required, non-negative
    -   `isActive`: boolean, default true
7.  Save metadata.
8.  Create a Product record in Admin Studio.
9.  Read/list/update/delete records through the REST API.
10. Create a record through API and confirm it appears in Admin Studio.
11. Submit invalid data and confirm backend validation rejects it.
12. Authenticate as Tenant B and attempt to access Tenant A
    entity/record IDs.
13. Confirm every cross-tenant operation is denied or returns a safe
    not-found response.
14. Confirm audit events are created for supported sensitive operations.

**Exit condition:** all steps work in automated integration/e2e tests,
not only in a manual demo.

------------------------------------------------------------------------

# 16. Testing Strategy

## 16.1 Unit tests

-   Field type validators
-   Metadata schema validators
-   Permission evaluation
-   Tenant context resolution
-   Query/filter parser
-   Template manifest validation
-   Migration planner

## 16.2 Integration tests

-   Database repositories
-   Metadata persistence
-   Record CRUD
-   Relationship integrity
-   Auth and permissions
-   Tenant isolation
-   Audit events
-   Metadata updates and record compatibility

## 16.3 End-to-end tests

-   Login
-   Create entity
-   Add fields
-   Create/edit/list records
-   API and UI consistency
-   Tenant A/B isolation
-   CMS template installation and public API behavior when implemented

## 16.4 Contract tests

-   OpenAPI validity
-   Response/error schemas
-   SDK compatibility
-   API version behavior

## 16.5 Required test rule

Any change to tenant-owned data access must include tenant isolation
coverage. A test that only proves the happy path is not sufficient.

------------------------------------------------------------------------

# 17. Security and Operational Release Gates

Do not call a release ready unless applicable gates pass:

-   [ ] Tenant identity is resolved from a trusted source.
-   [ ] Every tenant-owned query is scoped.
-   [ ] Cross-tenant integration tests pass.
-   [ ] Authentication and authorization are server-enforced.
-   [ ] Field-level permissions are enforced in serialization and
    writes.
-   [ ] Inputs are validated against metadata.
-   [ ] Query/filter/sort inputs are constrained.
-   [ ] Pagination and request size limits exist.
-   [ ] File uploads are validated.
-   [ ] Secrets are not committed or logged.
-   [ ] Audit events cover sensitive operations.
-   [ ] Database migrations are reviewed.
-   [ ] Backup/restore process is documented for production.
-   [ ] API documentation matches implementation.
-   [ ] Logs do not leak credentials or private record data.

------------------------------------------------------------------------

# 18. Performance and Scaling Rules

Do not optimize based on imaginary traffic. Do design so obvious
bottlenecks can be measured and addressed.

Initial rules: - Use connection pooling appropriate to the deployment. -
Avoid N+1 relationship queries. - Add indexes based on actual query
patterns. - Enforce page-size and query-depth limits. - Avoid loading
entire collections into memory. - Cache metadata only with explicit
tenant-aware keys and invalidation rules. - Do not cache
authorization-sensitive record responses until policy and invalidation
behavior are understood. - Use background jobs for genuinely
slow/retryable work. - Add Redis only when cache/queue requirements
justify it. - Measure database query time and API latency before scaling
infrastructure.

Potential later concerns: - Tenant-level quotas - Per-tenant rate
limits - Database partitioning or dedicated databases - Worker
isolation - Read replicas - Search indexing - Object storage lifecycle
policies

These are not V1 requirements.

------------------------------------------------------------------------

# 19. Risks and Mitigations

  ----------------------------------------------------------------------------
  Risk                    Why it matters          Mitigation
  ----------------------- ----------------------- ----------------------------
  UI/backend drift        Admin UI may assume     Contract-first vertical
                          behavior the API does   slices; API-driven UI
                          not provide             

  Cross-tenant data leak  Severe security failure Trusted tenant context,
                                                  scoped queries, RLS defense,
                                                  isolation tests

  Metadata complexity     Dynamic systems can     Small field type registry,
                          become difficult to     versioned metadata, explicit
                          validate and migrate    behavior matrix

  JSONB query performance Arbitrary dynamic       Supported operators,
                          filtering can become    selective indexes, query
                          slow                    limits, measured
                                                  optimization

  Template upgrade        Customers lose work     Ownership tracking,
  overwrites                                      diff/preview, conflict
  customizations                                  detection, migrations

  Overengineering         Delivery slows and      Modular monolith, defer
                          infrastructure costs    Redis/search/microservices
                          rise                    

  Competing sources of    Config and database     Database runtime truth,
  truth                   metadata diverge        config as desired state,
                                                  diff/preview

  Plugin security         Extensions can          Trusted plugins first,
                          compromise the platform capability model, no
                                                  arbitrary uploaded code

  Free-tier dependency    Limits or policy        Treat free tiers as
                          changes can disrupt     temporary demo
                          demos                   infrastructure

  Too much scope          Product never reaches   First vertical slice and
                          users                   phase exit criteria
  ----------------------------------------------------------------------------

------------------------------------------------------------------------

# 20. Open Decisions to Resolve During Implementation

Do not guess these silently. Record the decision when the relevant phase
begins.

1.  **Authentication method:** session cookies versus token-based access
    for Admin Studio and external APIs. Consider separate browser and
    machine-client flows.
2.  **Tenant domain model:** subdomain/custom-domain mapping and tenant
    selection UX.
3.  **User membership:** whether one user can belong to multiple tenants
    in V1.
4.  **Role model:** built-in roles versus fully customizable roles in
    the first release.
5.  **Record deletion:** hard delete versus soft delete and retention
    behavior.
6.  **Optimistic concurrency:** whether records need version
    numbers/ETags in the first release.
7.  **Metadata publishing:** immediate activation versus draft/publish
    metadata lifecycle.
8.  **Unique fields:** how uniqueness is enforced for arbitrary JSONB
    values and tenant scope.
9.  **Relationship storage:** JSON references versus relation tables for
    each cardinality.
10. **Media storage:** exact S3-compatible provider and local
    development approach.
11. **Audit retention:** event detail, retention period, and export
    requirements.
12. **Public API auth:** public anonymous access rules and cache policy.
13. **Template customization:** exact override/conflict semantics.
14. **Licensing:** community/self-hosted and paid SaaS/business
    licensing model.
15. **Billing:** deferred until real SaaS pilot requirements are known.

For each decision, add an ADR under `docs/decisions/` with context,
options, decision, consequences, and date.

**Resolved (2026-11-13):** 1 → ADR-013, 2 → ADR-017, 3 → ADR-014,
4 → ADR-018, 5 → ADR-015, 6 → ADR-019, 7 → ADR-020, 8 → ADR-021,
9 → ADR-022, 10 → ADR-023, 11 → ADR-024, 12 → ADR-025, 13 → ADR-026,
14 → ADR-016 (AGPL-3.0), 15 → ADR-027 (deferred).

------------------------------------------------------------------------

# 21. AI Coding Agent Operating Instructions

This section is mandatory guidance for Claude Code, Codex, and other
coding agents.

## 21.1 Before starting a task

1.  Read `README.md` and `developmentPlan.md`.
2.  Inspect the actual repository state. Do not assume this plan has
    already been implemented.
3.  Identify the current phase and the requested milestone.
4.  Read relevant source files, tests, and ADRs.
5.  Summarize the intended change, boundaries, and tests before making
    broad edits.
6.  If requirements conflict or a decision is unresolved, report the
    ambiguity instead of inventing a permanent architecture.

## 21.2 While working

-   Implement only the requested task and its necessary dependencies.
-   Do not skip ahead to future phases.
-   Do not replace the chosen stack without approval.
-   Do not create microservices.
-   Do not add Redis, search, queues, or extra infrastructure without a
    concrete requirement.
-   Do not create speculative abstractions for hypothetical database
    providers.
-   Keep modules cohesive and dependency direction explicit.
-   Use strict TypeScript and avoid `any`.
-   Validate all external input.
-   Keep controllers thin.
-   Keep business rules out of UI components.
-   Enforce tenant scope in the backend.
-   Add tests for success, failure, and tenant boundaries.
-   Update OpenAPI/docs when contracts change.
-   Include migrations for database changes.
-   Never run destructive commands against production or user data
    without explicit approval.
-   Do not commit secrets or real customer data.
-   Do not mark TODOs as completed features.

## 21.3 Before finishing

Report: - Summary of implementation - Files changed - Architecture
decisions made or changed - Database migrations added - Tests and
commands run - Test results - Known limitations - Documentation
updates - Suggested next smallest task

If tests cannot be run, say exactly why. Do not claim they passed.

## 21.4 Change-control rule

If implementation appears to require changing a baseline decision: 1.
Explain the issue. 2. Present the smallest reasonable alternatives. 3.
Explain migration and compatibility impact. 4. Wait for approval before
changing the baseline architecture. 5. Update this plan and add an ADR
after approval.

------------------------------------------------------------------------

# 22. Suggested First Agent Task

Do not ask an agent to "build the whole platform". That is how a
repository acquires 40 folders, 3 incompatible auth systems, and a very
confident README.

The first task should be:

**Set up Phase 0 only.**

Expected scope: - Inspect repository state. - Initialize pnpm workspace
and Turborepo if absent. - Create NestJS API app and Next.js Admin
app. - Add strict TypeScript, lint, formatting, and test
configuration. - Add PostgreSQL Docker Compose service. - Add Prisma
connection and a minimal initial migration only if needed. - Add
environment variable validation. - Add health endpoints. - Add CI
workflow. - Update local setup documentation.

Do not implement entity metadata, records, roles, templates, or CMS yet
unless separately requested.

After Phase 0 passes, proceed to Phase 1: identity and tenant isolation.

------------------------------------------------------------------------

# 23. Working Project Checklist

Use this as the project-level progress checklist and update it as work
is completed.

## Documentation

-   [x] Documentation baseline, ADRs, license (R-000)

## Foundation

-   [ ] Repository structure and workspace
-   [ ] TypeScript/lint/format/test setup
-   [ ] NestJS API app
-   [ ] Next.js Admin app
-   [ ] PostgreSQL Docker Compose
-   [ ] Prisma and migration workflow
-   [ ] Environment validation
-   [ ] CI pipeline
-   [ ] Local setup documentation

## Identity and tenancy

-   [ ] Installation model
-   [ ] Tenant model
-   [ ] User model
-   [ ] Membership model
-   [ ] Authentication
-   [ ] Tenant resolution
-   [ ] Roles and permissions
-   [ ] Tenant isolation tests
-   [ ] Audit event foundation

## Metadata and records

-   [ ] Entity metadata
-   [ ] Field metadata
-   [ ] Field type registry
-   [ ] Metadata validation
-   [ ] Metadata versioning
-   [ ] JSONB record persistence
-   [ ] Record CRUD
-   [ ] Dynamic validation
-   [ ] Filtering/sorting/pagination
-   [ ] Field permissions

## Admin and API

-   [ ] Entity builder
-   [ ] Dynamic forms
-   [ ] Record manager
-   [ ] REST API v1
-   [ ] OpenAPI
-   [ ] API/SDK contract tests
-   [ ] UI/API vertical slice

## Extensibility and CMS

-   [ ] Relationship engine
-   [ ] Media storage
-   [ ] CMS template
-   [ ] Template manifest
-   [ ] Config export/import
-   [ ] CLI
-   [ ] Template diff/upgrade
-   [ ] Plugin contract

## Operations

-   [ ] Self-hosted Docker deployment
-   [ ] Backup/restore procedure
-   [ ] Health and readiness checks
-   [ ] Structured logging
-   [ ] Monitoring/error reporting
-   [ ] Security review
-   [ ] First SaaS pilot

------------------------------------------------------------------------

# 24. Final Engineering Rule

Build a small, correct, tenant-safe platform core first. Prove that
metadata created in the Admin Studio drives the same behavior exposed
through the API. Then add relationships, developer tooling, media, and
the CMS template.

The platform succeeds when a developer can build an application on top
of it without forking the core, and when a tenant can upgrade the
platform without losing their data or customizations.

**Do not trade a working, tested vertical slice for a large amount of
impressive-looking scaffolding.**
