import {
  EXIT_CODES,
  GavetaError,
  readVaultConfig,
  readVaultText,
  resolveRef,
  scanNoteFiles,
  validateNote,
  validateVault,
  type NoteDiagnostic,
  type ValidateVaultOptions,
  type VaultNoteSource,
  openVaultIndex,
} from '@gaveta/core';
import { CliFailure } from '../failure.ts';
import { presentDiagnostic, renderDiagnosticLine, type DiagnosticView } from './diagnostics.ts';
import type { CommandResult, CommandSpec } from '../types.ts';
import { hm } from '../messages.ts';

const BOTH_TARGETS = 'cli.auto.indica_una_referencia_o_all_no_ambos';

interface ValidateFileView {
  readonly path: string | null;
  readonly ok: boolean;
  readonly diagnostics: readonly DiagnosticView[];
}

export const validateCommand: CommandSpec = {
  name: 'validate',
  summary: 'cli.auto.valida_una_nota_el_vault_entero_o_html_de_stdin_',
  example: 'gaveta validate nota.html --json',
  requiresVault: true,
  input: 'optional',
  args: [{ name: 'ref', description: 'cli.auto.id_ruta_o_titulo_de_la_nota', required: false }],
  options: [
    {
      name: 'all',
      flags: '--all',
      description: 'cli.auto.valida_todas_las_notas_del_vault',
      kind: 'boolean',
    },
  ],
  async run(context): Promise<CommandResult> {
    if (context.vault === null) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    const config = await readVaultConfig(context.vault.root);
    const validateOptions: ValidateVaultOptions = {
      remoteAllowlist: config.remoteAllowlist,
      relVocabulary: config.rel.vocabulary,
      strictRel: context.strictRel,
    };
    const ref = context.positionals[0];
    const all = context.options.all === 'true';
    if (all && ref !== undefined) {
      throw new CliFailure('E_ARG_INVALID', {}, { problem: BOTH_TARGETS });
    }
    if (context.input !== null) {
      if (ref !== undefined || all) {
        throw new CliFailure('E_ARG_INVALID', {}, { problem: BOTH_TARGETS });
      }
      return finish(validateInput(context.input.text, validateOptions));
    }
    if (all || ref === undefined) {
      return finish(await validateAllNotes(context.vault.root, validateOptions));
    }
    return finish(await validateRef(context.vault.root, ref, validateOptions));
  },
};

function validateInput(html: string, options: ValidateVaultOptions): ValidateFileView[] {
  const result = validateNote(html, options);
  return [presentFile(null, result.diagnostics, result.ok)];
}

async function validateRef(
  vaultRoot: string,
  ref: string,
  options: ValidateVaultOptions,
): Promise<ValidateFileView[]> {
  const index = await openVaultIndex(vaultRoot);
  try {
    const recovered = index.recovery();
    if (recovered !== null || index.notes().length === 0) {
      await index.rebuild();
    }
    const resolved = resolveRef(index, ref);
    const html = await readVaultText(vaultRoot, resolved.path);
    const result = validateNote(html, { ...options, notePath: resolved.path });
    return [presentFile(resolved.path, result.diagnostics, result.ok)];
  } finally {
    index.close();
  }
}

async function validateAllNotes(
  vaultRoot: string,
  options: ValidateVaultOptions,
): Promise<ValidateFileView[]> {
  const scanned = await scanNoteFiles(vaultRoot);
  const sources: VaultNoteSource[] = [];
  for (const file of scanned.files) {
    sources.push({
      path: file.relativePath,
      html: await readVaultText(vaultRoot, file.relativePath),
    });
  }
  const vault = validateVault(sources, options);
  return vault.files.map((file) => presentFile(file.path, file.result.diagnostics, file.result.ok));
}

function presentFile(
  path: string | null,
  diagnostics: readonly NoteDiagnostic[],
  ok: boolean,
): ValidateFileView {
  return {
    path,
    ok,
    diagnostics: diagnostics.map(presentDiagnostic),
  };
}

function finish(files: readonly ValidateFileView[]): CommandResult {
  const ok = files.every((file) => file.ok);
  const human = renderHuman(files);
  const result: CommandResult = {
    data: { ok, files },
    human,
  };
  if (!ok) {
    return { ...result, exitCode: EXIT_CODES.validation };
  }
  return result;
}

function renderHuman(files: readonly ValidateFileView[]): string {
  if (files.length === 0) {
    return hm('cli.human.validate.none');
  }
  const lines: string[] = [];
  for (const file of files) {
    if (file.diagnostics.length === 0) {
      lines.push(
        file.path === null
          ? hm('cli.human.validate.vault_ok')
          : hm('cli.human.validate.file_ok', { path: file.path }),
      );
      continue;
    }
    for (const diagnostic of file.diagnostics) {
      lines.push(renderDiagnosticLine(diagnostic, file.path ?? undefined));
    }
  }
  if (files.every((file) => file.ok)) {
    lines.push(hm('cli.human.validate.all_ok'));
  }
  return `${lines.join('\n')}\n`;
}
