import type { NotificationSummary } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

describe('notifications and what waits for a member', () => {
  let t: TestContext;
  const cookies = { director: '', developer: '', tester: '' };
  const ids = { director: '', developer: '', tester: '' };
  let projectId: string;
  let boardId: string;
  let inScope: string;
  let outside: string;

  type Who = keyof typeof cookies;
  const call = (
    who: Who,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    t.app.inject({
      method,
      url: `/api${url}`,
      headers: { cookie: cookies[who] },
      ...(payload ? { payload } : {}),
    });
  const project = (who: Who, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
    call(who, method, `/projects/${projectId}${url}`, payload);
  /** A member's summary, narrowed to this test's project: the database is shared between tests. */
  const summary = async (who: Who): Promise<NotificationSummary> => {
    const all: NotificationSummary = (await call(who, 'GET', '/notifications')).json();
    return {
      ...all,
      notifications: all.notifications.filter((n) => n.project.id === projectId),
      waiting: all.waiting.filter((w) => w.project.id === projectId),
    };
  };
  const kinds = async (who: Who) => (await summary(who)).notifications.map((n) => n.kind);
  const createTask = async (who: Who, itemId: string, title: string, extra: object = {}) =>
    (
      await project(who, 'POST', `/backlog/${itemId}/tasks`, { title, category: 'code', ...extra })
    ).json() as { id: string; version: number };

  beforeAll(async () => {
    t = await startApp();
    for (const who of Object.keys(cookies) as Who[]) {
      cookies[who] = await signInAs(t.app, who);
      ids[who] = (await call(who, 'GET', '/me')).json().id;
    }
    projectId = (await call('director', 'POST', '/projects', { name: 'Notified' })).json().id;
    await project('director', 'POST', '/members', {
      email: 'developer@gameweld.local',
      roles: ['developer'],
    });
    await project('director', 'POST', '/members', {
      email: 'tester@gameweld.local',
      roles: ['tester'],
    });
    inScope = (
      await project('director', 'POST', '/backlog', { title: 'In scope', category: 'must' })
    ).json().id;
    outside = (
      await project('director', 'POST', '/backlog', { title: 'Outside', category: 'should' })
    ).json().id;
    boardId = (await project('director', 'POST', '/boards', { name: 'Sprint' })).json().id;
    await project('director', 'POST', `/boards/${boardId}/scope`, { itemId: inScope });
  });
  afterAll(async () => {
    await t.close();
  });

  it('tells a member when work is given to them or taken away, but never about their own doing', async () => {
    const mine = await createTask('director', inScope, 'Given at creation', {
      assigneeId: ids.developer,
    });
    const own = await createTask('developer', inScope, 'Taken by myself', {
      assigneeId: ids.developer,
    });
    expect(await kinds('developer')).toEqual(['task.assigned']);
    const first = (await summary('developer')).notifications[0]!;
    expect(first).toMatchObject({
      actor: { displayName: 'Dana Director' },
      task: { id: mine.id, title: 'Given at creation' },
      item: { title: 'In scope' },
      project: { name: 'Notified' },
      read: false,
    });

    await project('director', 'PATCH', `/tasks/${own.id}`, {
      version: own.version,
      assigneeId: ids.tester,
    });
    expect(await kinds('developer')).toEqual(['task.unassigned', 'task.assigned']);
    expect(await kinds('tester')).toEqual(['task.assigned']);
    expect(await kinds('director')).toEqual([]);
  });

  it('counts unread notifications and marks them read, some or all', async () => {
    // Other test files notify the same personas at the same time, so the count is checked
    // against this project's share of it rather than as an exact number.
    const before = await summary('developer');
    expect(before.notifications).toHaveLength(2);
    expect(before.notifications.every((n) => !n.read)).toBe(true);
    expect(before.unread).toBeGreaterThanOrEqual(2);
    const res = await call('developer', 'POST', '/notifications/read', {
      ids: [before.notifications[0]!.id],
    });
    expect(res.statusCode).toBe(204);
    expect((await summary('developer')).notifications.map((n) => n.read)).toEqual([true, false]);
    // Nobody marks another member's notifications.
    const theirs = (await summary('tester')).notifications[0]!.id;
    await call('developer', 'POST', '/notifications/read', { ids: [theirs] });
    expect((await summary('tester')).notifications[0]!.read).toBe(false);

    await call('developer', 'POST', '/notifications/read');
    expect((await summary('developer')).notifications.map((n) => n.read)).toEqual([true, true]);
    expect(
      (await call('developer', 'POST', '/notifications/read', { ids: ['nope'] })).statusCode,
    ).toBe(400);
    expect((await t.app.inject({ method: 'GET', url: '/api/notifications' })).statusCode).toBe(401);
  });

  it('tells the task’s assignee and the conversation about a comment', async () => {
    const task = await createTask('director', inScope, 'Discussed', { assigneeId: ids.developer });
    await call('developer', 'POST', '/notifications/read');
    await project('tester', 'POST', `/tasks/${task.id}/comments`, {
      body: 'Does it  handle\nlag?',
    });
    const note = (await summary('developer')).notifications[0]!;
    expect(note).toMatchObject({
      kind: 'comment.added',
      actor: { displayName: 'Tess Tester' },
      task: { title: 'Discussed' },
      detail: 'Does it handle lag?',
    });
    // The answer reaches the one who asked; the author of a comment is not told of it.
    await project('developer', 'POST', `/tasks/${task.id}/comments`, { body: 'It does.' });
    expect((await kinds('tester'))[0]).toBe('comment.added');
    expect(
      (await summary('developer')).notifications.filter((n) => n.kind === 'comment.added'),
    ).toHaveLength(1);
  });

  it('puts a placement request before the Directors until it is decided, then tells the requester', async () => {
    const task = await createTask('developer', outside, 'Wanted now');
    expect((await summary('director')).waiting).toEqual([]);
    const request = (
      await project('developer', 'POST', `/boards/${boardId}/requests`, {
        taskId: task.id,
        reason: 'An artist is free.',
      })
    ).json();
    const director = await summary('director');
    expect(director.notifications[0]).toMatchObject({
      kind: 'request.created',
      task: { title: 'Wanted now' },
      detail: 'An artist is free.',
    });
    expect(director.waiting).toMatchObject([
      {
        kind: 'request',
        task: { title: 'Wanted now' },
        item: { title: 'Outside' },
        requester: { displayName: 'Devin Developer' },
      },
    ]);
    // Waiting is for those who can decide.
    expect((await summary('developer')).waiting).toEqual([]);

    await project('director', 'POST', `/boards/${boardId}/requests/${request.id}/reject`, {
      note: 'Next sprint.',
    });
    expect((await summary('director')).waiting).toEqual([]);
    expect((await summary('developer')).notifications[0]).toMatchObject({
      kind: 'request.rejected',
      detail: 'Next sprint.',
      task: { title: 'Wanted now' },
    });

    // A request settled by the system, here because its task was finished, is told as well.
    await project('developer', 'POST', `/boards/${boardId}/requests`, { taskId: task.id });
    await project('tester', 'POST', `/tasks/${task.id}/complete`);
    expect((await summary('developer')).notifications[0]).toMatchObject({
      kind: 'request.rejected',
      detail: 'Task completed',
    });
  });

  it('puts an item that is ready for review before those who can accept it, and tells the workers the verdict', async () => {
    const item = (
      await project('director', 'POST', '/backlog', { title: 'Reviewed', category: 'could' })
    ).json().id;
    const task = await createTask('director', item, 'Only task', { assigneeId: ids.developer });
    await project('developer', 'POST', `/tasks/${task.id}/complete`);
    const director = await summary('director');
    expect(director.notifications[0]).toMatchObject({
      kind: 'item.ready_for_review',
      item: { title: 'Reviewed' },
      actor: { displayName: 'Devin Developer' },
    });
    const reviews = (s: NotificationSummary) =>
      s.waiting.filter((w) => w.kind === 'review' && w.item.title === 'Reviewed');
    expect(reviews(director)).toHaveLength(1);
    expect((await summary('tester')).waiting).toEqual([]);

    await project('director', 'POST', `/backlog/${item}/reject`, { note: 'Timing feels off.' });
    expect((await summary('developer')).notifications[0]).toMatchObject({
      kind: 'item.rejected',
      detail: 'Timing feels off.',
    });
    // A rejected item stays Ready for Review, and so stays waiting.
    expect(reviews(await summary('director'))).toHaveLength(1);
    await project('director', 'POST', `/backlog/${item}/accept`, { note: '' });
    expect(reviews(await summary('director'))).toEqual([]);
    expect((await summary('developer')).notifications[0]).toMatchObject({ kind: 'item.accepted' });
  });

  it('tells a member who is named in a comment or a description, once, and only a member', async () => {
    const task = await createTask('director', inScope, 'Mentioning', { assigneeId: ids.developer });
    await call('developer', 'POST', '/notifications/read');
    await call('tester', 'POST', '/notifications/read');
    const unread = async (who: Who) =>
      (await summary(who)).notifications.filter((n) => !n.read).map((n) => n.kind);

    // Named in a comment: that, rather than "there was a comment"; others still hear of the comment.
    await project('director', 'POST', `/tasks/${task.id}/comments`, {
      body: 'Can @tess tester check this? Not @Tess Testerson, not mail@Tess Tester.',
    });
    expect(await unread('tester')).toEqual(['mention']);
    expect((await summary('tester')).notifications[0]).toMatchObject({
      actor: { displayName: 'Dana Director' },
      task: { title: 'Mentioning' },
    });
    expect(await unread('developer')).toEqual(['comment.added']);

    // An edit that leaves the mention standing tells nobody again; a new name is told.
    const comment = (await project('director', 'GET', `/tasks/${task.id}`)).json().comments[0];
    await project('director', 'PATCH', `/comments/${comment.id}`, {
      body: 'Can @Tess Tester and @Devin Developer check this?',
    });
    expect(await unread('tester')).toEqual(['mention']);
    expect(await unread('developer')).toEqual(['mention', 'comment.added']);

    // A description names people too; naming yourself, or a stranger, tells nobody.
    await call('tester', 'POST', '/notifications/read');
    const current = (await project('director', 'GET', `/tasks/${task.id}`)).json();
    await project('director', 'PATCH', `/tasks/${task.id}`, {
      version: current.version,
      description: 'Pair with @Tess Tester. cc @Dana Director @Nobody Here',
    });
    expect(await unread('tester')).toEqual(['mention']);
    expect(await unread('director')).not.toContain('mention');
  });

  it('shows nothing from a project to someone who has left it', async () => {
    expect((await summary('tester')).notifications.length).toBeGreaterThan(0);
    await project('director', 'DELETE' as 'POST', `/members/${ids.tester}`);
    expect((await summary('tester')).notifications).toEqual([]);
  });
});
