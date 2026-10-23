/** Strip HTML so backlink context never renders as markup (REQ-APP-01 / injection safety). */
export function plainTextFromContext(value: string): string {
  const text = stripBlockedElements(value);
  let out = '';
  let index = 0;
  while (index < text.length) {
    const lt = text.indexOf('<', index);
    if (lt === -1) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, lt);
    const gt = text.indexOf('>', lt + 1);
    if (gt === -1) {
      out += text.slice(lt);
      break;
    }
    index = gt + 1;
  }
  return out.replace(/\s+/gu, ' ').trim();
}

function stripBlockedElements(value: string): string {
  let text = value;
  for (const tag of ['script', 'style']) {
    const open = `<${tag}`;
    let search = 0;
    while (search < text.length) {
      const start = text.toLowerCase().indexOf(open, search);
      if (start === -1) {
        break;
      }
      const close = text.toLowerCase().indexOf(`</${tag}>`, start);
      if (close === -1) {
        text = text.slice(0, start);
        break;
      }
      const end = close + `</${tag}>`.length;
      text = text.slice(0, start) + text.slice(end);
      search = start;
    }
  }
  return text;
}
