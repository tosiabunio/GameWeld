import { Validator } from '@seriousme/openapi-schema-validator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp, createContext } from '../src/app.ts';
import { createPool } from '../src/db.ts';
import { publicRoute } from '../src/openapi.ts';
import { seedDemo } from '../src/seed.ts';
import { testConfig, type TestContext } from './helpers.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('the OpenAPI description', () => {
  let t: TestContext;
  let doc: Json;
  const routes: { method: string; url: string; action: string | undefined; hidden: boolean }[] = [];

  beforeAll(async () => {
    const config = testConfig({ PUBLIC_URL: 'http://localhost:8090' });
    const db = createPool(config.databaseUrl);
    await seedDemo(db);
    const app = await buildApp(createContext(config, db), (instance) => {
      instance.addHook('onRoute', (r) => {
        for (const m of [r.method].flat())
          if (r.url.startsWith('/api/') && m !== 'HEAD')
            routes.push({
              method: m.toLowerCase(),
              url: r.url,
              action: r.config?.projectAction,
              hidden: r.config?.doc?.hidden === true,
            });
      });
      // A route that says one thing and does another, for the check below.
      instance.get(
        '/api/test/misdescribed',
        publicRoute({
          id: 'misdescribed',
          tag: 'Test',
          summary: 'Answers with a number where its description says text',
          response: z.object({ name: z.string() }),
        }),
        async () => ({ name: 42 }),
      );
      instance.post(
        '/api/test/wrong-status',
        publicRoute({
          id: 'wrongStatus',
          tag: 'Test',
          summary: 'Answers 201 though it says 204',
          response: null,
        }),
        async (_req, reply) => reply.status(201).send({}),
      );
    });
    await app.ready();
    t = {
      app,
      db,
      close: async () => {
        await app.close();
        await db.end();
      },
    };
    const res = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    doc = res.json();
  });
  afterAll(async () => {
    await t.close();
  });

  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await new Validator().validate(structuredClone(doc));
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.servers).toEqual([{ url: 'http://localhost:8090' }]);
  });

  it('describes every route under /api, once', () => {
    const described = Object.entries(doc.paths as Record<string, Json>).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method} ${path}`),
    );
    const served = routes
      .filter((r) => !r.hidden)
      .map((r) => `${r.method} ${r.url.replace(/:(\w+)/g, '{$1}')}`);
    expect(described.sort()).toEqual(served.sort());
    expect(served.length).toBeGreaterThan(80);
    // The browser's sign-in steps are served but not described.
    expect(routes.some((r) => r.hidden)).toBe(true);
  });

  it('gives each operation a name, a summary, a group, and its permission', () => {
    const operations = Object.entries(doc.paths as Record<string, Json>).flatMap(([path, ops]) =>
      Object.entries(ops as Record<string, Json>).map(([method, op]) => ({ path, method, op })),
    );
    for (const { path, method, op } of operations) {
      const label = `${method} ${path}`;
      expect(op.operationId, label).toMatch(/^[a-z][A-Za-z]+$/);
      expect(op.summary, label).toBeTruthy();
      expect(op.tags, label).toHaveLength(1);
      expect(op.tags[0], label).not.toBe('Other');
      const route = routes.find(
        (r) => r.method === method && r.url.replace(/:(\w+)/g, '{$1}') === path,
      )!;
      expect(op['x-permission'], label).toBe(route.action);
      if (route.action) expect(op.description, label).toContain(`\`${route.action}\``);
      // Every path parameter is declared.
      for (const [, name] of path.matchAll(/\{(\w+)\}/g))
        expect(
          op.parameters.some((p: Json) => p.in === 'path' && p.name === name),
          `${label} ${name}`,
        ).toBe(true);
    }
  });

  it('says which routes take a token, which need the browser, and which are open', () => {
    const security = (method: string, path: string) => doc.paths[path][method].security;
    expect(security('get', '/api/projects/{projectId}/backlog')).toEqual([
      { token: [] },
      { session: [] },
    ]);
    expect(security('post', '/api/me/tokens')).toEqual([{ session: [] }]);
    expect(security('get', '/api/health')).toEqual([]);
    expect(doc.components.securitySchemes.token).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('describes bodies and answers with schemas that resolve', () => {
    const create = doc.paths['/api/projects/{projectId}/backlog'].post;
    const body = create.requestBody.content['application/json'].schema;
    expect(body).toEqual({ $ref: '#/components/schemas/createItemBody' });
    expect(doc.components.schemas.createItemBody).toMatchObject({
      type: 'object',
      required: ['title', 'category'],
      properties: { category: { enum: ['must', 'should', 'could', 'wont'] } },
    });
    expect(create.responses['201'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/BacklogItem',
    });
    // Invitations answer 202, additions 201.
    expect(
      Object.keys(doc.paths['/api/projects/{projectId}/members'].post.responses).sort(),
    ).toEqual(['201', '202', '4XX']);
    // Bodies a route may go without are not required.
    expect(doc.paths['/api/notifications/read'].post.requestBody.required).toBe(false);

    // Every reference points at something in the document.
    const refs: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object')
        for (const [key, value] of Object.entries(node))
          if (key === '$ref' && typeof value === 'string') refs.push(value);
          else walk(value);
    };
    walk(doc);
    expect(refs.length).toBeGreaterThan(100);
    for (const ref of new Set(refs)) {
      expect(ref, ref).toMatch(/^#\//);
      const target = ref
        .slice(2)
        .split('/')
        .reduce<unknown>(
          (at, part) => (at as Json | undefined)?.[part.replace(/~1/g, '/').replace(/~0/g, '~')],
          doc,
        );
      expect(target, ref).toBeDefined();
    }
  });

  it('is served to anyone, with no need to sign in', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
  });

  it('is held to what the routes answer, throughout the test suite', async () => {
    const shape = await t.app.inject({ method: 'GET', url: '/api/test/misdescribed' });
    expect(shape.statusCode).toBe(500);
    expect(shape.json().message).toBe(
      'GET /api/test/misdescribed sent another shape, unlike its OpenAPI description',
    );
    expect(shape.json().details[0].path).toEqual(['name']);

    const status = await t.app.inject({ method: 'POST', url: '/api/test/wrong-status' });
    expect(status.statusCode).toBe(500);
    expect(status.json().message).toMatch(/answered 201/);
  });
});
