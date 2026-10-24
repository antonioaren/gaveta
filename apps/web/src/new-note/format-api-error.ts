import { ApiError } from '../api/client.ts';

const CODE_MESSAGES: Readonly<Record<string, string>> = {
  E_ARG_INVALID: 'Revisa el título, el tipo, la carpeta o las etiquetas.',
  E_PATH_EXISTS: 'Ya existe una nota con ese nombre en la carpeta elegida.',
  E_ID_DUPLICATE: 'El identificador de la nota ya está en uso.',
  E_HTML_INVALID: 'El contenido de la nota no es válido.',
  E_IF_MATCH_REQUIRED: 'Falta la cabecera de concurrencia.',
  E_CONFLICT: 'La nota cambió mientras creabas; inténtalo de nuevo.',
  E_AUTH_REQUIRED: 'La sesión expiró; vuelve a abrir la app.',
};

export function formatApiError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.message.length > 0 && caught.message !== 'Error de la API') {
      return caught.message;
    }
    return CODE_MESSAGES[caught.code] ?? `Error (${caught.code})`;
  }
  if (caught instanceof Error && caught.message.length > 0) {
    return caught.message;
  }
  return 'No se pudo crear la nota.';
}
