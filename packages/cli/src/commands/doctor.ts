import {
  EXIT_CODES,
  GavetaError,
  doctorVault,
  type DoctorFinding,
  type DoctorFix,
} from '@gaveta/core';
import type { CommandResult, CommandSpec } from '../types.ts';

interface FindingView {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly path: string;
  readonly details: Readonly<Record<string, string | number>> | null;
}

interface FixView {
  readonly path: string;
  readonly codes: readonly string[];
}

export const doctorCommand: CommandSpec = {
  name: 'doctor',
  summary: 'Revisa enlaces rotos, pendientes, huérfanas, ids duplicados y notas inválidas.',
  example: 'gaveta doctor --json',
  requiresVault: true,
  input: 'none',
  options: [
    {
      name: 'fix',
      flags: '--fix',
      description: 'Repara href desfasados y rutas del tema de forma determinista.',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const report = await doctorVault(context.vault.root, {
      fix: context.options.fix === 'true',
      strictRel: context.strictRel,
    });
    const data = {
      ok: report.ok,
      findings: report.findings.map(presentFinding),
      fixed: report.fixed.map(presentFix),
    };
    const result: CommandResult = {
      data,
      human: renderHuman(report.findings, report.fixed),
    };
    if (!report.ok) {
      return { ...result, exitCode: EXIT_CODES.validation };
    }
    return result;
  },
};

function presentFinding(finding: DoctorFinding): FindingView {
  return {
    code: finding.code,
    message: finding.message,
    hint: finding.hint,
    path: finding.path,
    details: finding.details,
  };
}

function presentFix(fix: DoctorFix): FixView {
  return {
    path: fix.path,
    codes: [...fix.codes],
  };
}

function renderHuman(findings: readonly DoctorFinding[], fixed: readonly DoctorFix[]): string {
  const lines: string[] = [];
  for (const finding of findings) {
    const detail =
      finding.details === null
        ? ''
        : ` ${Object.entries(finding.details)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join(' ')}`;
    lines.push(`${finding.path}: ${finding.code}: ${finding.message}${detail}`);
  }
  for (const change of fixed) {
    lines.push(`Reparado ${change.path} (${change.codes.join(', ')})`);
  }
  if (findings.length === 0 && fixed.length === 0) {
    return 'Sin hallazgos.\n';
  }
  if (findings.length === 0) {
    return `${lines.join('\n')}\n`;
  }
  return `${lines.join('\n')}\n`;
}
