import '@testing-library/jest-dom/vitest';
import { WEB_LOCALE_STORAGE_KEY } from '@gaveta/i18n';

try {
  localStorage.setItem(WEB_LOCALE_STORAGE_KEY, 'es');
} catch {
  // node environment without localStorage
}
