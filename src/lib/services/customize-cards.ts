/**
 * lib/services/customize-cards.ts - how the Customize Site page lays out the
 * modules. Each card comes from the module manifests, so a new module shows up
 * without touching the page.
 */

/** Modules sharing a `card` name go on one card, placed where the first one falls. */
export function moduleCards<T extends { card: string | null }>(
  modules: T[],
): { title: string | null; modules: T[] }[] {
  const cards: { title: string | null; modules: T[] }[] = [];
  for (const module of modules) {
    const shared = module.card
      ? cards.find((card) => card.title === module.card)
      : undefined;
    if (shared) shared.modules.push(module);
    else cards.push({ title: module.card, modules: [module] });
  }
  return cards;
}

/** A module's options split by `group`, in manifest order. */
export function optionGroups<T extends { group: string | null }>(
  options: T[],
): { title: string; options: T[] }[] {
  const groups: { title: string; options: T[] }[] = [];
  for (const option of options) {
    if (!option.group) continue;
    const group = groups.find((g) => g.title === option.group);
    if (group) group.options.push(option);
    else groups.push({ title: option.group, options: [option] });
  }
  return groups;
}

/**
 * Why a label can't be used, or null when it can. These land inside quoted
 * strings in the site's JS and HTML. Matches text_fits in modules.rs, which
 * ignores a bad value that reached the config some other way.
 */
export function labelProblem(text: string): string | null {
  if (!text.trim()) return "It can't be empty.";
  if (/["`\\$<>\r\n]/.test(text)) {
    return 'It can\'t contain " ` \\ $ < or >.';
  }
  return null;
}
