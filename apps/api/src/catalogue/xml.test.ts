import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { streamElements, textOf, type XmlNode } from './xml.js';

async function collect(chunks: (string | Buffer)[], name: string): Promise<XmlNode[]> {
  const found: XmlNode[] = [];
  await streamElements(Readable.from(chunks), name, (node) => {
    found.push(node);
  });
  return found;
}

describe('streamElements', () => {
  it('yields each wanted element as a small tree, skipping everything around it', async () => {
    const found = await collect(
      [
        '<root><skip>x</skip><item id="1"><name>One</name></item><item id="2"><name>Two</name></item></root>',
      ],
      'item',
    );
    expect(found.map((n) => [n.attributes.id, textOf(n, 'name')])).toEqual([
      ['1', 'One'],
      ['2', 'Two'],
    ]);
  });

  it('keeps accented text whole when a chunk boundary splits a character', async () => {
    const bytes = Buffer.from('<r><item><name>Café Señal</name></item></r>', 'utf8');
    // Split inside the two-byte "é".
    const cut = bytes.indexOf(Buffer.from('é', 'utf8')) + 1;
    const found = await collect([bytes.subarray(0, cut), bytes.subarray(cut)], 'item');
    expect(textOf(found[0], 'name')).toBe('Café Señal');
  });
});
