import { expect, it } from 'vitest';
import { buildTasksApiPath } from './build-tasks-api-path.ts';

it('builds task list query parameters', () => {
  expect(
    buildTasksApiPath({
      status: 'open',
      priority: 'high',
      dueAfter: '2026-10-22',
      dueBefore: '2026-10-30',
    }),
  ).toBe('/api/tasks?open=true&priority=high&dueAfter=2026-10-22&dueBefore=2026-10-30');
});
