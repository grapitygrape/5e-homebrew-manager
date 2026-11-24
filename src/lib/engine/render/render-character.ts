/**
 * engine/render/render-character.ts — character-option sheets: feats (and the
 * class/subclass features routed through them), races, backgrounds, classes
 * and subclasses, optional features.
 */
import { parseInlineTags } from './tags.ts';
import { renderEntry } from './entries.ts';
import {
  formatProfList,
  formatSenses,
  translateAbilityIncreases,
  translatePrerequisites,
} from './format.ts';
import { collectProfAndResistRows, row, type Renderer } from './sheet.ts';
import { FEAT_CATEGORIES, FEATURE_TYPES, SIZES } from './tables.ts';

export const renderFeat: Renderer = (entity, { name, source, page }) => {
  // Class and subclass features render as feats (ENTITY_TYPE_OVERRIDES in
  // audit/type-schema.ts); `className` tells them apart.
  if (entity.className !== undefined) {
    const subclass = entity.subclassShortName
      ? ` (${entity.subclassShortName})`
      : '';
    const properties: Record<string, unknown> = {
      parentClass: entity.className,
      level: entity.level,
    };
    if (entity.subclassShortName)
      properties.subclass = entity.subclassShortName;
    const metaRows = [
      row('Class', entity.className),
      row('Level', entity.level),
      ...(entity.subclassShortName
        ? [row('Subclass', entity.subclassShortName)]
        : []),
    ];
    return {
      badgeText: `${entity.className}${subclass} Level ${entity.level}`,
      badgeClass: 'badge-class',
      extraClass: 'class-feature-sheet',
      metaRows,
      body: renderEntry(entity.entries),
      properties,
      textSummary: `${entity.className}${subclass} Feature (Level ${entity.level}). Source: ${source}${page}.`,
    };
  }

  const category = FEAT_CATEGORIES[entity.category as string] || 'Feat';
  const prereqs = translatePrerequisites(entity.prerequisite);
  const asis = translateAbilityIncreases(entity.ability);
  const properties: Record<string, unknown> = {
    category,
    prerequisites: prereqs,
    asi: asis,
  };
  const metaRows: string[] = [];
  if (prereqs !== 'None') metaRows.push(row('Prerequisites', prereqs));
  if (asis !== 'None') metaRows.push(row('Ability Scores', asis));
  if (entity.repeatable) {
    properties.repeatable = true;
    metaRows.push(
      row(
        'Repeatable',
        `Yes${entity.repeatableNote ? ` (Note: ${entity.repeatableNote})` : ''}`,
      ),
    );
  }
  const savingThrows = formatProfList(entity.savingThrowProficiencies as never);
  if (savingThrows) {
    properties.savingThrows = savingThrows;
  }
  metaRows.push(...collectProfAndResistRows(entity, properties));
  if (savingThrows) metaRows.push(row('Saving Throws', savingThrows));
  return {
    badgeText: category,
    badgeClass: 'badge-feat',
    extraClass: 'feat-sheet',
    metaRows,
    body: renderEntry(entity.entries),
    properties,
    textSummary: `${category} Feat. Prerequisites: ${prereqs}. ASIs: ${asis}.`,
  };
};

export const renderRace: Renderer = (entity, { source, page }) => {
  const size =
    SIZES[(entity.size as string[])?.[0]] ||
    (entity.size as string[])?.[0] ||
    'Medium';
  let speed = '30 ft.';
  if (entity.speed) {
    speed =
      typeof entity.speed === 'object'
        ? Object.entries(entity.speed as Record<string, unknown>)
            .map(([k, v]) => `${k === 'walk' ? '' : k + ' '}${v} ft.`)
            .join(', ')
        : `${entity.speed} ft.`;
  }
  const asis = entity.ability
    ? translateAbilityIncreases(entity.ability)
    : 'Chooseable';
  const properties: Record<string, unknown> = { size, speed, asi: asis };
  const metaRows = [row('Size', size), row('Speed', speed), row('ASIs', asis)];
  metaRows.push(...collectProfAndResistRows(entity, properties));
  const senses = formatSenses(entity.senses);
  if (senses) {
    properties.senses = senses;
    metaRows.push(row('Senses', senses));
  }

  let body = '';
  if (Array.isArray(entity.entries)) {
    body = entity.entries
      .map((e) => {
        if (
          e &&
          typeof e === 'object' &&
          (e as { type?: string }).type === 'entries' &&
          (e as { name?: string }).name
        ) {
          const obj = e as { name: string; entries: never[] };
          return `<div class="race-trait"><h5>${parseInlineTags(obj.name)}</h5>${(obj.entries || []).map(renderEntry).join('')}</div>`;
        }
        return renderEntry(e);
      })
      .join('');
  }
  return {
    badgeText: 'Ancestry',
    badgeClass: 'badge-race',
    extraClass: 'race-sheet',
    metaRows,
    body,
    properties,
    textSummary: `Ancestry. Size: ${size}. Speed: ${speed}. ASIs: ${asis}.`,
  };
};

