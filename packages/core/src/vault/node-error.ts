export function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const { code } = error;
  return typeof code === 'string' ? code : undefined;
}

export function hasNodeErrorCode(error: unknown, expected: string): boolean {
  return nodeErrorCode(error) === expected;
}
