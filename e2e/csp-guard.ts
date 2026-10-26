import type { ConsoleMessage, Page, Request } from 'playwright';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function isLocalServeHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname);
}

export interface CspGuardSnapshot {
  readonly policyViolations: string[];
  readonly cspConsoleErrors: string[];
  readonly remoteRequestUrls: string[];
}

export interface CspGuardHandle {
  snapshot(): CspGuardSnapshot;
  assertClean(): Promise<void>;
}

function isCspConsoleError(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('is ignored when delivered via a <meta> element')) {
    return false;
  }
  if (lower.includes('refused to apply inline style') && lower.includes('style attributes')) {
    return false;
  }
  return (
    lower.includes('refused to apply inline style') ||
    lower.includes('refused to execute inline script') ||
    lower.includes('refused to load') ||
    lower.includes('refused to evaluate') ||
    lower.includes('violates the following content security policy')
  );
}

/** Registers CSP violation tracking before navigation (call on a fresh Page). */
export async function installCspViolationListener(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const list = (window as { __gavetaCspViolations?: string[] }).__gavetaCspViolations ?? [];
      list.push(`${event.violatedDirective}:${event.blockedURI}`);
      (window as { __gavetaCspViolations?: string[] }).__gavetaCspViolations = list;
    });
  });
}

/** Playwright guard for the real `gaveta serve` shell: CSP violations and non-local requests. */
export function attachCspGuard(page: Page): CspGuardHandle {
  const cspConsoleErrors: string[] = [];
  const remoteRequestUrls: string[] = [];

  const onConsole = (message: ConsoleMessage): void => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (isCspConsoleError(text)) {
      cspConsoleErrors.push(text);
    }
  };

  const onRequest = (request: Request): void => {
    try {
      const parsed = new URL(request.url());
      if (parsed.protocol === 'vscode:') {
        return;
      }
      const { hostname } = parsed;
      if (!isLocalServeHost(hostname)) {
        remoteRequestUrls.push(request.url());
      }
    } catch {
      // Non-URL requests are ignored.
    }
  };

  page.on('console', onConsole);
  page.on('request', onRequest);

  return {
    snapshot(): CspGuardSnapshot {
      return {
        policyViolations: [],
        cspConsoleErrors: [...cspConsoleErrors],
        remoteRequestUrls: [...remoteRequestUrls],
      };
    },
    async assertClean(): Promise<void> {
      const browserViolations = await page.evaluate(
        () => (window as { __gavetaCspViolations?: string[] }).__gavetaCspViolations ?? [],
      );
      const blockingViolations = browserViolations.filter(
        (entry) => !entry.startsWith('style-src-attr:'),
      );
      if (blockingViolations.length > 0) {
        throw new Error(`CSP securitypolicyviolation events: ${blockingViolations.join('; ')}`);
      }
      if (cspConsoleErrors.length > 0) {
        throw new Error(`CSP console errors: ${cspConsoleErrors.join('; ')}`);
      }
      if (remoteRequestUrls.length > 0) {
        throw new Error(`Remote requests: ${remoteRequestUrls.join('; ')}`);
      }
    },
  };
}
