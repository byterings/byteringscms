# Multi-Tenant Metadata-Driven Application Platform

> A self-hostable, SaaS-ready application platform with a
> metadata-driven core, a headless API, and an extensible
> application/template system.

**Project status:** Architecture and product direction defined;
implementation has not started or is not yet represented in this
document.\
**Initial application:** Headless CMS.\
**Primary deployment target:** Self-hosted first, SaaS-ready from day
one.\
**Initial database:** PostgreSQL.\
**Initial backend:** NestJS + TypeScript.\
**Initial admin frontend:** Next.js + TypeScript.

------------------------------------------------------------------------

## 1. What We Are Building

This project is a general-purpose, metadata-driven application platform.
It provides the reusable foundation required to build different business
applications without hardcoding each application's domain logic into the
platform core.

A tenant or developer should be able to define:

-   Entities (for example, `Article`, `Product`, `Customer`, or
    `Project`)
-   Fields and field types
-   Relationships between entities
-   Validation rules
-   Views and display configuration
-   Roles and permissions
-   API access policies
-   Application templates and extensions

The platform interprets these definitions at runtime and provides record
storage, validation, APIs, permissions, and a default administration
experience.

The first product built on this foundation will be a **headless CMS
template**. CRM, ecommerce, project management, HRMS, and other
application templates are future possibilities. They are not separate
hardcoded modules in the core.

### Product definition

**A multi-tenant, extensible, metadata-driven application platform with
a headless CMS as its first application template.**

### Core product principles

1.  **Metadata first:** entities, fields, relationships, and application
    behavior are described as metadata.
2.  **Headless by default:** the platform exposes APIs; customers are
    free to build their own web or mobile frontend.
3.  **Developer-friendly:** configuration files, CLI, SDK, OpenAPI,
    migrations, and predictable APIs are first-class capabilities.
4.  **UI and API share one contract:** the admin UI must be generated
    from the same metadata and API contracts used by the backend.
5.  **Tenant isolation is mandatory:** every tenant-owned operation must
    be scoped and tested.
6.  **Self-hostable, SaaS-ready:** one product and one codebase support
    both deployment models.
7.  **Extensible without core forks:** templates and plugins extend the
    platform through documented interfaces.
8.  **Upgrade-safe:** platform and template upgrades must preserve
    tenant data and customizations.
9.  **Small vertical slices before broad features:** prove a complete
    workflow before expanding the feature set.
10. **Security over convenience:** never trust tenant IDs, permissions,
    or field visibility supplied by a client.

------------------------------------------------------------------------

## 2. What We Are Not Building First

Do not let future possibilities expand the first release indefinitely.

The initial release is **not** intended to include:

-   A complete CRM, ecommerce, HRMS, or project-management application
-   A visual website/page builder
-   GraphQL
-   A generic adapter for every database
-   A distributed microservices architecture
-   Kubernetes-based deployment
-   A complex workflow automation engine
-   A full marketplace for plugins and templates
-   Enterprise SSO, SCIM, or advanced billing
-   A search cluster before there is a real search requirement
-   Arbitrary SQL or DDL execution from the admin UI

These can be considered after the core metadata workflow is reliable.

------------------------------------------------------------------------

## 3. Product Layers

Keep responsibilities separated into four layers.

### 3.1 Application experience

-   Admin Studio: the platform's default administration UI
-   Customer websites and custom frontends
-   Mobile applications
-   Developer tools and documentation

The Admin Studio is only one client of the platform APIs. It must not
contain the only implementation of business rules.

### 3.2 Application engine

-   Tenant context and isolation
-   Entity and field metadata
-   Relationship metadata
-   Record storage and querying
-   Validation
-   Authentication and authorization
-   Media metadata and storage integration
-   API generation/runtime
-   Audit events

### 3.3 Extension platform

-   Application templates
-   Plugins
-   Lifecycle hooks and events
-   CLI and SDK
-   Configuration import/export
-   Migrations and upgrade tooling
-   Custom endpoints and integrations

### 3.4 Infrastructure

-   PostgreSQL
-   Object storage
-   Cache and queues when justified
-   Logging, metrics, and backups
-   Docker-based local and self-hosted deployment
-   SaaS hosting and tenant provisioning

**Dependency rule:** the core engine must not import or depend on CMS,
CRM, ecommerce, HRMS, or other application templates. Templates depend
on the platform contracts, never the reverse.

------------------------------------------------------------------------

## 4. Deployment and Tenancy Strategy

