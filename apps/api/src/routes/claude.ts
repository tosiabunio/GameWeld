import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publicRoute } from '../openapi.ts';
import { PLUGIN_DIR, pluginArchive } from '../plugin.ts';

/**
 * The GameWeld plugin for Claude Code, served by the instance: a marketplace that Claude Code
 * adds by its address, and the plugin's zip, which it downloads. Neither needs a token; the
 * plugin holds the skill, and the skill uses the MCP server with the member's own token.
 */
export const claudeRoutes: FastifyPluginAsync = async (app) => {
  const { publicUrl } = app.ctx.config;
  // The address people reach the instance at, which the marketplace must name for the zip.
  const origin = (req: FastifyRequest) => publicUrl ?? `${req.protocol}://${req.host}`;
  const manifest = JSON.parse(
    await readFile(path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json'), 'utf8'),
  ) as { name: string; description: string };

  app.get(
    '/claude/marketplace.json',
    publicRoute({
      id: 'getClaudeMarketplace',
      summary: 'A Claude Code plugin marketplace with the GameWeld skill',
      description:
        'Add it in Claude Code with /plugin marketplace add and this address, then /plugin install gameweld@gameweld. The plugin is the zip below; Claude Code downloads it only over HTTPS.',
      response: { content: 'application/json', description: 'The marketplace' },
    }),
    async (req) => {
      const { sha256 } = await pluginArchive();
      return {
        name: 'gameweld',
        owner: { name: 'GameWeld' },
        description: `GameWeld at ${origin(req)}, for Claude Code.`,
        plugins: [
          {
            name: manifest.name,
            description: manifest.description,
            // No version: the digest is the version, so a changed skill is an update.
            source: { source: 'archive', url: `${origin(req)}/api/claude/gameweld.zip`, sha256 },
          },
        ],
      };
    },
  );

  app.get(
    '/claude/gameweld.zip',
    publicRoute({
      id: 'getClaudePlugin',
      summary: 'The GameWeld plugin for Claude Code, as a zip',
      response: { content: 'application/zip', description: 'The plugin' },
    }),
    async (_req, reply) => {
      const { zip } = await pluginArchive();
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', 'attachment; filename="gameweld.zip"')
        .send(zip);
    },
  );
};
