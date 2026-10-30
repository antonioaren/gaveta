import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ListedTaskView } from '../api/types.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { viewerRefForNote } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import {
  type TaskPriorityFilter,
  type TaskStatusFilter,
  type TaskViewFilters,
} from './build-tasks-api-path.ts';
import { useAggregatedTasks } from './useAggregatedTasks.ts';

function emptyFilters(): TaskViewFilters {
  return {
    status: 'all',
    priority: 'all',
    dueAfter: '',
    dueBefore: '',
  };
}

function formatDue(due: string | null): string {
  if (due === null) {
    return '—';
  }
  return due.length >= 10 ? due.slice(0, 10) : due;
}

function formatPriority(
  priority: string | null,
  t: (
    key: 'web.tasks.priority.high' | 'web.tasks.priority.medium' | 'web.tasks.priority.low',
  ) => string,
): string {
  if (priority === 'high') {
    return t('web.tasks.priority.high');
  }
  if (priority === 'medium') {
    return t('web.tasks.priority.medium');
  }
  if (priority === 'low') {
    return t('web.tasks.priority.low');
  }
  return '—';
}

export function AggregatedTasksView() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<TaskViewFilters>(emptyFilters);
  const { tasks, loading, error } = useAggregatedTasks(filters);
  const tabState = useTabs();
  const navigate = useNavigate();

  const rows = useMemo(() => tasks, [tasks]);

  const openSourceNote = (task: ListedTaskView) => {
    const ref = viewerRefForNote({
      id: task.noteId,
      path: task.path,
      title: task.noteTitle,
      type: task.noteType,
      tags: [],
      aliases: [],
    });
    tabState.openTab(ref, task.noteTitle, task.path, task.noteId);
    void navigate(`/nota/${encodeURIComponent(ref)}`);
  };

  return (
    <div className="tasks-view">
      <header className="tasks-view__header">
        <h1 className="tasks-view__title">{t('web.tasks.title')}</h1>
        <div className="tasks-view__filters" aria-label={t('web.tasks.filters.aria')}>
          <label>
            <span>{t('web.tasks.status.label')}</span>
            <select
              className="ui-select"
              value={filters.status}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as TaskStatusFilter,
                }));
              }}
            >
              <option value="all">{t('web.tasks.status.all')}</option>
              <option value="open">{t('web.tasks.status.open')}</option>
              <option value="done">{t('web.tasks.status.done')}</option>
            </select>
          </label>
          <label>
            <span>{t('web.tasks.priority.label')}</span>
            <select
              className="ui-select"
              value={filters.priority}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  priority: event.target.value as TaskPriorityFilter,
                }));
              }}
            >
              <option value="all">{t('web.tasks.priority.all')}</option>
              <option value="high">{t('web.tasks.priority.high')}</option>
              <option value="medium">{t('web.tasks.priority.medium')}</option>
              <option value="low">{t('web.tasks.priority.low')}</option>
            </select>
          </label>
          <label>
            <span>{t('web.tasks.dueFrom')}</span>
            <input
              type="date"
              value={filters.dueAfter}
              onChange={(event) => {
                setFilters((current) => ({ ...current, dueAfter: event.target.value }));
              }}
            />
          </label>
          <label>
            <span>{t('web.tasks.dueTo')}</span>
            <input
              type="date"
              value={filters.dueBefore}
              onChange={(event) => {
                setFilters((current) => ({ ...current, dueBefore: event.target.value }));
              }}
            />
          </label>
        </div>
      </header>
      {loading ? (
        <p className="tasks-view__status" role="status">
          {t('web.tasks.loading')}
        </p>
      ) : null}
      {error !== null ? (
        <p className="tasks-view__status tasks-view__status--error" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && error === null && rows.length === 0 ? (
        <p className="tasks-view__status" role="status">
          {t('web.tasks.empty')}
        </p>
      ) : null}
      {!loading && error === null && rows.length > 0 ? (
        <table className="tasks-view__table" aria-label={t('web.tasks.table.aria')}>
          <thead>
            <tr>
              <th scope="col">{t('web.tasks.column.task')}</th>
              <th scope="col">{t('web.tasks.column.due')}</th>
              <th scope="col">{t('web.tasks.column.priority')}</th>
              <th scope="col">{t('web.tasks.column.note')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((task) => (
              <tr key={`${task.path}:${task.taskId ?? task.text}`}>
                <td>
                  <span className={task.checked ? 'tasks-view__task--done' : undefined}>
                    {task.checked ? '☑ ' : '☐ '}
                    {task.text}
                  </span>
                </td>
                <td>{formatDue(task.due)}</td>
                <td>{formatPriority(task.priority, t)}</td>
                <td>
                  <button
                    type="button"
                    className="tasks-view__note-link"
                    onClick={() => {
                      openSourceNote(task);
                    }}
                  >
                    {t('web.tasks.openNote', { title: task.noteTitle })}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
