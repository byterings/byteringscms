-- CreateTable
CREATE TABLE "template_upgrades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" TEXT NOT NULL,
    "from_version" TEXT NOT NULL,
    "to_version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_upgrades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_installations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plugin_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plugin_installations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_upgrades_tenant_id_template_id_created_at_idx" ON "template_upgrades"("tenant_id", "template_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_installations_tenant_id_plugin_id_key" ON "plugin_installations"("tenant_id", "plugin_id");


-- Row-level security for template upgrades and plugin installations.
ALTER TABLE "template_upgrades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "template_upgrades" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "template_upgrades"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));

ALTER TABLE "plugin_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plugin_installations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "plugin_installations"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));
