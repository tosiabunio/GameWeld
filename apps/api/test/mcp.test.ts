import type { CreatedToken } from '@gameweld/domain';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCP_TOOLS } from '../src/mcp.ts';
import { signInAs, startApp, type TestContext } from './helpers.ts';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The MCP server, driven over HTTP by the SDK's own client, as an assistant would. */
describe('the MCP server', () => {
  let t: TestContext;
  let url: URL;
  let projectId: string;
  const cookies = { director: '', developer: '' };
  const clients: Client[] = [];

  const makeToken = async (who: keyof typeof cookies, name: string, access: 'read' | 'write') =>
    (
      await t.app.inject({
        method: 'POST',
        url: '/api/me/tokens',
        headers: { cookie: cookies[who] },
        payload: { name, access },
      })
    ).json() as CreatedToken;

  const connect = async (secret: string) => {
    const client = new Client({ name: 'gameweld-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { authorization: `Bearer ${secret}` } },
    });
    // The SDK's types are not written for exactOptionalPropertyTypes; the transport fits.
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
  };

  /** Calls a tool and reads its answer, failing the test if the tool refused. */
  const call = async (client: Client, name: string, args: Json = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    if (result.isError) throw new Error(`${name} refused: ${text}`);
    return JSON.parse(text);
  };

  beforeAll(async () => {
    t = await startApp();
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    url = new URL(`http://127.0.0.1:${(t.app.server.address() as AddressInfo).port}/api/mcp`);
    cookies.director = await signInAs(t.app, 'director');
    cookies.developer = await signInAs(t.app, 'developer');
    projectId = (
      await t.app.inject({
        method: 'POST',
        url: '/api/projects',
        headers: { cookie: cookies.director },
        payload: { name: 'Assisted', scopeLimit: 2 },
      })
    ).json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: cookies.director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/boards`,
      headers: { cookie: cookies.director },
      payload: { name: 'Sprint 1' },
    });
  });
  afterAll(async () => {
    for (const client of clients) await client.close();
    await t.close();
  });

  it('offers every tool to a read-write token, and describes the project’s ways', async () => {
    const client = await connect((await makeToken('director', 'Claude', 'write')).secret);
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([...MCP_TOOLS.read, ...MCP_TOOLS.write].sort());
    const create = tools.find((x) => x.name === 'create_item')!;
    expect(create.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(create.inputSchema.required).toEqual(['projectId', 'title', 'category']);
    expect(tools.find((x) => x.name === 'get_backlog')!.annotations?.readOnlyHint).toBe(true);
    expect(client.getInstructions()).toContain('Workboard');
  });

  it('offers a read-only token only the tools that read', async () => {
    const client = await connect((await makeToken('developer', 'Reader', 'read')).secret);
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual([...MCP_TOOLS.read].sort());
    const projects = await call(client, 'list_projects');
    expect(projects.me.name).toBe('Devin Developer');
    expect(projects.projects.map((p: Json) => p.name)).toContain('Assisted');
  });

  it('plans and moves work as the member, by the same rules, marked with the token', async () => {
    const client = await connect((await makeToken('director', 'Planner', 'write')).secret);
    const project = await call(client, 'get_project', { projectId });
    expect(project.youMay).toContain('backlog.manage');
    expect(project.activeBoard.name).toBe('Sprint 1');
    const developer = project.members.find((m: Json) => m.name === 'Devin Developer');

    const item = await call(client, 'create_item', {
      projectId,
      title: 'Grappling hook',
      category: 'must',
      description: 'Swing across gaps.',
    });
    expect(item).toMatchObject({ category: 'must', state: 'open', onBoard: null });
    const breakdown = await call(client, 'create_tasks', {
      projectId,
      itemId: item.id,
      tasks: [
        { title: 'Rope physics', category: 'code', assigneeId: developer.id },
        { title: 'Hook model', category: 'assets' },
      ],
    });
    expect(breakdown.created.map((x: Json) => x.title)).toEqual(['Rope physics', 'Hook model']);
    expect(breakdown.created[0].assignee.name).toBe('Devin Developer');

    const backlog = await call(client, 'get_backlog', { projectId });
    expect(backlog.must.map((x: Json) => x.title)).toEqual(['Grappling hook']);
    const overview = await call(client, 'get_overview', { projectId });
    expect(overview.items).toEqual({ total: 1, open: 1, readyForReview: 0, done: 0 });
    expect(overview.tasks).toMatchObject({ total: 2, completed: 0, waiting: 2, onNoBoard: 2 });
    expect(overview.byKind.code).toMatchObject({ total: 1, unassigned: 0 });
    expect(overview.itemList).toEqual([
      {
        id: item.id,
        title: 'Grappling hook',
        category: 'must',
        state: 'open',
        tasks: '0/2 complete',
        waiting: 2,
      },
    ]);

    const scope = await call(client, 'add_to_scope', { projectId, itemId: item.id });
    expect(scope.scope.map((x: Json) => x.title)).toEqual(['Grappling hook']);
    const board = await call(client, 'get_workboard', { projectId });
    const todoCode = board.columns.find((c: Json) => c.kind === 'todo_code');
    expect(todoCode.cards.map((c: Json) => c.title)).toEqual(['Rope physics']);

    // By the column's name, into Done: the task is complete.
    const rope = breakdown.created[0].id;
    const moved = await call(client, 'move_card', { projectId, taskId: rope, column: 'done' });
    expect(moved).toMatchObject({ completed: true, board: { column: 'Done' } });

    const history = await call(client, 'get_history', {
      projectId,
      actions: 'task.moved,task.completed',
    });
    expect(history.map((e: Json) => [e.action, e.who, e.via])).toEqual([
      ['task.completed', 'Dana Director', 'Planner'],
      ['task.moved', 'Dana Director', 'Planner'],
    ]);
    const stays = await call(client, 'get_column_stays', { projectId, taskId: rope });
    expect(stays.map((s: Json) => s.column)).toEqual(['To Do · Code', 'Done']);

    const updated = await call(client, 'update_task', {
      projectId,
      taskId: breakdown.created[1].id,
      blocked: true,
      blockedReason: 'Waiting for the rope texture',
    });
    expect(updated.blocked).toBe('Waiting for the rope texture');
    const comment = await call(client, 'add_comment', {
      projectId,
      itemId: item.id,
      body: 'Broken down by an assistant.',
    });
    expect(comment.author).toBe('Dana Director');
  });

  it('passes a refusal on, with the application’s reason', async () => {
    const client = await connect((await makeToken('developer', 'Eager', 'write')).secret);
    const refused = await client.callTool({
      name: 'create_item',
      arguments: { projectId, title: 'Not mine to add', category: 'could' },
    });
    expect(refused.isError).toBe(true);
    expect((refused.content as { text: string }[])[0]!.text).toBe('Not permitted');

    const invalid = await client.callTool({
      name: 'get_history',
      arguments: { projectId, from: 'last week' },
    });
    expect(invalid.isError).toBe(true);
    expect((invalid.content as { text: string }[])[0]!.text).toMatch(
      /^Invalid history query: .*"from"/,
    );

    const lost = await client.callTool({
      name: 'move_card',
      arguments: {
        projectId,
        taskId: '00000000-0000-0000-0000-000000000000',
        column: 'Done',
      },
    });
    expect(lost.isError).toBe(true);
  });

  it('needs a token, and answers only POST', async () => {
    const anonymous = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(anonymous.status).toBe(401);
    const stream = await fetch(url, { headers: { accept: 'text/event-stream' } });
    expect(stream.status).toBe(405);
  });
});