Deployment mode and tenant mode are separate concepts.

  -----------------------------------------------------------------------
  Deployment              Default tenant model    Notes
  ----------------------- ----------------------- -----------------------
  Self-hosted             Single tenant           Simple installation for
                                                  an individual
                                                  organization

  Self-hosted             Multiple tenants        Optional for hosting
                                                  providers or larger
                                                  installations

  SaaS                    Multiple isolated       Shared platform runtime
                          tenants                 with tenant-scoped data
                                                  and controls
  -----------------------------------------------------------------------

### Decision

Build a **self-hostable platform with SaaS-ready architecture**. Do not
build separate self-hosted and SaaS products.

The same application, APIs, metadata engine, and extension contracts
should run in both environments. Deployment configuration determines
whether the installation is single-tenant or multi-tenant.

### Tenant isolation requirements

-   Resolve tenant context from a trusted source: validated
    hostname/domain mapping, authenticated membership, or a
    server-controlled installation context.
-   Never trust a raw `tenant_id` supplied in request body, query
    string, or arbitrary client header.
-   Every tenant-owned database query must be scoped to the resolved
    tenant.
-   Unique constraints for tenant-owned names/slugs must include
    `tenant_id` where appropriate.
-   Cache keys, background jobs, object-storage paths, audit events, and
    exports must include tenant scope.
-   Cross-tenant access must fail closed.
-   Add automated tests that create two tenants and attempt to read,
    update, delete, and enumerate each other's records.
-   Use PostgreSQL Row-Level Security (RLS) as an additional defense
    where practical, not as a substitute for correct application
    authorization.
-   Background workers must establish tenant context explicitly for each
    job.

### SaaS evolution

Start with a small shared environment for controlled testing. Add
production-grade infrastructure only when usage and revenue justify it.
Do not make free-tier hosting a production reliability promise.

------------------------------------------------------------------------

## 5. Initial Technology Decisions

These are initial decisions, not a claim that every technology must be
used immediately.

  ------------------------------------------------------------------------
  Area                    Initial choice          Notes
  ----------------------- ----------------------- ------------------------
  Language                TypeScript              Shared language across
                                                  frontend, backend, CLI,
                                                  and SDK

  Monorepo                pnpm workspaces +       Shared packages and
                          Turborepo               consistent tooling

  Admin UI                Next.js + React         Admin client only; not
                                                  coupled to customer
                                                  frontends

  UI styling              Tailwind CSS +          Keep components
                          shadcn/ui               accessible and reusable

  Server state            TanStack Query          API state and cache

  Forms                   React Hook Form + Zod   UI validation; server
                                                  remains authoritative

  Backend                 NestJS                  Modular application
                                                  architecture

  API                     REST first              Versioned endpoints and
                                                  OpenAPI contract

  Database                PostgreSQL              Primary supported
                                                  database

  ORM                     Prisma initially        Keep persistence logic
                                                  behind internal
                                                  interfaces

  Record payloads         PostgreSQL JSONB        Metadata-managed record
                                                  values

  Local services          Docker Compose          Reproducible local
                                                  development

  Object storage          Local filesystem in     MinIO locally when
                          early development;      needed; S3/R2-compatible
                          S3-compatible interface storage later

  Cache/queue             Add Redis + BullMQ when Do not introduce before
                          needed                  a real use case

  Search                  Defer                   Add
                                                  Meilisearch/OpenSearch
                                                  only when required

  CLI                     Node.js + TypeScript    Project, schema,
                                                  template, and upgrade
                                                  commands

  API documentation       OpenAPI                 Contract for docs and
                                                  generated SDK

  Tests                   Unit, integration, and  Tenant isolation is a
                          end-to-end              release gate
  ------------------------------------------------------------------------

### Database support policy

-   PostgreSQL is the only required production database for the first
    release.
-   SQLite may be evaluated for local/demo use, but only if it does not
    distort the core architecture.
-   MySQL is a future adapter, not a V1 promise.
-   External database connections are a separate feature from the
    platform's own persistence.
-   Do not claim database portability until migrations, JSON behavior,
    indexing, transactions, and isolation have been tested on each
    provider.

------------------------------------------------------------------------

## 6. Data and Metadata Model

### 6.1 System data versus application data

Keep platform/system data in normal relational tables. Examples:

-   tenants
-   users
-   memberships
-   roles
-   permissions
-   sessions
-   API keys
-   entity definitions
-   field definitions
-   relationship definitions
-   audit events
-   template/plugin installation records
-   migration history

Metadata-managed business records are stored separately and interpreted
using the metadata definitions.

### 6.2 Initial record storage

