export type DiffLineKind = 'context' | 'remove' | 'add';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  return text.split('\n');
}

/** Line-based diff for merge view (no external dependency). */
export function diffLines(left: string, right: string): DiffLine[] {
  const a = splitLines(left);
  const b = splitLines(right);
  const lcs = buildLcsTable(a, b);
  const rows: DiffLine[] = [];
  let i = a.length;
  let j = b.length;
  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push({ kind: 'context', text: a[i - 1] ?? '' });
      i -= 1;
      j -= 1;
      continue;
    }
    const left = lcs[i]?.[j - 1] ?? 0;
    const up = lcs[i - 1]?.[j] ?? 0;
    if (j > 0 && (i === 0 || left >= up)) {
      stack.push({ kind: 'add', text: b[j - 1] ?? '' });
      j -= 1;
      continue;
    }
    if (i > 0) {
      stack.push({ kind: 'remove', text: a[i - 1] ?? '' });
      i -= 1;
    }
  }
  while (stack.length > 0) {
    const row = stack.pop();
    if (row !== undefined) {
      rows.push(row);
    }
  }
  return rows;
}

function buildLcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const row = table[i];
      if (row === undefined) {
        continue;
      }
      if (a[i - 1] === b[j - 1]) {
        row[j] = (table[i - 1]?.[j - 1] ?? 0) + 1;
      } else {
        row[j] = Math.max(table[i - 1]?.[j] ?? 0, table[i]?.[j - 1] ?? 0);
      }
    }
  }
  return table;
}
