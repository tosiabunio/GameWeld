import type { ProjectAction } from '@gameweld/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { requireSession, requireUser } from './auth.ts';
import { components } from './schemas.ts';

/**
 * The API's OpenAPI description, served at /api/openapi.json. Every route under /api declares
 * what it is for, next to its handler (`RouteDoc`), and the description is put together from the
 * routes as they are registered, so it cannot leave one out. Request bodies are described by the
 * same zod schemas the handlers parse with; responses by the schemas in schemas.ts, which the
 * compiler holds to the domain types the handlers return, and which the test suite checks every
 * response against.
 */

export interface RouteDoc {
  /** A stable name for the operation, for generated clients and for assistants. */
  id: string;
  summary: string;
  description?: string;
  /** Overrides the tag of the route's group. */
  tag?: string;
  query?: z.AnyZodObject;
  /** The JSON body. Wrapped in `.optional()` when the route also takes none. */
  body?: ZodTypeAny;
  /** The body is a multipart form with one file, in the field `file`. */
  upload?: true;
  /**
   * What success returns: a schema (200, JSON), null (204, nothing), or the full form, several
   * when the status says which of them it is.
   */
  response: ZodTypeAny | null | ResponseDoc | ResponseDoc[];
  /** Steps of a browser sign-in, which a client does not call: served, not described. */
  hidden?: true;
}

export interface ResponseDoc {
  /** 200 unless given. */
  status?: number;
  schema?: ZodTypeAny;
  /** A file, a redirect, or a stream instead of JSON, with this content type. */
  content?: string;
  description?: string;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    doc?: RouteDoc;
    /** The group the route is listed under; set for a whole plugin in app.ts. */
    tag?: string;
  }
}

/** Route options for a route anyone may call. */
export const publicRoute = (doc: RouteDoc) => ({ config: { doc } });
/** Route options for a route that needs a signed-in member, by session or API token. */
export const memberRoute = (doc: RouteDoc) => ({ config: { doc }, preHandler: requireUser });
/** Route options for a route that needs a browser session: an API token is refused. */
export const sessionRoute = (doc: RouteDoc) => ({ config: { doc }, preHandler: requireSession });

/** Who holds each permission, for the description of the routes that need it. */
const PERMISSION_HOLDERS: Record<ProjectAction, string> = {
  'project.view': 'any member',
  'project.settings': 'Game Directors',
  'members.manage': 'Game Directors',
  'backlog.manage': 'Game Directors',
  'board.manage': 'Game Directors',
  'board.select_scope': 'Game Directors',
  'task.work': 'any member',
  'task.complete': 'any member, or only Testers when the project restricts Done',
  'item.accept': 'Game Directors and members allowed to accept',
  'out_of_scope.approve': 'Game Directors',
};

const INTRODUCTION = `GameWeld's HTTP API: the same routes the web application uses.

**Signing in.** Send an API token as \`Authorization: Bearer gw_…\`. A member makes tokens in the
app, under their profile; a token acts as that member, under the same permissions. A read-only
token may only use GET; a read-write token may do everything its member may, except manage
tokens. The browser's session cookie works as well.

**Projects.** Routes under \`/api/projects/{projectId}\` answer 404 to anyone who is not a member
of the project, and 403 to a member without the permission the route names.

**Changes.** Rules are enforced on the server: scope limit, what may come into scope, who may complete, and
nothing left stranded. A refused change answers 400 (invalid input), 403, 404, or 409 (the rules
or the current state do not allow it), with \`{ "message": "…" }\` saying why, in English. Updates
of a project, item, task, board, or column carry the \`version\` they were read at; if someone
changed it since, the answer is 409 and nothing is changed.

**History.** Every change is recorded with who made it, and through which token.`;

interface Operation {
  method: string;
  path: string;
  route: RouteOptions;
}

type Json = Record<string, unknown>;

export class ApiDescription {
  private operations: Operation[] = [];
  private ids = new Set<string>();
  private built: Json | null = null;

  /** Collects the routes as they are registered; call before registering any. */
  collect(app: FastifyInstance): void {
    app.addHook('onRoute', (route) => {
      // Fastify adds a HEAD route beside each GET; it is the same operation.
      const methods = [route.method].flat().filter((m) => m !== 'HEAD');
      if (!route.url.startsWith('/api/') || methods.length === 0) return;
      const doc = route.config?.doc;
      if (!doc) throw new Error(`${route.method} ${route.url} has no OpenAPI description`);
      if (this.ids.has(doc.id)) throw new Error(`Two routes share the operation id ${doc.id}`);
      this.ids.add(doc.id);
      if (doc.hidden) return;
      for (const method of methods)
        this.operations.push({ method: method.toLowerCase(), path: route.url, route });
    });
  }

  document(publicUrl: string | null): Json {
    this.built ??= this.build(publicUrl);
    return this.built;
  }

