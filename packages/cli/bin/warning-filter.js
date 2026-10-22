/**
 * Swallow known Node ExperimentalWarnings before any TypeScript loads.
 * The CLI contract requires empty stderr on success (--json and human).
 */

const SQLITE_EXPERIMENTAL = 'SQLite is an experimental feature and might change at any time';

function isKnownExperimentalWarning(value) {
  if (!(value instanceof Error) || value.name !== 'ExperimentalWarning') {
    return false;
  }
  const message = value.message;
  if (message.includes(SQLITE_EXPERIMENTAL)) {
    return true;
  }
  if (message.includes('--experimental-strip-types')) {
    return true;
  }
  if (message.includes('Type Stripping is an experimental feature')) {
    return true;
  }
  return false;
}

let installed = false;

export function installKnownExperimentalWarningFilter() {
  if (installed) {
    return;
  }
  installed = true;
  const original = process.emit.bind(process);
  process.emit = function (event, ...args) {
    if (event === 'warning' && isKnownExperimentalWarning(args[0])) {
      return false;
    }
    return Reflect.apply(original, this, [event, ...args]);
  };
}

installKnownExperimentalWarningFilter();
