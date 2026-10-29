interface PrintWindowOptions {
  title: string;
  css: string;
  build: (doc: Document) => Array<Node | null | undefined>;
}

// The print popups used to be assembled by pasting names and codes into an HTML string, so
// a member called `<img onerror=…>` ran code inside a window that carries the admin's
// session. Everything is built with DOM nodes now, and text goes through textContent.
export function openPrintWindow({ title, css, build }: PrintWindowOptions): Window | null {
  const win = window.open('', '_blank');
  if (!win || !win.document) return null;

  const doc = win.document;
  if (!doc.head || !doc.body) {
    win.close();
    return null;
  }

  doc.documentElement.setAttribute('dir', 'rtl');
  doc.documentElement.setAttribute('lang', 'ar');

  const titleEl = doc.createElement('title');
  titleEl.textContent = title;
  doc.head.appendChild(titleEl);

  const styleEl = doc.createElement('style');
  styleEl.textContent = css;
  doc.head.appendChild(styleEl);

  for (const node of build(doc)) {
    if (node) doc.body.appendChild(node);
  }

  return win;
}

export function elementText(doc: Document, tag: string, className: string, text: string): HTMLElement {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}
