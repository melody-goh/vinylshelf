/**
 * Per-master version and vinyl counts for pass 1 (ADR 0012). There are about 2.6 million
 * masters, so the counts live in typed arrays indexed by master id (a few tens of MB)
 * rather than a Map of objects (hundreds).
 */

const INITIAL_SIZE = 1 << 20;

export class MasterCounts {
  private versions = new Uint32Array(INITIAL_SIZE);
  private vinyl = new Uint32Array(INITIAL_SIZE);

  add(masterId: number, isVinyl: boolean): void {
    if (masterId <= 0) return;
    this.ensure(masterId);
    this.versions[masterId] = (this.versions[masterId] ?? 0) + 1;
    if (isVinyl) this.vinyl[masterId] = (this.vinyl[masterId] ?? 0) + 1;
  }

  versionsOf(masterId: number): number {
    return this.versions[masterId] ?? 0;
  }

  vinylOf(masterId: number): number {
    return this.vinyl[masterId] ?? 0;
  }

  /** Every master with at least one vinyl version, as [id, versions, vinylVersions]. */
  *withVinyl(): Generator<[number, number, number]> {
    for (let id = 1; id < this.vinyl.length; id++) {
      const vinyl = this.vinyl[id] ?? 0;
      if (vinyl > 0) yield [id, this.versions[id] ?? 0, vinyl];
    }
  }

  private ensure(masterId: number): void {
    if (masterId < this.versions.length) return;
    let size = this.versions.length;
    while (size <= masterId) size *= 2;
    const grow = (from: Uint32Array) => {
      const next = new Uint32Array(size);
      next.set(from);
      return next;
    };
    this.versions = grow(this.versions);
    this.vinyl = grow(this.vinyl);
  }
}

/**
 * The catalogue's masters: those with a vinyl version, most versions first (how often a
 * record has been pressed and reissued is the dumps' best notability signal, ADR 0008),
 * ties broken by id so the same dump always gives the same catalogue.
 */
export function selectMasters(
  counts: MasterCounts,
  cap: number,
): Map<number, { versions: number; vinylVersions: number }> {
  const candidates = [...counts.withVinyl()];
  candidates.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return new Map(
    candidates
      .slice(0, cap)
      .map(([id, versions, vinylVersions]) => [id, { versions, vinylVersions }]),
  );
}
