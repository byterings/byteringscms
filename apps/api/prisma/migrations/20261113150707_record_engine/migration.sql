-- CreateTable
CREATE TABLE "records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_unique_values" (
    "tenant_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "record_id" UUID NOT NULL,

    CONSTRAINT "record_unique_values_pkey" PRIMARY KEY ("field_id","value")
);

-- CreateIndex
CREATE INDEX "records_tenant_id_entity_id_deleted_at_created_at_idx" ON "records"("tenant_id", "entity_id", "deleted_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "records_id_tenant_id_key" ON "records"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "record_unique_values_record_id_idx" ON "record_unique_values"("record_id");

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_entity_id_tenant_id_fkey" FOREIGN KEY ("entity_id", "tenant_id") REFERENCES "entities"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_unique_values" ADD CONSTRAINT "record_unique_values_record_id_tenant_id_fkey" FOREIGN KEY ("record_id", "tenant_id") REFERENCES "records"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_unique_values" ADD CONSTRAINT "record_unique_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Containment queries on record values (multiselect / many-relation filters).
CREATE INDEX "records_data_gin" ON "records" USING GIN ("data" jsonb_path_ops);

-- Row-level security for record tables (see identity_tenancy migration).
ALTER TABLE "records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "records"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));

ALTER TABLE "record_unique_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "record_unique_values" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "record_unique_values"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));