Use a hybrid relational + JSONB approach. For V1, metadata-managed
records live in a generic records table.

Illustrative shape:

``` sql
records
-------
id
tenant_id
entity_id
data              -- JSONB
created_at
updated_at
created_by
updated_by
```

The exact schema must be designed and migrated deliberately. This
example is conceptual, not a command to create this exact table without
reviewing indexing, constraints, and lifecycle needs.

### 6.3 Why not pure EAV

Do not store every field as a separate row in a universal
`record_id / field_id / value` table. That makes common reads,
filtering, relationships, and API serialization unnecessarily
complicated.

JSONB provides a practical first implementation: - Flexible field
definitions - Straightforward record serialization - PostgreSQL indexing
options - Less schema churn when tenants add fields

Use relational columns for platform-critical data and JSONB for
metadata-managed record values.

### 6.4 Field definitions

A field definition should eventually describe:

-   Stable field ID
-   Internal key/name
-   Display label
-   Field type
-   Required/optional
-   Default value
-   Validation constraints
-   Read/write permissions
-   Unique/index configuration
-   Relationship target, when applicable
-   UI presentation hints
-   Whether the field is system-managed
-   Definition version and lifecycle state

Do not make the frontend invent field semantics. The backend metadata
contract is authoritative.

### 6.5 Field type registry

Start with a deliberately small set: - text - rich text (only if a clear
storage contract exists) - integer - decimal/number - boolean - date -
datetime - JSON/object only for controlled advanced use - single
select - multi-select - relation - media/file reference

Avoid adding dozens of field types before validation, filtering,
serialization, and UI behavior are defined for each one.

### 6.6 Relationships

Relationship metadata should describe: - Source entity and field -
Target entity - Cardinality: one-to-one, many-to-one, one-to-many, or
many-to-many - Ownership and deletion behavior - Whether the relation is
required - Permissions and visibility - Query/serialization behavior

For V1, implement the smallest useful relation set with explicit tests.
Do not assume a relation can be represented safely by a bare ID without
defining tenant scope and target validation.

### 6.7 Indexing and querying

-   Index `tenant_id`, `entity_id`, and common lifecycle columns.
-   Add JSONB indexes selectively based on actual query patterns.
-   Do not automatically create an index for every user-defined field.
-   Validate allowed filter and sort fields against metadata.
-   Enforce pagination limits and query complexity limits.
-   Never interpolate user-controlled field names into raw SQL without
    strict identifier validation and safe query construction.

------------------------------------------------------------------------

## 7. API Contract

REST is the initial API style. GraphQL is deferred.

Illustrative entity endpoints:

``` text
GET    /api/v1/entities/:entityKey/records
GET    /api/v1/entities/:entityKey/records/:recordId
POST   /api/v1/entities/:entityKey/records
PATCH  /api/v1/entities/:entityKey/records/:recordId
DELETE /api/v1/entities/:entityKey/records/:recordId
```

Illustrative metadata/admin endpoints:

``` text
GET    /api/v1/admin/entities
POST   /api/v1/admin/entities
GET    /api/v1/admin/entities/:entityId
PATCH  /api/v1/admin/entities/:entityId
POST   /api/v1/admin/entities/:entityId/fields
```

The exact route naming is to be finalized in the API design phase. Do
not create inconsistent routes across modules.

### API engine responsibilities

-   Resolve tenant context
-   Authenticate request
-   Authorize entity, record, and field operations
-   Load relevant metadata
-   Validate input against current metadata
-   Apply relationship rules
-   Execute tenant-scoped persistence
-   Serialize output according to permissions
-   Apply filtering, sorting, field selection, and pagination
-   Emit audit events
-   Return consistent errors

### API surfaces

Keep these concepts separate:

1.  **Public API:** explicitly published/public content only.
2.  **Authenticated API:** records the authenticated user is allowed to
    access.
3.  **Admin API:** platform metadata and management operations.

Do not expose drafts, private fields, internal tenant configuration, or
metadata management through public routes.

### API standards

-   Version routes (`/api/v1`).
-   Define consistent response and error shapes.
-   Use stable identifiers.
-   Publish OpenAPI specifications.
-   Generate TypeScript SDK/types from the contract where possible.
-   Apply request size, pagination, rate, and query-complexity limits.
-   Document authentication and tenant resolution.
-   Treat API compatibility as a product feature.

------------------------------------------------------------------------

## 8. Admin Studio and Headless Frontends

There are two independent experiences.

### 8.1 Admin Studio

The default management interface should include, over time:

