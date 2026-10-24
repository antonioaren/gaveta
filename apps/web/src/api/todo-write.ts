import { apiJson } from './client.ts';

interface TaskMutationResponse {
  readonly hash: string;
  readonly taskId: string;
  readonly checked: boolean;
}

export async function todoSetChecked(
  ref: string,
  taskId: string,
  checked: boolean,
  ifMatch: string,
): Promise<TaskMutationResponse> {
  const path = checked ? '/api/todo/check' : '/api/todo/uncheck';
  const envelope = await apiJson<TaskMutationResponse>(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'if-match': ifMatch,
    },
    body: JSON.stringify({ ref, taskId }),
  });
  return envelope.data;
}
