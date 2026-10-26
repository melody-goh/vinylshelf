/**
 * Streams elements out of a very large XML document (the Discogs dumps: 10.5 GB of
 * releases) without ever holding the document: each element named `name` is built into
 * a small tree, handed to `onElement`, and dropped.
 */
import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { SaxesParser } from 'saxes';

/** One XML element as a plain tree: attributes, child elements and its own text. */
export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

/** The first child called `name`, if any. */
export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((c) => c.name === name);
}

/** Every child called `name`. */
export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((c) => c.name === name) ?? [];
}

/** The trimmed text of the first child called `name`, or "" when there is none. */
export function textOf(node: XmlNode | undefined, name: string): string {
  return child(node, name)?.text.trim() ?? '';
}

/**
 * Calls `onElement` for every element called `name`, in document order. Resolves once
 * the stream ends. `onElement` may be async; the stream is paused until it settles, so
 * a slow consumer (writing to disk) never lets the parsed backlog grow.
 */
export async function streamElements(
  input: Readable,
  name: string,
  onElement: (node: XmlNode) => void | Promise<void>,
): Promise<void> {
  const parser = new SaxesParser();
  /** The element being built, outermost first; empty outside the elements we want. */
  const open: XmlNode[] = [];
  const ready: XmlNode[] = [];

  parser.on('opentag', (tag) => {
    if (open.length === 0 && tag.name !== name) return;
    const node: XmlNode = {
      name: tag.name,
      attributes: tag.attributes,
      children: [],
      text: '',
    };
    open.at(-1)?.children.push(node);
    open.push(node);
  });
  parser.on('text', (text) => {
    const node = open.at(-1);
    if (node) node.text += text;
  });
  parser.on('closetag', () => {
    const node = open.pop();
    if (node && open.length === 0) ready.push(node);
  });

  // A chunk boundary can split a multi-byte character (the dumps are full of accented
  // names); the decoder carries the partial bytes into the next chunk.
  const decoder = new StringDecoder('utf8');
  for await (const chunk of input) {
    parser.write(typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer));
    while (ready.length > 0) {
      const node = ready.shift();
      if (node) await onElement(node);
    }
  }
  parser.write(decoder.end());
  parser.close();
  for (const node of ready) await onElement(node);
}