  private build(publicUrl: string | null): Json {
    const schemas: Json = {};
    const convert = (schema: ZodTypeAny, name?: string): Json => {
      const converted = zodToJsonSchema(schema, {
        name,
        definitions: components,
        basePath: ['#', 'components'],
        definitionPath: 'schemas',
        target: 'jsonSchema7',
        // What a handler does not know it ignores, and a response may grow new fields.
        rejectedAdditionalProperties: undefined,
      }) as Json;
      Object.assign(schemas, converted.schemas);
      delete converted.schemas;
      delete converted.$schema;
      return converted;
    };

    const paths: Record<string, Json> = {};
    for (const { method, path, route } of this.operations) {
      const doc = route.config!.doc!;
      const action = route.config!.projectAction;
      const openPath = path.replace(/:(\w+)/g, '{$1}');

      const parameters: Json[] = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      }));
      for (const [name, field] of Object.entries(doc.query?.shape ?? {}) as [
        string,
        ZodTypeAny,
      ][]) {
        // Whether it may be left out is the parameter's `required`, not part of its schema.
        const schema = convert(field instanceof z.ZodOptional ? field.unwrap() : field);
        delete schema.description;
        parameters.push({
          name,
          in: 'query',
          required: !field.isOptional(),
          ...(field.description ? { description: field.description } : {}),
          schema,
        });
      }

      const operation: Json = {
        operationId: doc.id,
        summary: doc.summary,
        tags: [doc.tag ?? route.config!.tag ?? 'Other'],
      };
      const description = [
        doc.description,
        action && `Requires the \`${action}\` permission: ${PERMISSION_HOLDERS[action]}.`,
      ].filter(Boolean);
      if (description.length) operation.description = description.join('\n\n');
      if (action) operation['x-permission'] = action;
      if (parameters.length) operation.parameters = parameters;

      if (doc.body) {
        const optional = doc.body instanceof z.ZodOptional;
        const body = optional ? (doc.body as z.ZodOptional<ZodTypeAny>).unwrap() : doc.body;
        operation.requestBody = {
          required: !optional,
          content: { 'application/json': { schema: convert(body, `${doc.id}Body`) } },
        };
      } else if (doc.upload) {
        operation.requestBody = {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', contentMediaType: 'application/octet-stream' },
                },
                required: ['file'],
              },
            },
          },
        };
      }

      const responses: Json = {};
      for (const response of normalize(doc.response)) {
        const content = response.schema
          ? { 'application/json': { schema: convert(response.schema) } }
          : response.content
            ? { [response.content]: {} }
            : undefined;
        responses[response.status] = {
          description: response.description ?? (content ? 'Success' : 'Done; nothing to return'),
          ...(content ? { content } : {}),
        };
      }
      operation.responses = { ...responses, '4XX': { $ref: '#/components/responses/Error' } };

      const guards = [route.preHandler ?? []].flat();
      if (guards.includes(requireSession)) operation.security = [{ session: [] }];
      else if (guards.includes(requireUser)) operation.security = [{ token: [] }, { session: [] }];
      else operation.security = [];

      (paths[openPath] ??= {})[method] = operation;
    }

    return {
      openapi: '3.1.0',
      info: { title: 'GameWeld API', version: '1', description: INTRODUCTION },
      servers: [{ url: publicUrl ?? '/' }],
      paths,
      components: {
        schemas: {
          ...schemas,
          Error: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Why the request was refused.' },
              details: { description: 'For invalid input: which fields, and what is wrong.' },
            },
            required: ['message'],
          },
        },
        responses: {
          Error: {
            description: 'Refused; the message says why.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
        securitySchemes: {
          token: {
            type: 'http',
            scheme: 'bearer',
            description:
              'An API token a member made in the app. A read-only token may only use GET.',
          },
          session: { type: 'apiKey', in: 'cookie', name: 'gw_session' },
        },
      },
    };
  }
}

function normalize(response: RouteDoc['response']): (ResponseDoc & { status: number })[] {
  if (response === null) return [{ status: 204 }];
  if (response instanceof z.ZodType) return [{ status: 200, schema: response }];
  return [response].flat().map((r) => ({ ...r, status: r.status ?? 200 }));
}

/**
 * For tests: fails any JSON response that does not match what its route's description says, so
 * that the whole test suite checks the description as it goes. The failure is a 500 that names
 * what is wrong.
 */
export function checkResponses(app: FastifyInstance): void {
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const doc = req.routeOptions.config?.doc;
    const status = reply.statusCode;
    if (!doc || status < 200 || status >= 300) return payload;
    const fail = (problem: string, details?: unknown) => {
      reply.status(500).header('content-type', 'application/json; charset=utf-8');
      return JSON.stringify({
        message: `${req.method} ${req.routeOptions.url} ${problem}, unlike its OpenAPI description`,
        details,
      });
    };
    const described = normalize(doc.response).find((r) => r.status === status);
    if (!described) return fail(`answered ${status}`);
    if (!described.schema) return payload;
    if (typeof payload !== 'string') return fail('sent something other than JSON');
    const result = described.schema.safeParse(JSON.parse(payload));
    return result.success ? payload : fail('sent another shape', result.error.issues.slice(0, 5));
  });
}
