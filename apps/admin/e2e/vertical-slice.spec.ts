/**
 * First vertical slice (developmentPlan §15): metadata created in the Admin
 * Studio drives the same behaviour exposed through the REST API, with tenant
 * isolation enforced.
 */
import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const API = 'http://localhost:4100';
const PASSWORD = 'e2e password long enough';
const OWNER_A = { email: 'owner-a@e2e.test', name: 'Owner A' };
const OWNER_B = { email: 'owner-b@e2e.test', name: 'Owner B' };

async function signIn(email: string): Promise<{ api: APIRequestContext; csrf: string }> {
  const api = await request.newContext({ baseURL: API });
  const res = await api.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(res.status()).toBe(200);
  return { api, csrf: (await res.json()).data.csrfToken };
}

/** Signs in through the Admin Studio login page and waits for the dashboard. */
async function uiSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe.serial('vertical slice', () => {
  let entityId: string;
  let uiRecordId: string;

  test('1-3. initialize Tenant A (setup) and Tenant B (platform API)', async () => {
    const api = await request.newContext({ baseURL: API });
    const setup = await api.post('/api/v1/setup', {
      data: { tenantName: 'Tenant A', tenantSlug: 'tenant-a', ...OWNER_A, password: PASSWORD },
    });
    expect(setup.status()).toBe(201);
    const csrf = (await setup.json()).data.csrfToken;
    const tenantB = await api.post('/api/v1/platform/tenants', {
      headers: { 'x-csrf-token': csrf },
      data: { name: 'Tenant B', slug: 'tenant-b', owner: { ...OWNER_B, password: PASSWORD } },
    });
    expect(tenantB.status()).toBe(201);
    await api.dispose();
  });

  test('4-7. sign in as Tenant A and build the Product entity in the UI', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(OWNER_A.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('link', { name: 'Schema' }).click();
    await page.getByRole('button', { name: 'New entity' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create entity' });
    await createDialog.getByRole('textbox', { name: 'Name', exact: true }).fill('Product');
    await expect(createDialog.getByLabel('API key')).toHaveValue('product');
    await createDialog.getByRole('button', { name: 'Create entity' }).click();
    await expect(page).toHaveURL(/\/schema\/[0-9a-f-]{36}$/);
    entityId = page.url().split('/').pop()!;
    await expect(page.getByRole('heading', { name: 'Product' })).toBeVisible();

    const addField = async (
      label: string,
      type: string,
      opts: { required?: boolean; min?: string; defaultOn?: boolean } = {},
    ) => {
      await page.getByRole('button', { name: 'Add field' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add field' });
      await dialog.getByLabel('Label').fill(label);
      await dialog.getByLabel('Type').selectOption({ label: type });
      if (opts.min !== undefined) await dialog.getByLabel('Minimum').fill(opts.min);
      if (opts.required) await dialog.getByLabel('Required').check();
      if (opts.defaultOn) await dialog.locator('#field-default').check();
      await dialog.getByRole('button', { name: 'Add field' }).click();
      await expect(dialog).toBeHidden();
    };
    await addField('Name', 'Text', { required: true });
    await addField('Price', 'Decimal', { required: true, min: '0' });
    await addField('Is active', 'Boolean', { defaultOn: true });

    await expect(page.getByTestId('field-row-name')).toContainText('required');
    await expect(page.getByTestId('field-row-price')).toContainText('Decimal');
    await expect(page.getByTestId('field-row-isActive')).toContainText('Boolean');
  });

  test('8 + 11. create a Product in the UI; invalid data is rejected', async ({ page }) => {
    await uiSignIn(page, OWNER_A.email);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Products' })
      .click();
    await page.getByRole('button', { name: 'New product' }).click();

    await page.getByLabel('Name').fill('Desk lamp');
    await page.getByLabel('Price').fill('-1');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Must be at least 0')).toBeVisible();

    await page.getByLabel('Price').fill('19.9');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/content\/product\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/version 1/)).toBeVisible();
    uiRecordId = page.url().split('/').pop()!;
  });

  test('9. read, list, update and delete through the REST API', async () => {
    const { api, csrf } = await signIn(OWNER_A.email);
    const list = await api.get('/api/v1/entities/product/records');
    expect(list.status()).toBe(200);
    const body = await list.json();
    expect(body.meta.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      id: uiRecordId,
      data: { name: 'Desk lamp', price: '19.90', isActive: true },
    });

    // UI and API agree on the field definitions.
    const entity = await (await api.get(`/api/v1/admin/entities/${entityId}`)).json();
    expect(
      entity.data.fields.map((f: { key: string; type: string; required: boolean }) => [
        f.key,
        f.type,
        f.required,
      ]),
    ).toEqual([
      ['name', 'text', true],
      ['price', 'decimal', true],
      ['isActive', 'boolean', false],
    ]);

    const updated = await api.patch(`/api/v1/entities/product/records/${uiRecordId}`, {
      headers: { 'x-csrf-token': csrf },
      data: { data: { price: '21.00' }, version: 1 },
    });
    expect(updated.status()).toBe(200);
    expect((await updated.json()).data).toMatchObject({ version: 2, data: { price: '21.00' } });

    const temp = await api.post('/api/v1/entities/product/records', {
      headers: { 'x-csrf-token': csrf },
      data: { data: { name: 'Temporary', price: 1 } },
    });
    const tempId = (await temp.json()).data.id;
    expect(
      (
        await api.delete(`/api/v1/entities/product/records/${tempId}`, {
          headers: { 'x-csrf-token': csrf },
        })
      ).status(),
    ).toBe(204);
    expect((await api.get(`/api/v1/entities/product/records/${tempId}`)).status()).toBe(404);

    const invalid = await api.post('/api/v1/entities/product/records', {
      headers: { 'x-csrf-token': csrf },
      data: { data: { name: 'Bad', price: 'free' } },
    });
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).error.details[0].path).toBe('data.price');
    await api.dispose();
  });

  test('10. a record created through the API appears in the Admin Studio', async ({ page }) => {
    const { api, csrf } = await signIn(OWNER_A.email);
    const created = await api.post('/api/v1/entities/product/records', {
      headers: { 'x-csrf-token': csrf },
      data: { data: { name: 'API chair', price: 42 } },
    });
    expect(created.status()).toBe(201);
    await api.dispose();

    await uiSignIn(page, OWNER_A.email);
    await page.goto('/content/product');
    await expect(page.getByRole('cell', { name: 'API chair' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Desk lamp' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '42.00' })).toBeVisible();
  });

  test('12-13. Tenant B cannot access Tenant A entities or records', async ({ page }) => {
    const { api, csrf } = await signIn(OWNER_B.email);
    expect((await api.get('/api/v1/entities/product/records')).status()).toBe(404);
    expect((await api.get(`/api/v1/admin/entities/${entityId}`)).status()).toBe(404);
    expect(
      (
        await api.patch(`/api/v1/admin/entities/${entityId}`, {
          headers: { 'x-csrf-token': csrf },
          data: { name: 'x' },
        })
      ).status(),
    ).toBe(404);

    // Even with an entity of the same key, Tenant A's record id is invisible.
    await api.post('/api/v1/admin/entities', {
      headers: { 'x-csrf-token': csrf },
      data: {
        key: 'product',
        name: 'Product',
        fields: [{ key: 'name', type: 'text', label: 'Name' }],
      },
    });
    expect((await api.get(`/api/v1/entities/product/records/${uiRecordId}`)).status()).toBe(404);
    expect(
      (
        await api.delete(`/api/v1/entities/product/records/${uiRecordId}`, {
          headers: { 'x-csrf-token': csrf },
        })
      ).status(),
    ).toBe(404);
    const theirs = await (await api.get('/api/v1/entities/product/records')).json();
    expect(theirs.meta.total).toBe(0);
    await api.dispose();

    await uiSignIn(page, OWNER_B.email);
    await page.goto('/content/product');
    await expect(page.getByText('No products yet')).toBeVisible();
  });

  test('14. audit events exist for the sensitive operations', async () => {
    const { api } = await signIn(OWNER_A.email);
    const res = await api.get('/api/v1/admin/audit-events', { params: { pageSize: '100' } });
    const actions = (await res.json()).data.map((e: { action: string }) => e.action);
    for (const action of [
      'entity.created',
      'field.created',
      'record.created',
      'record.updated',
      'record.deleted',
    ]) {
      expect(actions).toContain(action);
    }
    await api.dispose();
  });

  test('Phase 5. link a record to another entity with the relation picker', async ({ page }) => {
    const { api, csrf } = await signIn(OWNER_A.email);
    const headers = { 'x-csrf-token': csrf };
    const category = await api.post('/api/v1/admin/entities', {
      headers,
      data: {
        key: 'category',
        name: 'Category',
        pluralName: 'Categories',
        fields: [{ key: 'title', type: 'text', label: 'Title', required: true }],
      },
    });
    const categoryEntity = (await category.json()).data;
    for (const title of ['Hardware', 'Furniture']) {
      await api.post('/api/v1/entities/category/records', { headers, data: { data: { title } } });
    }
    const field = await api.post(`/api/v1/admin/entities/${entityId}/fields`, {
      headers,
      data: {
        key: 'category',
        type: 'relation',
        label: 'Category',
        config: { targetEntityId: categoryEntity.id },
      },
    });
    expect(field.status()).toBe(201);

    await uiSignIn(page, OWNER_A.email);
    await page.goto(`/content/product/${uiRecordId}`);
    const picker = page.getByRole('combobox', { name: 'Category' });
    await picker.click();
    await picker.fill('Hard');
    await page.getByRole('option', { name: 'Hardware' }).click();
    await expect(page.getByRole('list', { name: 'Selected Category' })).toContainText('Hardware');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const record = await (
      await api.get(`/api/v1/entities/product/records/${uiRecordId}`, {
        params: { expand: 'category' },
      })
    ).json();
    expect(record.data.data.category).toMatchObject({ data: { title: 'Hardware' } });

    await page.goto('/content/product');
    await expect(page.getByRole('cell', { name: 'Hardware' })).toBeVisible();
    await api.dispose();
  });

  test('Phase 7. install the CMS template, upload media and publish an article', async ({
    page,
  }) => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    await uiSignIn(page, OWNER_B.email);

    await page.goto('/templates');
    await page.getByRole('button', { name: 'Install Headless CMS' }).click();
    await expect(page.getByText('Installed. The new entities are in the sidebar.')).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Articles' })).toBeVisible();

    await nav.getByRole('link', { name: 'Media' }).click();
    await page
      .getByLabel('Upload files')
      .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByText('cover.png')).toBeVisible();

    await nav.getByRole('link', { name: 'Articles' }).click();
    await page.getByRole('button', { name: 'New article' }).click();
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Launch day');
    await expect(page.getByRole('textbox', { name: 'Slug', exact: true })).toHaveValue(
      'launch-day',
    );
    await page.getByLabel('Status').selectOption('published');
    await page.getByLabel('Body').fill('We are live.');
    await page.getByRole('button', { name: 'Choose file' }).click();
    await page.getByRole('button', { name: 'Choose cover.png' }).click();
    await expect(page.getByRole('list', { name: 'Selected Cover image' })).toContainText(
      'cover.png',
    );
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page).toHaveURL(/\/content\/article\/[0-9a-f-]{36}$/);

    const anonymous = await request.newContext({ baseURL: API });
    const list = await anonymous.get('/api/v1/public/tenant-b/entities/article/records', {
      params: { 'filter[slug]': 'launch-day' },
    });
    expect(list.status()).toBe(200);
    const article = (await list.json()).data[0];
    expect(article.data).toMatchObject({ title: 'Launch day', status: 'published' });
    const media = await anonymous.get(
      `/api/v1/public/tenant-b/media/${article.data.coverImage}/file`,
    );
    expect(media.status()).toBe(200);
    expect(media.headers()['content-type']).toBe('image/png');
    // The template's draft sample article stays private.
    const drafts = await anonymous.get('/api/v1/public/tenant-b/entities/article/records', {
      params: { 'filter[slug]': 'writing-your-first-guide' },
    });
    expect((await drafts.json()).meta.total).toBe(0);
    await anonymous.dispose();
  });
});