-   Dashboard
-   Content/record manager
-   Entity builder
-   Field builder
-   Relationship manager
-   Media library
-   API explorer
-   Users, roles, and permissions
-   Template and plugin management
-   Settings and audit history

Build it as a client of the same public/internal API contracts available
to other clients. Do not put business rules exclusively in React
components.

### 8.2 Customer frontends

Customers must be free to use: - Next.js / React - Vue / Nuxt - Astro -
Svelte - Native mobile applications - Custom server-rendered
applications - Any HTTP-capable client

Provide stable APIs, OpenAPI docs, and a TypeScript SDK. Do not require
customers to use the Admin Studio or a platform-owned website theme.

### 8.3 UI/backend alignment rule

The UI must render from backend metadata: - Field type controls the
input component. - Required and validation rules come from metadata. -
Relationship fields load permitted target records. - Read/write
permissions determine visible and editable fields. - API validation
remains authoritative even if client validation exists.

The first vertical slice must prove that metadata created through the UI
is immediately usable by the API and vice versa.

------------------------------------------------------------------------

## 9. CLI, Configuration, and Developer Experience

The CLI is a first-class interface, but it should be introduced after
core contracts stabilize.

Illustrative future commands:

``` bash
npx create-yourplatform my-project
yourplatform dev
yourplatform build
yourplatform entities:list
yourplatform generate entity Product
yourplatform generate plugin my-plugin
yourplatform generate theme my-theme
yourplatform export
yourplatform import
yourplatform schema:pull
yourplatform schema:diff
yourplatform schema:push
yourplatform template:install cms
yourplatform template:update cms
yourplatform plugin:install example-plugin
yourplatform plugin:update example-plugin
yourplatform update:check
yourplatform upgrade
```

These are proposed command names, not implemented commands.

### Configuration model

Developers should eventually be able to version-control definitions:

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

### Source-of-truth rule

-   Runtime metadata in the database is authoritative for the running
    installation.
-   Configuration files are a version-controlled representation of
    desired definitions.
-   CLI diff/sync commands compare configuration with runtime metadata.
-   Migrations describe safe, ordered changes.
-   Do not allow database metadata and config files to silently
    overwrite one another.
-   A diff/preview must exist before destructive synchronization.
-   Secrets must not be exported into ordinary config files.

------------------------------------------------------------------------

## 10. Templates and Plugins

### 10.1 Templates

A template installs a predefined application definition. The first
template is CMS.

A template package may contain: - Manifest and version - Entity
definitions - Field definitions - Relationships - Views -
Permissions/roles - Optional workflows - Migrations - Optional plugin
dependencies - Documentation and seed data

Future examples: CMS, CRM, ecommerce, projects, HRMS.

### 10.2 Template upgrade safety

A template upgrade must: 1. Check platform/template version
compatibility. 2. Read the installed template version and ownership
metadata. 3. Produce a diff and migration plan. 4. Identify conflicts
with tenant customizations. 5. Preserve tenant-created fields, entities,
records, and settings. 6. Require explicit approval for destructive or
breaking changes. 7. Apply ordered migrations. 8. Record upgrade history
and results. 9. Provide a recovery/backup strategy.

Never blindly overwrite tenant metadata during an update.

### 10.3 Plugins

Plugins extend the platform through documented interfaces. Avoid
arbitrary runtime code execution from untrusted plugin packages.

Define: - Plugin manifest and compatibility range -
Permissions/capabilities - Lifecycle hooks - Event subscriptions -
Custom routes/endpoints - Admin UI extension points - Configuration
schema - Upgrade/migration behavior - Isolation and trust model

Begin with trusted, locally installed plugins. A public marketplace is
not a V1 requirement.

------------------------------------------------------------------------

## 11. Security Requirements

Security is part of the architecture, not a cleanup sprint.

Minimum requirements: - Tenant context resolved server-side - Tenant
isolation tests for every tenant-owned resource - Authentication and
session lifecycle - Role-based access control - Entity-, record-, and
field-level authorization where needed - Password hashing using a
modern, maintained algorithm/library - Secure API key storage and
rotation - Input validation and output filtering - Rate limiting and
request size limits - CSRF protection where cookie-based authentication
requires it - Secure CORS configuration - Safe file upload validation
and storage - Audit logs for sensitive operations - Secret management
through environment/config providers - No secrets committed to Git - No
arbitrary SQL/DDL from clients - Dependency scanning and regular
updates - Backups and tested restore procedures - Secure defaults for
self-hosted installations

Do not assume hiding a field in the UI protects it. Authorization and
field filtering must happen on the server.

------------------------------------------------------------------------

## 12. Repository Structure

