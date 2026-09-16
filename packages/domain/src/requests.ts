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

export interface CreateRequestInput {
  taskId: string;
  reason?: string;
}

export interface DecideRequestInput {
  note?: string;
}