export const renderBackground: Renderer = (entity) => {
  const keysOr = (list: unknown): string =>
    Array.isArray(list)
      ? list.map((s) => Object.keys(s as object).join(', ')).join(' or ')
      : 'None';
  const skills = keysOr(entity.skills);
  const tools = keysOr(entity.tools);
  const languages = keysOr(entity.languages);
  return {
    badgeText: 'Background',
    badgeClass: 'badge-background',
    extraClass: 'background-sheet',
    metaRows: [
      row('Skills', skills),
      row('Tools', tools),
      row('Languages', languages),
    ],
    body: renderEntry(entity.entries),
    properties: { skills, tools, languages },
    textSummary: `Background. Skills: ${skills}. Tools: ${tools}. Languages: ${languages}.`,
  };
};

export const renderClass: Renderer = (entity, { source, page }) => {
  if (entity.classShortName !== undefined) {
    const parentClass = entity.className || entity.classShortName;
    return {
      badgeText: `Subclass of ${parentClass}`,
      badgeClass: 'badge-class',
      extraClass: 'subclass-sheet',
      metaRows: [row('Parent Class', parentClass)],
      body: renderEntry((entity.entries as never) || []),
      properties: {
        parentClass,
        subclassShortName: entity.subclassShortName || entity.shortName,
      },
      textSummary: `Subclass of ${parentClass}. Source: ${source}${page}.`,
    };
  }
  const hd = entity.hd as { faces?: number } | undefined;
  const hitDie = `1d${hd?.faces || 8}`;
  const saves = Array.isArray(entity.proficiency)
    ? entity.proficiency.map((s) => String(s).toUpperCase()).join(', ')
    : 'None';
  let body = '';
  if (Array.isArray(entity.classTableGroups)) {
    body = (entity.classTableGroups as Record<string, unknown>[])
      .map((grp) => {
        const cap = grp.title ? `<caption>${grp.title}</caption>` : '';
        const cols = Array.isArray(grp.colLabels)
          ? `<thead><tr>${grp.colLabels.map((l) => `<th>${parseInlineTags(String(l))}</th>`).join('')}</tr></thead>`
          : '';
        const rows = Array.isArray(grp.rows)
          ? `<tbody>${(grp.rows as unknown[][]).map((r) => `<tr>${r.map((c) => `<td>${parseInlineTags(String(c))}</td>`).join('')}</tr>`).join('')}</tbody>`
          : '';
        return `<div class="table-container"><table class="class-table">${cap}${cols}${rows}</table></div>`;
      })
      .join('');
  }
  return {
    badgeText: 'Class',
    badgeClass: 'badge-class',
    extraClass: 'class-sheet',
    metaRows: [row('Hit Die', hitDie), row('Saving Throws', saves)],
    body,
    properties: { hitDie, savingThrows: saves },
    textSummary: `Class. Hit Die: ${hitDie}. Saving Throws: ${saves}.`,
  };
};

export const renderOptionalFeature: Renderer = (entity) => {
  const fTypes = Array.isArray(entity.featureType) ? entity.featureType : [];
  const mappedTypes =
    fTypes.map((t) => FEATURE_TYPES[t as string] || t).join(', ') ||
    'Optional Feature';
  const prereqs = translatePrerequisites(entity.prerequisite);
  const properties: Record<string, unknown> = {
    featureType: mappedTypes,
    prerequisites: prereqs,
  };
  const metaRows = [row('Type', mappedTypes)];
  if (prereqs !== 'None') metaRows.push(row('Prerequisites', prereqs));
  const consumes = entity.consumes as
    { amount?: number; name?: string } | undefined;
  if (consumes) {
    const amt = consumes.amount || 1;
    const rName = consumes.name || 'Resource';
    const v = `${amt} ${rName}${amt > 1 && !/(s|Dice|dice)$/.test(rName) ? 's' : ''}`;
    properties.consumes = v;
    metaRows.push(row('Consumes', v));
  }
  metaRows.push(...collectProfAndResistRows(entity, properties));
  return {
    badgeText: mappedTypes,
    badgeClass: 'badge-feat',
    extraClass: 'optional-feature-sheet',
    metaRows,
    body: renderEntry(entity.entries),
    properties,
    textSummary: `${mappedTypes}. Prerequisites: ${prereqs}.${properties.consumes ? ` Consumes: ${properties.consumes}.` : ''}`,
  };
};
