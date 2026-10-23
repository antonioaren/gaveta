import type { FastifyReply } from 'fastify';

const SHARED_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cross-origin-resource-policy': 'same-origin',
};

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  ...SHARED_HEADERS,
  'content-security-policy': "frame-ancestors 'none'",
};

/** CSP for the React shell (REQ-SEC-06): no remote origins. */
export const APP_SHELL_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'; frame-src 'self'; frame-ancestors 'none'";

export const APP_SHELL_HEADERS: Readonly<Record<string, string>> = {
  ...SHARED_HEADERS,
  'content-security-policy': APP_SHELL_CSP,
};

/** Opaque-origin sandboxed iframes (allow-scripts, no allow-same-origin) must load render subresources. */
const RENDER_TRANSPORT_HEADERS: Readonly<Record<string, string>> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'cross-origin',
  'content-security-policy': "frame-ancestors 'self'",
};

export function applySecurityHeaders(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    reply.header(name, value);
  }
}

export function applyAppShellHeaders(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(APP_SHELL_HEADERS)) {
    reply.header(name, value);
  }
}

export function applyRenderTransportHeaders(reply: FastifyReply): void {
  for (const [name, value] of Object.entries(RENDER_TRANSPORT_HEADERS)) {
    if (
      name === 'content-security-policy' &&
      reply.getHeader('content-security-policy') !== undefined
    ) {
      continue;
    }
    reply.header(name, value);
  }
}
