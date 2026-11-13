-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "alt" TEXT,
    "checksum" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_installations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "installed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "template_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");

-- CreateIndex
CREATE INDEX "media_tenant_id_deleted_at_created_at_idx" ON "media"("tenant_id", "deleted_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "media_id_tenant_id_key" ON "media"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_installations_tenant_id_template_id_key" ON "template_installations"("tenant_id", "template_id");


-- Row-level security for media and template installations.
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "media"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));

ALTER TABLE "template_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_installations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "template_installations"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));
