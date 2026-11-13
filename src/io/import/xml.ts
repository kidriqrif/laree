/** Small XML reader that works in a worker (no DOMParser). Names are local names; namespaces are ignored. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function safeChar(cp: number, fallback: string): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e.startsWith('#x')) return safeChar(parseInt(e.slice(2), 16), m);
    if (e.startsWith('#')) return safeChar(parseInt(e.slice(1), 10), m);
    return ENTITIES[e] ?? m;
  });
}

export function localName(qname: string): string {
  const i = qname.indexOf(':');
  return i < 0 ? qname : qname.slice(i + 1);
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out[localName(m[1] ?? '')] = decodeEntities(m[2] ?? m[3] ?? '');
  }
  return out;
}

/** Parses a document and returns the root element, or null when there is none. Throws on unbalanced tags. */
export function parseXml(text: string): XmlNode | null {
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i);
    const top = stack[stack.length - 1] as XmlNode;
    if (lt < 0) {
      top.text += decodeEntities(text.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const e = text.indexOf('-->', lt + 4);
      if (e < 0) throw new Error('unterminated comment');
      i = e + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const e = text.indexOf(']]>', lt + 9);
      if (e < 0) throw new Error('unterminated CDATA');
      top.text += text.slice(lt + 9, e);
      i = e + 3;
    } else if (text.startsWith('<?', lt)) {
      const e = text.indexOf('?>', lt + 2);
      if (e < 0) throw new Error('unterminated instruction');
      i = e + 2;
    } else if (text.startsWith('<!', lt)) {
      // DOCTYPE: skipped, honouring an internal subset in brackets. Never fetched.
      let depth = 0;
      let j = lt + 2;
      for (; j < n; j++) {
        const c = text[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (text[lt + 1] === '/') {
      const e = text.indexOf('>', lt);
      if (e < 0) throw new Error('unterminated tag');
      if (stack.length < 2) throw new Error('unbalanced tags');
      stack.pop();
      i = e + 1;
    } else {
      let j = lt + 1;
      let quote = '';
      for (; j < n; j++) {
        const c = text[j] as string;
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
      }
      if (j >= n) throw new Error('unterminated tag');
      let inner = text.slice(lt + 1, j);
      const selfClose = inner.endsWith('/');
      if (selfClose) inner = inner.slice(0, -1);
      const sp = inner.search(/\s/);
      const qname = sp < 0 ? inner : inner.slice(0, sp);
      const node: XmlNode = { name: localName(qname), attrs: sp < 0 ? {} : parseAttrs(inner.slice(sp)), children: [], text: '' };
      top.children.push(node);
      if (!selfClose) stack.push(node);
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new Error('unclosed tags');
  return root.children[0] ?? null;
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

export function childrenNamed(node: XmlNode | undefined, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name) : [];
}

export function textOf(node: XmlNode | undefined): string | undefined {
  if (!node) return undefined;
  const t = node.text.trim();
  return t === '' ? undefined : t;
}

export function numOf(node: XmlNode | undefined): number | undefined {
  const t = textOf(node);
  if (t === undefined) return undefined;
  const v = Number(t);
  return Number.isFinite(v) ? v : undefined;
}

/** First descendant (breadth-first) whose local name is in `names` (compared in lower case). */
export function findDeep(node: XmlNode | undefined, names: string[]): XmlNode | undefined {
  if (!node) return undefined;
  const wanted = names.map((s) => s.toLowerCase());
  const queue: XmlNode[] = [...node.children];
  while (queue.length) {
    const c = queue.shift() as XmlNode;
    if (wanted.includes(c.name.toLowerCase())) return c;
    queue.push(...c.children);
  }
  return undefined;
}
