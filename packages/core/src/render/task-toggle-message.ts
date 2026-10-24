/** postMessage payload from the render iframe when a task checkbox changes. */
export const GAVETA_TASK_TOGGLE_MESSAGE_TYPE = 'gaveta:task-toggle';

export interface GavetaTaskToggleMessage {
  readonly type: typeof GAVETA_TASK_TOGGLE_MESSAGE_TYPE;
  readonly taskId: string;
  readonly checked: boolean;
}

/** Parent → iframe: set checkbox state without emitting another toggle. */
export const GAVETA_TASK_CHECKED_MESSAGE_TYPE = 'gaveta:task-checked';

export interface GavetaTaskCheckedMessage {
  readonly type: typeof GAVETA_TASK_CHECKED_MESSAGE_TYPE;
  readonly taskId: string;
  readonly checked: boolean;
}

const TASK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isTaskId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && TASK_ID_PATTERN.test(trimmed);
}

/**
 * Validates a `message` event payload from the render iframe for task toggles.
 * The parent MUST also verify `event.source === iframe.contentWindow` and only
 * write to the note currently on screen (never trust a ref from the iframe).
 */
export function parseGavetaTaskToggleMessage(data: unknown): GavetaTaskToggleMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== GAVETA_TASK_TOGGLE_MESSAGE_TYPE) {
    return null;
  }
  const taskId = record.taskId;
  if (typeof taskId !== 'string' || !isTaskId(taskId)) {
    return null;
  }
  const checked = record.checked;
  if (typeof checked !== 'boolean') {
    return null;
  }
  return { type: GAVETA_TASK_TOGGLE_MESSAGE_TYPE, taskId: taskId.trim(), checked };
}

export function parseGavetaTaskCheckedMessage(data: unknown): GavetaTaskCheckedMessage | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== GAVETA_TASK_CHECKED_MESSAGE_TYPE) {
    return null;
  }
  const taskId = record.taskId;
  if (typeof taskId !== 'string' || !isTaskId(taskId)) {
    return null;
  }
  const checked = record.checked;
  if (typeof checked !== 'boolean') {
    return null;
  }
  return { type: GAVETA_TASK_CHECKED_MESSAGE_TYPE, taskId: taskId.trim(), checked };
}
