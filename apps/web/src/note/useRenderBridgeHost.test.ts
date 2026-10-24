// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client.ts';
import * as noteHash from '../api/note-hash.ts';
import * as todoWrite from '../api/todo-write.ts';
import type { TabContextValue } from '../tabs/tab-context-state.ts';
import { useRenderBridgeHost } from './useRenderBridgeHost.ts';

const tabState = {
  openTab: vi.fn(),
  closeTab: vi.fn(),
  activateTab: vi.fn(),
  remapNotePath: vi.fn(),
  tabs: [],
  activeTabId: null,
} satisfies TabContextValue;

beforeEach(() => {
  vi.spyOn(noteHash, 'fetchNoteContentHash').mockResolvedValue('sha256:base');
  vi.spyOn(todoWrite, 'todoSetChecked').mockResolvedValue({
    hash: 'sha256:next',
    taskId: 'revisar',
    checked: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function postFromIframe(iframeWindow: Window, data: unknown): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data,
      source: iframeWindow,
    }),
  );
}

it('persists task toggles for the active note ref only', async () => {
  const iframeWindow = { postMessage: vi.fn() } as unknown as Window;
  const iframeWindowRef = { current: iframeWindow };
  renderHook(() =>
    useRenderBridgeHost({
      iframeWindowRef,
      noteRef: 'Enlace 20',
      tabState,
    }),
  );

  await act(async () => {
    postFromIframe(iframeWindow, {
      type: 'gaveta:task-toggle',
      taskId: 'revisar',
      checked: true,
    });
    await Promise.resolve();
  });

  expect(todoWrite.todoSetChecked).toHaveBeenCalledWith(
    'Enlace 20',
    'revisar',
    true,
    'sha256:base',
  );
});

it('ignores forged postMessage events from other windows', async () => {
  const iframeWindow = { postMessage: vi.fn() } as unknown as Window;
  const iframeWindowRef = { current: iframeWindow };
  renderHook(() =>
    useRenderBridgeHost({
      iframeWindowRef,
      noteRef: 'Enlace 20',
      tabState,
    }),
  );

  const evil = { postMessage: vi.fn() } as unknown as Window;
  await act(async () => {
    postFromIframe(evil, {
      type: 'gaveta:task-toggle',
      taskId: 'revisar',
      checked: true,
    });
    await Promise.resolve();
  });

  expect(todoWrite.todoSetChecked).not.toHaveBeenCalled();
});

it('reverts the checkbox and surfaces a Spanish message on conflict', async () => {
  vi.spyOn(todoWrite, 'todoSetChecked').mockRejectedValue(
    new ApiError(409, 'E_CONFLICT', 'La nota ha cambiado desde la última lectura.', {
      hash: 'sha256:fresh',
    }),
  );
  const postMessage = vi.fn();
  const iframeWindow = { postMessage } as unknown as Window;
  const iframeWindowRef = { current: iframeWindow };
  const { result } = renderHook(() =>
    useRenderBridgeHost({
      iframeWindowRef,
      noteRef: 'Enlace 20',
      tabState,
    }),
  );

  await act(async () => {
    postFromIframe(iframeWindow, {
      type: 'gaveta:task-toggle',
      taskId: 'revisar',
      checked: true,
    });
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(postMessage).toHaveBeenCalledWith(
    { type: 'gaveta:task-checked', taskId: 'revisar', checked: false },
    '*',
  );
  expect(result.current.taskError).toBe('La nota ha cambiado desde la última lectura.');
});
