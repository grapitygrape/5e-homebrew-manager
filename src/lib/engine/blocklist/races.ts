/**
 * engine/blocklist/races.ts — the race/subrace flattening 5etools does on load.
 *
 * INTENT
 *   Races are the one content type whose blocklist identity doesn't match the
 *   shape on disk. 5etools' Races page (and therefore its blocklist) doesn't
 *   list `race` and `subrace` separately: it merges every subrace into a
 *   synthetic race named "Race (Subrace)" and blocks *that*. Which is why real
 *   blocklists are full of `race` rules like `gnome%20(forest)_phb` and
 *   `dwarf%20(duergar)_mtf` — hashes with no matching entity anywhere in
 *   `races.json`.
 *
 *   Without this, every such rule looks broken and a repair pass would happily
 *   "fix" correct rules into wrong ones. Ported from `Renderer.race.mergeSubraces`
 *   / `_getMergedSubrace` / `adoptSubraces`. Pure.
 *
 * THE THREE RULES THAT MATTER
 *   1. Merged name is `Race (Subrace)`, except when the race name already ends
 *      in brackets, where the parts join inside them: `Gnome (Mark of Scribing)`
 *      + `Variant` → `Gnome (Mark of Scribing; Variant)`.
 *   2. The merged entity takes the SUBRACE's source (`Object.assign(cpy, cpySr)`),
 *      which is how a PHB dwarf yields an MTF `dwarf%20(duergar)_mtf`.
 *   3. The base race stays in the list, and is renamed `Race (Base)` only when
 *      one of its subraces is unnamed.
 */

export interface RawSubrace {
  name?: string;
  source?: string;
  /** Set on standalone `subrace` records that name their parent. */
  raceName?: string;
  raceSource?: string;
}

export interface RawRace {
  name?: string;
  source?: string;
  subraces?: RawSubrace[];
}

/**
 * One entry as the Races page presents it. The index signature is deliberate:
 * these go straight into `entityHash`, which takes a loose entity.
 */
export interface FlatRace {
  name: string;
  source: string;
  [key: string]: unknown;
}

/** Parent → flattened-subrace edge emitted alongside `flattenRacesWithParents`. */
export interface FlatRaceChildLink {
  parent: FlatRace;
  child: FlatRace;
}

export interface FlattenedRacesResult {
  races: FlatRace[];
  /** Each merged "Race (Subrace)" linked back to its base `FlatRace`. */
  links: FlatRaceChildLink[];
}

/** 5etools `Renderer.race.getSubraceName`. */
export function getSubraceName(
  raceName: string,
  subraceName: string | undefined,
): string {
  if (!subraceName) return raceName;
  const brackets = /^(.*?)(\(.*?\))$/i.exec(raceName || '');
  if (!brackets) return `${raceName} (${subraceName})`;
  const inner = brackets[2].slice(1, -1);
  return `${brackets[1]}(${[inner, subraceName].join('; ')})`;
}

const raceKey = (name: string, source: string): string =>
  `${name.toLowerCase()}|${source.toLowerCase()}`;

/**
 * Expand races + standalone subraces into the flat list 5etools blocks against,
 * keeping each merged subrace's link back to its base race. Subraces whose
 * parent race isn't present are dropped, as 5etools' `adoptSubraces` does.
 */
export function flattenRacesWithParents(
  races: RawRace[],
  subraces: RawSubrace[] = [],
): FlattenedRacesResult {
  const parents = new Map<string, { race: RawRace; subs: RawSubrace[] }>();
  for (const race of races) {
    if (!race?.name || !race.source) continue;
    const key = raceKey(race.name, race.source);
    if (parents.has(key)) continue; // first load wins, as 5etools does
    parents.set(key, { race, subs: [...(race.subraces ?? [])] });
  }

  // Adopt standalone `subrace` records into their declared parent.
  for (const sr of subraces) {
    if (!sr?.raceName || !sr.raceSource) continue;
    const parent = parents.get(raceKey(sr.raceName, sr.raceSource));
    if (!parent) continue;
    const dupe = parent.subs.some(
      (s) =>
        (s.name ?? '').toLowerCase() === (sr.name ?? '').toLowerCase() &&
        (s.source ?? '').toLowerCase() === (sr.source ?? '').toLowerCase(),
    );
    if (!dupe) parent.subs.push(sr);
  }

  const out: FlatRace[] = [];
  const links: FlatRaceChildLink[] = [];
  for (const { race, subs } of parents.values()) {
    const name = race.name as string;
    const source = race.source as string;

    if (!subs.length) {
      out.push({ name, source });
      continue;
    }

    // The base race survives; it's only renamed when an unnamed subrace exists.
    const anyUnnamed = subs.some((s) => !s.name);
    const base: FlatRace = { name: anyUnnamed ? `${name} (Base)` : name, source };
    out.push(base);

    for (const sr of subs) {
      const child: FlatRace = {
        name: getSubraceName(name, sr.name),
        source: sr.source || source,
      };
      out.push(child);
      links.push({ parent: base, child });
    }
  }
  return { races: out, links };
}

/**
 * Expand races + standalone subraces into the flat list 5etools blocks against.
 * Subraces whose parent race isn't present are dropped, exactly as 5etools'
 * `adoptSubraces` would refuse them.
 */
export function flattenRaces(
  races: RawRace[],
  subraces: RawSubrace[] = [],
): FlatRace[] {
  return flattenRacesWithParents(races, subraces).races;
}
