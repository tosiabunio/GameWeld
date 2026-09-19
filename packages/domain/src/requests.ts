import type { TaskCategory } from './tasks.ts';

/** Out-of-scope work requests, specification Section 9 (D2). */

export const REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export interface WorkRequest {
  id: string;
  boardId: string;
  boardName: string;
  task: { id: string; title: string; category: TaskCategory; completed: boolean; placed: boolean };
  item: { id: string; title: string };
  requester: { id: string; displayName: string };
  reason: string;
  status: RequestStatus;
  decidedBy: { id: string; displayName: string } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

/**
 * Asks for one task of an out-of-scope item to be placed: an unplaced task that exists, or a new
 * one, created under the item together with the request. Exactly one of the two.
 */
export interface CreateRequestInput {
  taskId?: string;
  newTask?: { itemId: string; category: TaskCategory; title: string };
  reason?: string;
}

export interface DecideRequestInput {
  note?: string;
}
