import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number;
}

function run(args: readonly string[], cwd: string): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

it('importa un documento y un artefacto React con --source claude', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-e2e-claude-'));
  try {
    expect(run(['init', '--json'], directory).status).toBe(0);

    copyFileSync(join(root, 'fixtures/claude/doc.html'), join(directory, 'claude-doc.html'));
    copyFileSync(
      join(root, 'fixtures/claude/react-app.html'),
      join(directory, 'claude-react.html'),
    );

    const doc = run(['adopt', 'claude-doc.html', '--source', 'claude', '--json'], directory);
    expect(doc.status).toBe(0);
    expect(doc.stderr).toBe('');
    const docBody = JSON.parse(doc.stdout) as { data: { type: string } };
    expect(docBody.data.type).toBe('doc');

    const react = run(
      ['adopt', 'claude-react.html', '--source', 'claude', '--allow-cdn', '--json'],
      directory,
    );
    expect(react.status).toBe(0);
    const reactBody = JSON.parse(react.stdout) as { data: { type: string } };
    expect(reactBody.data.type).toBe('artifact');

    const html = readFileSync(join(directory, 'claude-react.html'), 'utf8');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).toContain('gaveta:artifact-cdn');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
