-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plural_name" TEXT NOT NULL,
    "description" TEXT,
    "title_field" TEXT,
    "public_read" BOOLEAN NOT NULL DEFAULT false,
    "publish_field" TEXT,
    "publish_value" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "owner" TEXT NOT NULL DEFAULT 'tenant',
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "checksum" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fields" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "unique" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "read_min_role" "MembershipRole" NOT NULL DEFAULT 'viewer',
    "write_min_role" "MembershipRole" NOT NULL DEFAULT 'editor',
    "default_value" JSONB,
    "config" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "owner" TEXT NOT NULL DEFAULT 'tenant',
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "checksum" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metadata_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metadata_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_tenant_id_key_key" ON "entities"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "entities_id_tenant_id_key" ON "entities"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "fields_tenant_id_idx" ON "fields"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "fields_entity_id_key_key" ON "fields"("entity_id", "key");

-- CreateIndex
CREATE INDEX "metadata_versions_tenant_id_entity_id_version_idx" ON "metadata_versions"("tenant_id", "entity_id", "version");

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fields" ADD CONSTRAINT "fields_entity_id_tenant_id_fkey" FOREIGN KEY ("entity_id", "tenant_id") REFERENCES "entities"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security for metadata tables (see identity_tenancy migration).
ALTER TABLE "entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "entities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "entities"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));

ALTER TABLE "fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fields" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "fields"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));

ALTER TABLE "metadata_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "metadata_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "metadata_versions"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));
