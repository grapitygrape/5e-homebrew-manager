/**
 * lib/services/release-checks.ts — Deploy Site's Review list, judged.
 *
 * INTENT
 *   After Prepare builds the candidate site, these say whether it's safe to
 *   publish and what's left to tidy. Pure: lib/api/release.ts gathers the
 *   inputs (the prepare record, the last publish, the checks' results), this
 *   turns them into lines for the page.
 *
 *   A *blocking* line covers something that would break the published site.
 *   One that isn't ok stops "Prepare and publish if the checks pass", and a
 *   manual Publish then takes a second click. The rest (guides, collisions,
 *   schema match) only affect this app, so they're a to-do list.
 */
import type {
  LastDeployRun,
  LastPrepare,
  ModuleCheck,
  SchemaSyncReport,
  ScriptNameCheck,
} from '$lib/tauri-bridge';
import { plural } from '$lib/util';

export type CheckState = 'ok' | 'warn' | 'fail' | 'info';

export interface ReleaseCheck {
  id: string;
  title: string;
  state: CheckState;
  text: string;
  details: string[];
  blocking: boolean;
  /** The page where it gets fixed. */
  href?: string;
}

/** A check's result, or why it couldn't run. */
export type Outcome<T> = T | { error: string };

export interface ReleaseInput {
  prepare: LastPrepare;
  published: LastDeployRun | null;
  /** Module id → title, for readable lines. */
  moduleTitles: Record<string, string>;
  scriptNames: Outcome<ScriptNameCheck>;
  /** Every brew in the homebrew folder, with its parse error if any. */
  brews: Outcome<{ file: string; error: string | null }[]>;
  /** Guides whose audit fails (coverage, stale names, a weak branch). */
  guides: Outcome<{ failing: string[] }>;
  guideLists: Outcome<{ problems: string[] }>;
  collisions: Outcome<{ errors: number }>;
  schemaSync: SchemaSyncReport | null;
}

/** How pipeline.rs words a skipped allowMissing patch. */
const SKIPPED_PATCH = 'Skipped patch (no match): ';

const failed = <T>(o: Outcome<T>): o is { error: string } =>
  typeof o === 'object' && o !== null && 'error' in o;

const count = (n: number, one: string, many?: string) =>
  `${n} ${plural(n, one, many)}`;

/** A check that couldn't run: blocking ones still hold back an automatic publish. */
function couldNotRun(
  base: Omit<ReleaseCheck, 'state' | 'text' | 'details'>,
  error: string,
): ReleaseCheck {
  return {
    ...base,
    state: 'warn',
    text: `Couldn't run this check: ${error}`,
    details: [],
  };
}

/** Skips the live release already had are how the site normally is, not news. */
function moduleLines(input: ReleaseInput): ReleaseCheck {
  const base = {
    id: 'modules',
    title: 'Customizations applied',
    blocking: true,
    href: '/customize',
  };
  const live = new Map<string, ModuleCheck>(
    (input.published?.modules ?? []).map((m) => [m.id, m]),
  );
  const title = (id: string) => input.moduleTitles[id] ?? id;
  const errors = input.prepare.modules.filter((m) => m.status === 'error');
  const skipped = input.prepare.modules.filter((m) => m.status === 'skipped');
  const newSkips = skipped.filter((m) => {
    const before = live.get(m.id);
    if (before?.status !== 'skipped') return true;
    return m.details.some((d) => !before.details.includes(d));
  });
  const lines = (list: ModuleCheck[]) =>
    list.flatMap((m) => m.details.map((d) => `${title(m.id)}: ${d}`));

  if (errors.length)
    return {
      ...base,
      state: 'fail',
      text: `${count(errors.length, 'customization')} failed: ${errors.map((m) => title(m.id)).join(', ')}.`,
      details: lines(errors),
    };
  if (newSkips.length)
    return {
      ...base,
      state: 'warn',
      text: `${count(newSkips.length, 'customization')} skipped part of its change, which the live site doesn't: ${newSkips.map((m) => title(m.id)).join(', ')}.`,
      details: lines(newSkips),
    };
  const on = input.prepare.modules.filter((m) => m.status !== 'off').length;
  return {
    ...base,
    state: 'ok',
    text: skipped.length
      ? `All ${on} switched on applied, with the same skips as the live site.`
      : `All ${on} switched on applied.`,
    details: lines(skipped),
  };
}

