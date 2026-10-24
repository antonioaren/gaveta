export interface GavetaTaskToggleMessage {
  readonly type: 'gaveta:task-toggle';
  readonly taskId: string;
  readonly checked: boolean;
}

export interface GavetaTaskCheckedMessage {
  readonly type: 'gaveta:task-checked';
  readonly taskId: string;
  readonly checked: boolean;
}

const TASK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isTaskId(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && TASK_ID_PATTERN.test(trimmed);
}

export function isGavetaTaskToggleMessage(data: unknown): data is GavetaTaskToggleMessage {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as Record<string, unknown>;
  if (record.type !== 'gaveta:task-toggle') {
    return false;
  }
  const taskId = record.taskId;
  if (typeof taskId !== 'string' || !isTaskId(taskId)) {
    return false;
  }
  return typeof record.checked === 'boolean';
}

export function parseGavetaTaskToggleMessage(data: unknown): GavetaTaskToggleMessage | null {
  if (!isGavetaTaskToggleMessage(data)) {
    return null;
  }
  return {
    type: 'gaveta:task-toggle',
    taskId: data.taskId.trim(),
    checked: data.checked,
  };
}

export function buildGavetaTaskCheckedMessage(
  taskId: string,
  checked: boolean,
): GavetaTaskCheckedMessage {
  return { type: 'gaveta:task-checked', taskId, checked };
}
