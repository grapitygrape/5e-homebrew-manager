/**
 * engine/render/index.ts — turn a resolved entity into a display sheet, plus the
 * inline-tag / entry / value formatting it builds on. Pure; shared verbatim by the
 * SvelteKit server and the browser preview so both emit identical HTML.
 */
export { parseInlineTags, stripInlineTags, withTagIssues } from './tags.ts';
export type { TagIssueInfo } from './tags.ts';
export { renderEntry } from './entries.ts';
export {
  capitalize,
  formatValue,
  formatProfList,
  formatResistList,
  formatSenses,
  formatAbilityObj,
  translatePrerequisites,
  translateAbilityIncreases,
} from './format.ts';
export { translateEntity } from './translate.ts';