export function judgeRelease(input: ReleaseInput): ReleaseCheck[] {
  const { prepare } = input;
  const out: ReleaseCheck[] = [];
  // The customizations line judges these against the live site instead.
  const warnings = prepare.warnings.filter((w) => !w.startsWith(SKIPPED_PATCH));

  out.push({
    id: 'prepare',
    title: 'Prepare finished',
    blocking: true,
    ...(prepare.ok
      ? warnings.length
        ? {
            state: 'warn' as const,
            text: `Finished with ${count(warnings.length, 'warning')}.`,
            details: warnings,
          }
        : { state: 'ok' as const, text: 'Finished cleanly.', details: [] }
      : {
          state: 'fail' as const,
          text: 'Stopped before the end. The output above says where.',
          details: prepare.warnings,
        }),
  });

  out.push(moduleLines(input));

  const namesBase = {
    id: 'script-names',
    title: '5etools names our scripts use still exist',
    blocking: true,
  };
  const names = input.scriptNames;
  if (failed(names)) out.push(couldNotRun(namesBase, names.error));
  else if (!names.from)
    out.push({
      ...namesBase,
      state: 'info',
      text: 'No published release is recorded yet, so there is nothing to compare with. This starts after the next Publish.',
      details: [],
    });
  else if (names.missing.length)
    out.push({
      ...namesBase,
      state: 'fail',
      text: `5etools dropped names that ${names.missing.map((m) => m.module).join(', ')} still use. A match can be a coincidence, so read the code before changing it.`,
      details: names.missing.map((m) => `${m.module}: ${m.names.join(', ')}`),
    });
  else
    out.push({
      ...namesBase,
      state: 'ok',
      text: `Every name is still in 5etools' js/ (${names.from} → ${names.to}).`,
      details: [],
    });

  const brewsBase = {
    id: 'brews',
    title: 'Every brew loads',
    blocking: true,
    href: '/files',
  };
  if (failed(input.brews)) out.push(couldNotRun(brewsBase, input.brews.error));
  else {
    const broken = input.brews.filter((b) => b.error);
    out.push(
      broken.length
        ? {
            ...brewsBase,
            state: 'fail',
            text: `${count(broken.length, 'brew')} isn't valid JSON, so the site can't load it.`,
            details: broken.map((b) => `${b.file}: ${b.error}`),
          }
        : {
            ...brewsBase,
            state: 'ok',
            text: `All ${input.brews.length} parse.`,
            details: [],
          },
    );
  }

  const blocked = prepare.blockedSources;
  out.push({
    id: 'blocked',
    title: 'New sources',
    blocking: false,
    href: '/blocklist',
    state: 'info',
    text: blocked.length
      ? `${count(blocked.length, 'new source')} blocked until you unblock ${plural(blocked.length, 'it', 'them')} in Choose Content.`
      : 'Nothing new was blocked.',
    details: blocked,
  });

  const guidesBase = {
    id: 'guides',
    title: 'Guides cover the brew schemas',
    blocking: false,
    href: '/',
  };
  if (failed(input.guides))
    out.push(couldNotRun(guidesBase, input.guides.error));
  else
    out.push(
      input.guides.failing.length
        ? {
            ...guidesBase,
            state: 'warn',
            text: `${count(input.guides.failing.length, 'guide')} ${plural(input.guides.failing.length, 'needs', 'need')} updating for these schemas. The Dashboard's audit names the properties.`,
            details: input.guides.failing,
          }
        : {
            ...guidesBase,
            state: 'ok',
            text: 'Every guide is at 100%.',
            details: [],
          },
    );

  const listsBase = {
    id: 'guide-lists',
    title: 'Generated guide lists',
    blocking: false,
  };
  if (failed(input.guideLists))
    out.push(couldNotRun(listsBase, input.guideLists.error));
  else
    out.push(
      input.guideLists.problems.length
        ? {
            ...listsBase,
            state: 'warn',
            text: `${count(input.guideLists.problems.length, 'list')} out of date with the schemas.`,
            details: input.guideLists.problems,
          }
        : {
            ...listsBase,
            state: 'ok',
            text: 'Every list matches the schemas.',
            details: [],
          },
    );

  const collBase = {
    id: 'collisions',
    title: 'No brew collisions',
    blocking: false,
    href: '/files',
  };
  if (failed(input.collisions))
    out.push(couldNotRun(collBase, input.collisions.error));
  else
    out.push(
      input.collisions.errors
        ? {
            ...collBase,
            state: 'warn',
            text: `${count(input.collisions.errors, 'collision')} between brews or with official content.`,
            details: [],
          }
        : {
            ...collBase,
            state: 'ok',
            text: 'No duplicate entries or source ids.',
            details: [],
          },
    );

  const sync = input.schemaSync;
  if (sync && sync.status !== 'unknown')
    out.push({
      id: 'schemas',
      title: 'Brew schemas match the site',
      blocking: false,
      href: '/sources',
      state: sync.status === 'synced' ? 'ok' : 'warn',
      text:
        sync.status === 'synced'
          ? `5etools-utils v${sync.actualUtilsVersion} is the version 5e v${sync.siteVersion} asks for.`
          : sync.message,
      details: [],
    });

  return out;
}

/** True when nothing that could break the published site needs a look. */
export const canAutoPublish = (checks: ReleaseCheck[]): boolean =>
  checks.every((c) => !c.blocking || c.state === 'ok' || c.state === 'info');
