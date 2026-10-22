/**
 * `node:sqlite` is still experimental on Node 22 and emits ExperimentalWarning
 * the first time a database is constructed. Node prints that warning to stderr
 * from the default `warning` listener. The CLI contract requires `--json`
 * stderr to stay empty, so the event is swallowed before it is constructed.
 * Other warnings are left alone.
 */

const SQLITE_EXPERIMENTAL_WARNING =
  'SQLite is an experimental feature and might change at any time';

let installed = false;

export function silenceSqliteExperimentalWarning(): void {
  if (installed) {
    return;
  }
  installed = true;
  const original = process.emit.bind(process);
  process.emit = function (
    this: NodeJS.Process,
    event: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (event === 'warning' && isSqliteExperimentalWarning(args[0])) {
      return false;
    }
    return Reflect.apply(original, this, [event, ...args]) as boolean;
  } as typeof process.emit;
}

function isSqliteExperimentalWarning(value: unknown): boolean {
  return (
    value instanceof Error &&
    value.name === 'ExperimentalWarning' &&
    value.message.includes(SQLITE_EXPERIMENTAL_WARNING)
  );
}

silenceSqliteExperimentalWarning();
