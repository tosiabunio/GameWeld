import type { BacklogItemDetail, TaskDetail } from '@gameweld/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInAs, startApp, type TestContext } from './helpers.ts';

function multipart(fileName: string, contentType: string, content: Buffer | string) {
  const boundary = '----gameweld-test-boundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body };
}

describe('collaboration and history (Phase 7)', () => {
  let t: TestContext;
  let director: string;
  let developer: string;
  let tester: string;
  let projectId: string;
  let itemId: string;
  let taskId: string;

  beforeAll(async () => {
    t = await startApp({ ATTACHMENT_MAX_MB: '0.001' }); // 1 KB limit keeps the size test small
    director = await signInAs(t.app, 'director');
    developer = await signInAs(t.app, 'developer');
    tester = await signInAs(t.app, 'tester');
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: director },
      payload: { name: 'Collab' },
    });
    projectId = created.json().id;
    await t.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/members`,
      headers: { cookie: director },
      payload: { email: 'developer@gameweld.local', roles: ['developer'] },
    });
    itemId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog`,
        headers: { cookie: director },
        payload: { title: 'Collab item', category: 'must' },
      })
    ).json().id;
    taskId = (
      await t.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/backlog/${itemId}/tasks`,
        headers: { cookie: developer },
        payload: { category: 'code', title: 'Collab task' },
      })
    ).json().id;
  });
  afterAll(async () => {
    await t.close();
  });

  const p = (suffix: string) => `/api/projects/${projectId}${suffix}`;
  const itemDetail = async (cookie = developer): Promise<BacklogItemDetail> =>
    (
      await t.app.inject({ method: 'GET', url: p(`/backlog/${itemId}`), headers: { cookie } })
    ).json();
  const taskDetail = async (cookie = developer): Promise<TaskDetail> =>
    (await t.app.inject({ method: 'GET', url: p(`/tasks/${taskId}`), headers: { cookie } })).json();

  it('uploads an attachment to a task, lists it, and streams it back to members only', async () => {
    const up = multipart('notes.txt', 'text/plain', 'hello from the build');
    const res = await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/attachments`),
      headers: { cookie: developer, ...up.headers },
      payload: up.body,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      fileName: 'notes.txt',
      contentType: 'text/plain',
      sizeBytes: 20,
      isImage: false,
      uploadedBy: { displayName: 'Devin Developer' },
    });
    const id = res.json().id;
    expect((await taskDetail()).attachments.map((a) => a.id)).toEqual([id]);

    const download = await t.app.inject({
      method: 'GET',
      url: p(`/attachments/${id}`),
      headers: { cookie: director },
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toBe('hello from the build');
    expect(download.headers['content-disposition']).toMatch(
      /attachment; filename\*=UTF-8''notes\.txt/,
    );
    expect(download.headers['content-type']).toBe('application/octet-stream');
    // Phase 7 exit criterion: non-members are denied; the project is invisible to them.
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: p(`/attachments/${id}`),
          headers: { cookie: tester },
        })
      ).statusCode,
    ).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: p(`/attachments/${id}`) })).statusCode).toBe(
      401,
    );
    // Only the uploader or a Director deletes.
    await t.app.inject({
      method: 'POST',
      url: p('/members'),
      headers: { cookie: director },
      payload: { email: 'tester@gameweld.local', roles: ['tester'] },
    });
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/attachments/${id}`),
          headers: { cookie: tester },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/attachments/${id}`),
          headers: { cookie: developer },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: p(`/attachments/${id}`),
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(404);
    expect((await taskDetail()).attachments).toEqual([]);
  });

  it('rejects files over the limit and cleans up', async () => {
    const up = multipart('big.bin', 'application/octet-stream', Buffer.alloc(4096, 1));
    const res = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/attachments`),
      headers: { cookie: developer, ...up.headers },
      payload: up.body,
    });
    expect(res.statusCode).toBe(413);
    expect((await itemDetail()).attachments).toEqual([]);
  });

  it('sets an image attachment as the item cover and serves it inline', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const up = multipart('cover.png', 'image/png', png);
    const uploaded = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/attachments`),
      headers: { cookie: director, ...up.headers },
      payload: up.body,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().isImage).toBe(true);
    const txt = multipart('a.txt', 'text/plain', 'x');
    const textFile = (
      await t.app.inject({
        method: 'POST',
        url: p(`/backlog/${itemId}/attachments`),
        headers: { cookie: director, ...txt.headers },
        payload: txt.body,
      })
    ).json();
    let item = await itemDetail();
    expect(
      (
        await t.app.inject({
          method: 'PATCH',
          url: p(`/backlog/${itemId}`),
          headers: { cookie: director },
          payload: { version: item.version, coverAttachmentId: textFile.id },
        })
      ).statusCode,
    ).toBe(400);
    const set = await t.app.inject({
      method: 'PATCH',
      url: p(`/backlog/${itemId}`),
      headers: { cookie: director },
      payload: { version: item.version, coverAttachmentId: uploaded.json().id },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().coverAttachmentId).toBe(uploaded.json().id);
    const inline = await t.app.inject({
      method: 'GET',
      url: p(`/attachments/${uploaded.json().id}?inline=1`),
      headers: { cookie: developer },
    });
    expect(inline.headers['content-type']).toBe('image/png');
    expect(inline.headers['content-disposition']).toMatch(/^inline/);
    // Deleting the cover clears the reference.
    await t.app.inject({
      method: 'DELETE',
      url: p(`/attachments/${uploaded.json().id}`),
      headers: { cookie: director },
    });
    item = await itemDetail();
    expect(item.coverAttachmentId).toBeNull();
  });

  it('serves script-bearing SVG attachments only as downloads and rejects SVG covers', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const up = multipart('untrusted.svg', 'image/svg+xml', svg);
    const uploaded = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/attachments`),
      headers: { cookie: developer, ...up.headers },
      payload: up.body,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().isImage).toBe(false);
    for (const suffix of ['', '?inline=1']) {
      const download = await t.app.inject({
        method: 'GET',
        url: p(`/attachments/${uploaded.json().id}${suffix}`),
        headers: { cookie: director },
      });
      expect(download.statusCode).toBe(200);
      expect(download.body).toBe(svg);
      expect(download.headers['content-type']).toBe('application/octet-stream');
      expect(download.headers['content-disposition']).toMatch(/^attachment;/);
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['content-security-policy']).toBe("sandbox; default-src 'none'");
    }
    const cover = await t.app.inject({
      method: 'PATCH',
      url: p(`/backlog/${itemId}`),
      headers: { cookie: director },
      payload: { version: (await itemDetail()).version, coverAttachmentId: uploaded.json().id },
    });
    expect(cover.statusCode).toBe(400);
    expect((await itemDetail()).coverAttachmentId).toBeNull();
  });

  it('comments on tasks; authors edit, authors or Directors delete, rejections are immutable', async () => {
    const c = await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/comments`),
      headers: { cookie: developer },
      payload: { body: 'First pass done.' },
    });
    expect(c.statusCode).toBe(201);
    expect((await taskDetail()).comments.map((x) => x.body)).toEqual(['First pass done.']);
    const id = c.json().id;
    expect(
      (
        await t.app.inject({
          method: 'PATCH',
          url: p(`/comments/${id}`),
          headers: { cookie: director },
          payload: { body: 'nope' },
        })
      ).statusCode,
    ).toBe(403);
    const edited = await t.app.inject({
      method: 'PATCH',
      url: p(`/comments/${id}`),
      headers: { cookie: developer },
      payload: { body: 'First pass done, needs polish.' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().body).toBe('First pass done, needs polish.');
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/comments/${id}`),
          headers: { cookie: tester },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/comments/${id}`),
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(204);
    expect((await taskDetail()).comments).toEqual([]);

    // Rejection comments cannot be edited or deleted.
    await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/complete`),
      headers: { cookie: developer },
    });
    const rejected = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/reject`),
      headers: { cookie: director },
      payload: { note: 'Not yet.' },
    });
    expect(rejected.statusCode).toBe(201);
    expect(
      (
        await t.app.inject({
          method: 'PATCH',
          url: p(`/comments/${rejected.json().id}`),
          headers: { cookie: director },
          payload: { body: 'x' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/comments/${rejected.json().id}`),
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(409);
    await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/reopen`),
      headers: { cookie: developer },
    });
  });

  it('manages links on tasks', async () => {
    const added = await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/links`),
      headers: { cookie: tester },
      payload: { url: 'https://example.com/ref', label: 'Reference' },
    });
    expect(added.statusCode).toBe(201);
    expect((await taskDetail()).links).toEqual([
      { id: added.json().id, url: 'https://example.com/ref', label: 'Reference' },
    ]);
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/tasks/${taskId}/links/${added.json().id}`),
          headers: { cookie: developer },
        })
      ).statusCode,
    ).toBe(204);
    expect((await taskDetail()).links).toEqual([]);
  });

  it('D9: informational dependencies between items, never blocking', async () => {
    const other = (
      await t.app.inject({
        method: 'POST',
        url: p('/backlog'),
        headers: { cookie: director },
        payload: { title: 'Shared enemy base', category: 'must' },
      })
    ).json().id;
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: p(`/backlog/${itemId}/dependencies`),
          headers: { cookie: developer },
          payload: { dependsOnItemId: other },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: p(`/backlog/${itemId}/dependencies`),
          headers: { cookie: director },
          payload: { dependsOnItemId: itemId },
        })
      ).statusCode,
    ).toBe(400);
    const added = await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/dependencies`),
      headers: { cookie: director },
      payload: { dependsOnItemId: other },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().dependsOn).toEqual([
      { id: other, title: 'Shared enemy base', category: 'must', state: 'open' },
    ]);
    expect(
      (
        await t.app.inject({
          method: 'POST',
          url: p(`/backlog/${itemId}/dependencies`),
          headers: { cookie: director },
          payload: { dependsOnItemId: other },
        })
      ).statusCode,
    ).toBe(409);
    const otherDetail: BacklogItemDetail = (
      await t.app.inject({
        method: 'GET',
        url: p(`/backlog/${other}`),
        headers: { cookie: developer },
      })
    ).json();
    expect(otherDetail.dependents.map((d) => d.id)).toEqual([itemId]);
    // The dependent item can still complete its work regardless of the dependency's state.
    await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/complete`),
      headers: { cookie: developer },
    });
    expect((await itemDetail()).state).toBe('ready_for_review');
    await t.app.inject({
      method: 'POST',
      url: p(`/tasks/${taskId}/reopen`),
      headers: { cookie: developer },
    });
    expect(
      (
        await t.app.inject({
          method: 'DELETE',
          url: p(`/backlog/${itemId}/dependencies/${other}`),
          headers: { cookie: director },
        })
      ).statusCode,
    ).toBe(200);
    expect((await itemDetail()).dependsOn).toEqual([]);
  });

  it('Section 14: every listed event appears in history, filtered per item, task, and board', async () => {
    // Set up a board and run through scope, completion, acceptance, roles, exceptions, reparenting, archival.
    const boardId = (
      await t.app.inject({
        method: 'POST',
        url: p('/boards'),
        headers: { cookie: director },
        payload: { name: 'History board' },
      })
    ).json().id;
    const testerId = (
      await t.db.query<{ id: string }>(`SELECT id FROM users WHERE email = 'tester@gameweld.local'`)
    ).rows[0]!.id;
    await t.app.inject({
      method: 'PATCH',
      url: p(`/members/${testerId}`),
      headers: { cookie: director },
      payload: { roles: ['tester', 'developer'] },
    }); // role change
    const first = (await itemDetail()).id; // priority pick: Collab item (must, first)
    await t.app.inject({
      method: 'POST',
      url: p(`/boards/${boardId}/scope`),
      headers: { cookie: director },
      payload: { itemId: first },
    }); // scope change
    const other = (
      await t.app.inject({
        method: 'POST',
        url: p('/backlog'),
        headers: { cookie: director },
        payload: { title: 'Exception source', category: 'could' },
      })
    ).json().id;
    const exceptionTask = (
      await t.app.inject({
        method: 'POST',
        url: p(`/backlog/${other}/tasks`),
        headers: { cookie: developer },
        payload: { category: 'assets', title: 'Exception task' },
      })
    ).json().id;
    await t.app.inject({
      method: 'POST',
      url: p(`/boards/${boardId}/placements`),
      headers: { cookie: director },
      payload: { taskId: exceptionTask },
    }); // exception
    const b = (
      await t.app.inject({ method: 'GET', url: p('/board'), headers: { cookie: developer } })
    ).json();
    const done = b.columns.find((c: { kind: string }) => c.kind === 'done').id;
    await t.app.inject({
      method: 'POST',
      url: p(`/boards/${boardId}/placements/${taskId}/move`),
      headers: { cookie: developer },
      payload: { columnId: done },
    }); // completion
    await t.app.inject({
      method: 'POST',
      url: p(`/backlog/${itemId}/accept`),
      headers: { cookie: director },
      payload: { note: 'ok' },
    }); // acceptance
    const moved = await t.app.inject({
      method: 'PATCH',
      url: p(`/tasks/${exceptionTask}`),
      headers: { cookie: director },
      payload: { version: 1, itemId },
    }); // reparenting
    expect(moved.statusCode).toBe(200);
    await t.app.inject({
      method: 'PATCH',
      url: p(`/tasks/${exceptionTask}`),
      headers: { cookie: director },
      payload: { version: moved.json().version, archived: true },
    }); // archival (task)
    await t.app.inject({
      method: 'POST',
      url: p(`/boards/${boardId}/archive`),
      headers: { cookie: director },
      payload: { returnUnfinished: true },
    }); // archival (board)

    const actions = async (query: string) =>
      (
        (
          await t.app.inject({
            method: 'GET',
            url: p(`/activity${query}`),
            headers: { cookie: developer },
          })
        ).json() as { action: string }[]
      ).map((a) => a.action);

    const all = await actions('');
    for (const expected of [
      'scope.added',
      'task.completed',
      'item.accepted',
      'member.updated',
      'task.placed_as_exception',
      'task.reparented',
      'task.archived',
      'board.archived',
    ]) {
      expect(all, expected).toContain(expected);
    }
    const item = await actions(`?entityType=backlog_item&entityId=${itemId}`);
    expect(item).toContain('item.accepted');
    expect(item).toContain('task.completed'); // the item's tasks are included
    expect(item).not.toContain('board.archived');
    const task = await actions(`?entityType=task&entityId=${taskId}`);
    expect(task).toEqual(expect.arrayContaining(['task.completed', 'task.moved', 'task.created']));
    expect(task).not.toContain('item.accepted');
    const board = await actions(`?entityType=workboard&entityId=${boardId}`);
    expect(board).toEqual(
      expect.arrayContaining([
        'board.created',
        'scope.added',
        'task.placed_as_exception',
        'board.archived',
      ]),
    );
    expect(board).not.toContain('member.updated');
    expect(
      (
        await t.app.inject({
          method: 'GET',
          url: p('/activity?entityType=nope&entityId=' + itemId),
          headers: { cookie: developer },
        })
      ).statusCode,
    ).toBe(400);
  });
});
