import { buildGavetaTaskCheckedMessage } from './task-toggle-message.ts';

/** Parent → sandboxed render iframe: set checkbox state without firing another toggle. */
export function sendTaskCheckedToRenderIframe(
  iframeWindow: Window,
  taskId: string,
  checked: boolean,
): void {
  iframeWindow.postMessage(buildGavetaTaskCheckedMessage(taskId, checked), '*');
}
