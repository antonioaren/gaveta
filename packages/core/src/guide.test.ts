import { describe, expect, it } from 'vitest';
import {
  BODY_ELEMENTS,
  COMPONENTS,
  LINKS,
  NOTE_TYPES,
  NOTE_TYPE_STRUCTURES,
  SUGGESTED_REL,
} from './contract.ts';
import { diagnosticCodes } from './errors.ts';
import { GUIDE_TOPICS, buildGuide, isGuideTopic, type GuideCommandEntry } from './guide.ts';
import { validateNote } from './validate.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';

const SAMPLE_COMMANDS: GuideCommandEntry[] = [
  { name: 'version', summary: 'Muestra la versión.', example: 'gaveta version --json' },
  {
    name: 'todo',
    summary: 'Tareas.',
    example: 'gaveta todo add "Tareas" "Texto" --json',
    subcommands: [
      {
        name: 'list',
        summary: 'Lista tareas.',
        example: 'gaveta todo list --open --json',
      },
    ],
  },
];

function shellDoc(body: string, type = 'doc'): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Guía</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="${type}">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
</head>
<body>
${body}
</body>
</html>`;
}

describe('buildGuide', () => {
  it('lists every guide topic and prints the full contract by default', () => {
    const guide = buildGuide({ commands: SAMPLE_COMMANDS });
    expect(guide.topics).toEqual([...GUIDE_TOPICS]);
    expect(guide.human).toContain('Elementos permitidos');
    expect(guide.human).toContain('Componentes');
    expect(guide.human).toContain('Tipos de nota');
    expect(guide.human).toContain('Convenciones de enlace');
    expect(guide.human).toContain('Comandos de la CLI');
    expect(guide.human).toContain('Catálogo de errores y avisos');
    for (const element of BODY_ELEMENTS) {
      expect(guide.human).toContain(`<${element.name}>`);
    }
    for (const type of NOTE_TYPES) {
      expect(guide.human).toContain(type);
    }
    expect(guide.data.diagnostics.length).toBe(diagnosticCodes().length);
  });

  it('filters by topic and supports --errors', () => {
    const tipos = buildGuide({ commands: SAMPLE_COMMANDS, topic: 'tipos' });
    expect(tipos.topics).toEqual(['tipos']);
    expect(tipos.human).toContain('Tipos de nota');
    expect(tipos.human).not.toContain('Catálogo de errores');

    const errores = buildGuide({ commands: SAMPLE_COMMANDS, errorsOnly: true });
    expect(errores.topics).toEqual(['errores']);
    expect(errores.human).toContain('E_ARG_INVALID');
    expect(errores.human).not.toContain('Elementos permitidos');
  });

  it('includes command entries and subcommand examples', () => {
    const guide = buildGuide({ commands: SAMPLE_COMMANDS, topic: 'comandos' });
    expect(guide.human).toContain('gaveta version --json');
    expect(guide.human).toContain('gaveta todo list --open --json');
    expect(guide.data.commands).toEqual(SAMPLE_COMMANDS);
  });

  it('documents link conventions and suggested rel values', () => {
    const guide = buildGuide({ commands: SAMPLE_COMMANDS, topic: 'enlaces' });
    expect(guide.human).toContain(LINKS.canonical.example);
    expect(guide.human).toContain(LINKS.pending.example);
    expect(guide.human).toContain(LINKS.external.example);
    expect(guide.human).toContain('[[Título]]');
    for (const rel of SUGGESTED_REL) {
      expect(guide.human).toContain(rel);
    }
  });

  it('rejects unknown topics', () => {
    expect(() => buildGuide({ commands: SAMPLE_COMMANDS, topic: 'desconocido' })).toThrow(
      /E_ARG_INVALID/,
    );
    expect(isGuideTopic('tipos')).toBe(true);
    expect(isGuideTopic('nope')).toBe(false);
  });
});

describe('guide component examples', () => {
  it('validates every P0 component example inside a doc note', () => {
    for (const component of COMPONENTS) {
      if (component.priority !== 'P0') {
        continue;
      }
      const body = `<article><h1>Ejemplo</h1><section id="cuerpo">${component.example}</section></article>`;
      const result = validateNote(shellDoc(body));
      expect(result.ok, component.id).toBe(true);
    }
  });

  it('validates doc, slides, todo, and dashboard structure examples from the guide', () => {
    const passingTypes = ['doc', 'slides', 'todo', 'dashboard'] as const;
    for (const type of passingTypes) {
      const structure = NOTE_TYPE_STRUCTURES[type];
      let body: string;
      if (type === 'slides') {
        body = `<article><h1>Deck</h1>${structure.example}</article>`;
      } else if (type === 'todo') {
        body = `<article><h1>Lista</h1>${structure.example}</article>`;
      } else {
        body = `<article><h1>Ejemplo</h1>${structure.example}</article>`;
      }
      const result = validateNote(shellDoc(body, type));
      expect(result.ok, type).toBe(true);
    }
  });
});
