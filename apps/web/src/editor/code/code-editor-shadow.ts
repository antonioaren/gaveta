const SHELL_STYLES = `
:host {
  display: block;
  height: 100%;
  min-height: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}
[data-cm-mount] {
  height: 100%;
  min-height: 0;
}
.cm-editor {
  height: 100%;
}
.cm-scroller {
  font-family: inherit;
}
.cm-gutters {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}
.cm-activeLineGutter {
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
.cm-lintRange-error {
  background: color-mix(in srgb, var(--color-danger) 20%, transparent);
}
`;

const shellStyledRoots = new WeakSet<ShadowRoot>();

function adoptShellStyles(shadowRoot: ShadowRoot): void {
  if (shellStyledRoots.has(shadowRoot)) {
    return;
  }
  if (typeof CSSStyleSheet === 'undefined' || !('replaceSync' in CSSStyleSheet.prototype)) {
    return;
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(SHELL_STYLES);
  shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  shellStyledRoots.add(shadowRoot);
}

export function ensureCodeEditorShadowMount(host: HTMLElement): {
  shadowRoot: ShadowRoot;
  mount: HTMLDivElement;
} {
  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  adoptShellStyles(shadowRoot);
  let mount = shadowRoot.querySelector<HTMLDivElement>('[data-cm-mount]');
  if (mount === null) {
    mount = document.createElement('div');
    mount.dataset.cmMount = '';
    shadowRoot.appendChild(mount);
  }
  return { shadowRoot, mount };
}
