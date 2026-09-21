import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth.ts';
import { createMcpServer } from '../mcp.ts';
import { publicRoute } from '../openapi.ts';

/**
 * The MCP server's address, for assistants that speak the Model Context Protocol over streamable
 * HTTP. Stateless: every POST carries its own JSON-RPC messages and its own API token, and is
 * answered with JSON. The tools are in mcp.ts.
 */
export const mcpRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/mcp',
    {
      config: {
        doc: {
          id: 'mcp',
          summary: 'The MCP server, for AI assistants',
          description:
            'Model Context Protocol over streamable HTTP, stateless, answered with JSON. Its tools read and change the project as the member whose API token comes with the request; a read-only token is offered only the tools that read. See docs/api.md for connecting an assistant.',
          body: z
            .union([z.record(z.unknown()), z.array(z.record(z.unknown()))])
            .describe('A JSON-RPC message, or a batch of them.'),
          response: { content: 'application/json', description: 'The JSON-RPC answers' },
        },
        // It changes nothing by itself: a read-only token gets only the tools that read.
        readOnlySafe: true,
      },
      preHandler: requireUser,
    },
    async (req, reply) => {
      const server = createMcpServer(app, req);
      // No session id generator: stateless, each request with a transport of its own.
      const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
      reply.hijack();
      reply.raw.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        // The SDK's types are not written for exactOptionalPropertyTypes; the transport fits.
        await server.connect(transport as Transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } catch (err) {
        req.log.error(err, 'MCP request failed');
        if (!reply.raw.headersSent)
          reply.raw.writeHead(500, { 'content-type': 'application/json' }).end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32603, message: 'Internal error' },
              id: null,
            }),
          );
      }
    },
  );

  // A stateless server has no stream to open and no session to end.
  for (const method of ['GET', 'DELETE'] as const)
    app.route({
      method,
      url: '/mcp',
      ...publicRoute({
        id: `mcp${method[0]}${method.slice(1).toLowerCase()}`,
        summary: `${method} on the MCP server, which it does not offer`,
        response: { status: 405, content: 'application/json' },
        hidden: true,
      }),
      handler: async (_req, reply) =>
        reply
          .status(405)
          .header('allow', 'POST')
          .send({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
          }),
    });
};
