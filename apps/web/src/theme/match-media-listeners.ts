type MediaQueryListLike = Pick<
  MediaQueryList,
  'matches' | 'addEventListener' | 'removeEventListener'
>;

export function subscribePrefersDarkScheme(onChange: () => void): (() => void) | null {
  if (typeof window.matchMedia !== 'function') {
    return null;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)') as MediaQueryListLike;
  media.addEventListener('change', onChange);
  return () => {
    media.removeEventListener('change', onChange);
  };
}

export function readPrefersDarkScheme(): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