Proposed monorepo:

``` text
platform/
├── apps/
│   ├── admin/              # Next.js Admin Studio
│   ├── api/                # NestJS API
│   └── docs/               # Documentation site (later)
├── packages/
│   ├── core/               # Shared core contracts and orchestration
│   ├── metadata/           # Entity, field, relation definitions
│   ├── database/           # Persistence interfaces and Prisma adapter
│   ├── auth/               # Authentication primitives
│   ├── permissions/        # Authorization engine
│   ├── validation/         # Metadata-driven validation
│   ├── api-engine/         # Generic record API behavior
│   ├── events/             # Internal event contracts
│   ├── sdk/                # Generated/maintained client SDK
│   ├── cli/                # Developer CLI
│   ├── template-engine/    # Template install/upgrade contracts
│   └── ui/                 # Shared UI components, if justified
├── templates/
│   └── cms/                # First application template
├── plugins/                # First-party or local plugins
├── themes/                 # Optional customer-facing themes
├── infrastructure/
│   ├── docker/
│   └── deployment/
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

This is a target structure, not a requirement to create every package on
day one. Create packages when a real boundary exists. Avoid empty
abstractions and circular dependencies.

------------------------------------------------------------------------

## 13. Development Workflow and Agent Instructions

AI coding agents (Claude Code, Codex, or others) must treat
`developmentPlan.md` as the implementation source of truth.

Before changing code: 1. Read this README and `developmentPlan.md`. 2.
Inspect the actual repository and current implementation. 3. Identify
the current phase and milestone. 4. Read relevant architecture decisions
and existing tests. 5. State the intended change and affected boundaries
before broad refactoring.

While implementing: - Work in small, reviewable steps. - Do not silently
change architecture decisions. - Do not implement future-phase features
early. - Do not invent requirements to fill gaps. - Keep TypeScript
strict; avoid `any` unless justified. - Validate inputs at trust
boundaries. - Keep controllers thin; business logic belongs in
application/domain services. - Keep database access behind appropriate
modules/interfaces. - Do not duplicate validation rules across UI and
backend as separate authorities. - Add tests for every behavior
change. - Add tenant-isolation tests whenever a tenant-owned path
changes. - Update OpenAPI and docs when API contracts change. - Add
migrations for persistent schema changes. - Never run destructive
database commands against a real environment without explicit
approval. - Never commit secrets, local data, or generated
credentials. - Do not claim a feature is complete unless tests and
acceptance criteria pass.

At the end of each task, report: - What changed - Files/modules
changed - Decisions made - Tests run and results - Known limitations -
Any plan/documentation updates needed

If a requirement conflicts with this architecture, stop and explain the
conflict before implementing a different design.

------------------------------------------------------------------------

## 14. Definition of Done

A feature is not done merely because a screen renders.

A feature is done when: - The behavior is implemented at the correct
architectural layer. - Authorization and tenant scope are enforced
server-side. - Input and output contracts are validated. - Tests cover
success, failure, and relevant tenant boundaries. - API documentation is
updated. - UI behavior matches backend metadata/contracts. - Database
migrations are included when needed. - Logs/errors are useful without
leaking secrets. - The implementation is documented. - Existing tests
continue to pass.

------------------------------------------------------------------------

## 15. First End-to-End Product Slice

The first meaningful proof of the platform should be:

1.  Start the application locally.
2.  Create or initialize Tenant A and Tenant B.
3.  Sign in as an authorized user for Tenant A.
4.  Create an entity named `Product`.
5.  Add fields such as `name` (text), `price` (decimal), and `isActive`
    (boolean).
6.  Save the entity metadata.
7.  Create a Product record through Admin Studio.
8.  Read, update, list, and delete it through the REST API.
9.  Confirm validation rejects invalid data.
10. Confirm Tenant B cannot read or mutate Tenant A's entity or records.
11. Confirm the API response and Admin Studio agree on the field
    definitions.

This vertical slice is more important than a large collection of
unfinished screens.

------------------------------------------------------------------------

## 16. Documentation Map

-   `README.md`: product definition, principles, architecture summary,
    setup direction, and agent guidance.
-   `developmentPlan.md`: detailed decisions, phases, acceptance
    criteria, risks, and execution rules.
-   `docs/architecture/`: detailed component and data-flow diagrams as
    they become necessary.
-   `docs/decisions/`: Architecture Decision Records (ADRs).
-   `docs/api/`: API contracts and OpenAPI guidance.

Keep these documents updated when a decision changes. A stale
architecture document is worse than no architecture document because it
confidently misleads the next developer.
