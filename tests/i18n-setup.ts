import { setActiveLocale } from '@gaveta/i18n';

// Most unit tests were written against Spanish CLI and diagnostic copy.
process.env.GAVETA_LANG = 'es';
setActiveLocale('es');
