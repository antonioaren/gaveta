export type TaskStatusFilter = 'all' | 'open' | 'done';
export type TaskPriorityFilter = 'all' | 'low' | 'medium' | 'high';

export interface TaskViewFilters {
  readonly status: TaskStatusFilter;
  readonly priority: TaskPriorityFilter;
  readonly dueAfter: string;
  readonly dueBefore: string;
}

export function buildTasksApiPath(filters: TaskViewFilters): string {
  const params = new URLSearchParams();
  if (filters.status === 'open') {
    params.set('open', 'true');
  }
  if (filters.status === 'done') {
    params.set('done', 'true');
  }
  if (filters.priority !== 'all') {
    params.set('priority', filters.priority);
  }
  if (filters.dueAfter.length > 0) {
    params.set('dueAfter', filters.dueAfter);
  }
  if (filters.dueBefore.length > 0) {
    params.set('dueBefore', filters.dueBefore);
  }
  const query = params.toString();
  return query.length === 0 ? '/api/tasks' : `/api/tasks?${query}`;
}
