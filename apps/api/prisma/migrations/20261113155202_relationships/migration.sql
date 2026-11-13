-- DropIndex
DROP INDEX "records_data_gin";

-- CreateTable
CREATE TABLE "record_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "field_id" UUID NOT NULL,
    "source_record_id" UUID NOT NULL,
    "target_record_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "record_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "record_links_target_record_id_idx" ON "record_links"("target_record_id");

-- CreateIndex
CREATE INDEX "record_links_tenant_id_idx" ON "record_links"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "record_links_field_id_source_record_id_target_record_id_key" ON "record_links"("field_id", "source_record_id", "target_record_id");

-- AddForeignKey
ALTER TABLE "record_links" ADD CONSTRAINT "record_links_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_links" ADD CONSTRAINT "record_links_source_record_id_tenant_id_fkey" FOREIGN KEY ("source_record_id", "tenant_id") REFERENCES "records"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_links" ADD CONSTRAINT "record_links_target_record_id_tenant_id_fkey" FOREIGN KEY ("target_record_id", "tenant_id") REFERENCES "records"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-level security for relation links (see identity_tenancy migration).
ALTER TABLE "record_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "record_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "record_links"
  USING (app_rls_allows(tenant_id)) WITH CHECK (app_rls_allows(tenant_id));
