import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

function readJson(relativePath: string): unknown {
  return JSON.parse(read(relativePath)) as unknown;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} is not a string`);
  }
  return value;
}

function listFiles(directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) {
    return [];
  }
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const relative = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

const requiredCheckScript =
  'pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:nfr && pnpm test:coverage && pnpm build:web && pnpm test:e2e && pnpm audit --audit-level=high';

describe('T0.3 local check', () => {
  it('runs the same format, lint, typecheck, coverage, e2e, and audit steps as CI', () => {
    const manifest = asRecord(readJson('package.json'), 'package.json');
    const scripts = asRecord(manifest.scripts, 'package.json scripts');
    expect(asString(scripts.check, 'scripts.check')).toBe(requiredCheckScript);
    expect(asString(scripts['test:coverage'], 'scripts.test:coverage')).toContain('--coverage');
    expect(asString(scripts['test:e2e'], 'scripts.test:e2e')).toContain('vitest.e2e.config.ts');
    const engines = asRecord(manifest.engines, 'package.json engines');
    expect(engines.node).toBe('>=22.18.0');
    const devDependencies = asRecord(manifest.devDependencies, 'package.json devDependencies');
    expect(devDependencies['@vitest/coverage-v8']).toBeTruthy();
  });

  it('enforces a lines coverage threshold of at least 80% for packages/core', () => {
    const config = read('vitest.config.ts');
    expect(config).toContain('packages/core/src/**/*.ts');
    const match = /lines:\s*(\d+)/.exec(config);
    const raw = match?.[1];
    if (raw === undefined) {
      throw new Error('vitest coverage lines threshold is missing');
    }
    expect(Number(raw)).toBeGreaterThanOrEqual(80);
  });
});

describe('T0.3 CI workflows', () => {
  it('runs format, lint, typecheck, unit coverage, and e2e on Linux and macOS', () => {
    const ci = read('.github/workflows/ci.yml');
    const setup = read('.github/actions/setup/action.yml');
    const pipeline = `${ci}\n${setup}`;

    expect(ci).toContain('ubuntu-latest');
    expect(ci).toContain('macos-latest');
    expect(ci).not.toContain('windows-latest');
    expect(ci).toContain('cancel-in-progress: true');
    expect(ci).toContain('contents: read');
    for (const command of [
      'pnpm format:check',
      'pnpm lint',
      'pnpm typecheck',
      'pnpm test:coverage',
      'pnpm build:web',
      'pnpm test:e2e',
      'pnpm audit --audit-level=high',
    ]) {
      expect(ci).toContain(command);
    }
    expect(setup).toContain('node-version-file: .nvmrc');
    expect(setup).toContain('cache: pnpm');
    expect(read('.nvmrc').trim()).toBe('22.18.0');
    expect(ci).toContain('unit (node-min)');
    expect(ci).toContain('e2e (node-min)');
    expect(ci).toContain("node-version: '22.18.0'");
    expect(pipeline).toContain('pnpm install --frozen-lockfile');
    expect(pipeline).not.toContain('pull_request_target');
    expect(pipeline).not.toContain('write-all');
  });

  it('pins third-party actions to major versions', () => {
    const workflowFiles = [
      ...listFiles('.github/workflows'),
      ...listFiles('.github/actions'),
    ].filter((relativePath) => relativePath.endsWith('.yml'));
    expect(workflowFiles.length).toBeGreaterThan(0);

    const usesPattern = /uses:\s*(\S+)/g;
    for (const relativePath of workflowFiles) {
      const content = read(relativePath);
      const uses = [...content.matchAll(usesPattern)].map((match) => match[1]);
      expect(uses.length).toBeGreaterThan(0);
      for (const action of uses) {
        if (action.startsWith('./')) {
          continue;
        }
        expect(action, relativePath).toMatch(/^[\w.-]+\/[\w./-]+@v\d+$/);
      }
    }
  });

  it('scans JavaScript and TypeScript with CodeQL', () => {
    const codeql = read('.github/workflows/codeql.yml');
    expect(codeql).toContain('javascript-typescript');
    expect(codeql).toContain('github/codeql-action/init@v4');
    expect(codeql).toContain('github/codeql-action/analyze@v4');
    expect(codeql).toContain('security-events: write');
    expect(codeql).toContain('cancel-in-progress: true');
    expect(codeql).not.toContain('pull_request_target');
  });

  it('reviews dependencies on pull requests and fails audit on high severity', () => {
    const review = read('.github/workflows/dependency-review.yml');
    expect(review).toContain('pull_request:');
    expect(review).toContain('actions/dependency-review-action@v5');
    expect(review).toContain('contents: read');
    expect(review).toContain('fail-on-severity: high');
    expect(review).not.toContain('pull_request_target');
  });

  it('scans the full git history with gitleaks', () => {
    const secrets = read('.github/workflows/gitleaks.yml');
    expect(secrets).toContain('gitleaks/gitleaks-action@v3');
    expect(secrets).toContain('fetch-depth: 0');
    expect(secrets).toContain('contents: read');
    expect(secrets).not.toContain('pull_request_target');
  });

  it('configures weekly grouped Dependabot updates for npm and GitHub Actions', () => {
    const dependabot = read('.github/dependabot.yml');
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
    expect(dependabot).toContain('interval: weekly');
    expect(dependabot).toContain('groups:');
    expect(dependabot).toContain('patterns:');
  });
});

describe('agent harness', () => {
  it('documents the mandatory workflow, decisions, and learnings log', () => {
    const agents = read('AGENTS.md');
    for (const phrase of [
      'docs/agents/LEARNINGS.md',
      'pnpm check',
      'exactly one',
      'failing tests',
      'Playwright',
      'path traversal',
      'node:sqlite',
      'Spanish',
      'Node >= 22',
      'NFD',
      'T4.8',
    ]) {
      expect(agents, phrase).toContain(phrase);
    }

    for (const relativePath of [
      'docs/agents/LEARNINGS.md',
      '.github/pull_request_template.md',
      '.cursor/rules/workflow.mdc',
      '.cursor/rules/testing.mdc',
      '.cursor/rules/security.mdc',
      '.cursor/rules/typescript.mdc',
    ]) {
      expect(existsSync(join(root, relativePath)), relativePath).toBe(true);
    }

    const learnings = read('docs/agents/LEARNINGS.md');
    expect(learnings).toContain('YYYY-MM-DD');

    const template = read('.github/pull_request_template.md');
    for (const phrase of ['Task id', 'REQ', 'Unit', 'E2E', 'Security', 'pnpm check']) {
      expect(template, phrase).toContain(phrase);
    }

    expect(read('.cursor/rules/security.mdc')).toContain('eval');
    expect(read('.cursor/rules/security.mdc')).toContain('new Function');
    expect(read('.cursor/rules/testing.mdc')).toContain('80');
    expect(read('.cursor/rules/typescript.mdc')).toContain('.ts');
    expect(read('.cursor/rules/workflow.mdc')).toContain('exactly one');
  });
});

describe('owner decisions recorded on 2026-10-22', () => {
  it('amends the stack, slug, CI platform, and language decisions', () => {
    const requirements = read('docs/REQUIREMENTS.md');
    const tasks = read('docs/TASKS.md');

    expect(requirements).toContain('node:sqlite');
    expect(requirements).toContain('NFD');
    expect(requirements).toContain('2026-10-22');
    expect(requirements).toContain('T4.8');
    expect(requirements).not.toContain('Node ≥ 20');
    expect(requirements).toContain('Node ≥ 22');

    expect(tasks).toMatch(/- \[x\] \*\*T0\.3 CI\.\*\*/);
    expect(tasks).toContain('node:sqlite');
    expect(tasks).toContain('Node ≥ 22');
    expect(tasks).toContain('T4.8');
    expect(tasks).not.toContain('better-sqlite3');
    expect(tasks).not.toContain('Aprobar DEC-07');
    expect(tasks).not.toContain('Aprobar DEC-02');
  });
});
