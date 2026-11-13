import { Controller, Get, Header } from '@nestjs/common';
import { buildOpenApiDocument, buildTenantOpenApiDocument } from '@byteringscms/contracts';
import { Public, RequirePermissions } from '../auth/auth.decorators';
import { Ctx, requireTenant, type RequestContext } from '../common/request-context';
import { MetadataService } from '../metadata/metadata.service';
import { TenantsService } from '../tenancy/tenants.service';
import { canRead } from '../records/record-validation';

const VERSION = '1.0.0';

const DOCS_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>API documentation</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css" />
</head>
<body>
  <div id="docs"></div>
  <script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script>
  <script src="/api/v1/docs/init.js"></script>
</body>
</html>`;

const DOCS_INIT = `window.ui = SwaggerUIBundle({
  url: '/api/v1/openapi.json',
  dom_id: '#docs',
  deepLinking: true,
  withCredentials: true,
  requestInterceptor: function (req) {
    req.credentials = 'include';
    return req;
  },
});`;

@Controller()
export class OpenApiController {
  private readonly document = buildOpenApiDocument({ version: VERSION });

  constructor(
    private readonly metadata: MetadataService,
    private readonly tenants: TenantsService,
  ) {}

  @Get('openapi.json')
  @Public()
  spec() {
    return this.document;
  }

  /** The platform document plus typed paths for the caller's tenant entities. */
  @Get('openapi/tenant.json')
  @RequirePermissions('metadata:read')
  async tenantSpec(@Ctx() ctx: RequestContext) {
    const tenantCtx = requireTenant(ctx);
    const [entities, tenant] = await Promise.all([
      this.metadata.list(tenantCtx),
      this.tenants.current(tenantCtx),
    ]);
    const readable = entities.map((entity) => ({
      ...entity,
      fields: entity.fields.filter((field) => canRead(field, tenantCtx.role)),
    }));
    return buildTenantOpenApiDocument(readable, { version: VERSION, tenantName: tenant.name });
  }

  @Get('docs')
  @Public()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header(
    'content-security-policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
  )
  docs() {
    return DOCS_HTML;
  }

  @Get('docs/init.js')
  @Public()
  @Header('content-type', 'application/javascript; charset=utf-8')
  docsInit() {
    return DOCS_INIT;
  }
}
