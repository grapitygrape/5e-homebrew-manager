/**
 * engine/merge/copy-versions.ts — `_versions` expansion (basic entries and
 * `_abstract`/`_implementations`), plus monster `variant[]._version`, each
 * applied onto the parent through applyCopy, as 5etools' getVersions does.
 */
import type { Entity } from '../types.ts';
import { isObj, type Obj } from '../../util.ts';
import { applyCopy, newTrace } from './copy-applier.ts';
import type { ApplyCopyOptions, CopyTrace } from './copy-applier.ts';
import { asArray, clone, walkStrings } from './copy-math.ts';

export interface ResolvedVersion {
  entity: Entity;
  trace: CopyTrace;
}

/** Monster `variant[]._version` → extra `_versions` entries (DataUtil.monster). */
function monsterVariantVersions(mon: Obj): Obj[] {
  if (!Array.isArray(mon.variant)) return [];
  const out: Obj[] = [];
  for (const it of mon.variant as Obj[]) {
    const v = it?._version as Obj | undefined;
    if (!v) continue;
    const toAdd: Obj = {
      name: v.name || it.name,
      source: v.source || it.source || mon.source,
      variant: null,
    };
    if (v.addAs) {
      const cpy = clone(it);
      delete cpy._version;
      delete cpy.type;
      delete cpy.source;
      delete cpy.page;
      toAdd._mod = { [String(v.addAs)]: { mode: 'appendArr', items: cpy } };
      out.push(toAdd);
    } else if (v.addHeadersAs) {
      const entries = asArray(clone(it).entries).filter(
        (e) => isObj(e) && e.name && e.entries,
      ) as Obj[];
      for (const e of entries) {
        delete e.type;
        delete e.source;
      }
      toAdd._mod = {
        [String(v.addHeadersAs)]: { mode: 'appendArr', items: entries },
      };
      out.push(toAdd);
    }
  }
  return out;
}

/** Expand `_versions` (basic + `_abstract`/`_implementations`) exactly as the site does. */
export function expandVersions(
  parent: Entity,
  opts: Omit<ApplyCopyOptions, 'trace'> = {},
): ResolvedVersion[] {
  const p = parent as Obj;
  const raw = [
    ...asArray(p._versions),
    ...(opts.prop === 'monster' ? monsterVariantVersions(p) : []),
  ] as Obj[];
  if (!raw.length) return [];

  const expanded: Obj[] = [];
  for (const ver of raw) {
    if (isObj(ver._abstract) && Array.isArray(ver._implementations)) {
      for (const impl of ver._implementations as Obj[]) {
        let tmpl = mutExpandCopy(clone(ver._abstract));
        const cpyImpl = clone(impl);
        if (isObj(cpyImpl._variables)) {
          const vars = cpyImpl._variables;
          tmpl = walkStrings(tmpl, (s) =>
            s.replace(/\{\{([^}]+)\}\}/g, (_m, k: string) => String(vars[k])),
          ) as Obj;
          delete cpyImpl._variables;
        }
        expanded.push(Object.assign(tmpl, cpyImpl));
      }
    } else expanded.push(mutExpandCopy(clone(ver)));
  }

  const base = clone(p);
  delete base._versions;
  delete base.hasToken;
  delete base.hasFluff;
  delete base.hasFluffImages;

  return expanded.map((ver) => {
    const trace = newTrace();
    const b = clone(base);
    for (const k of ['additionalSources', 'otherSources', 'referenceSources']) {
      if (Array.isArray(b[k]))
        b[k] = (b[k] as Obj[]).filter((s) => s?.source !== ver.source);
      if (!asArray(b[k]).length) delete b[k];
    }
    trace.steps.push({
      kind: 'version',
      prop: '',
      detail: `version "${String(ver.name ?? p.name)}" of "${String(p.name)}"`,
      ok: true,
    });
    const entity = applyCopy(b as Entity, ver as Entity, { ...opts, trace });
    Object.assign(entity, {
      _versionBase_isVersion: true,
      _versionBase_name: p.name,
      _versionBase_source: p.source,
    });
    return { entity, trace };
  });
}

function mutExpandCopy(ent: Obj): Obj {
  ent._copy = {
    _mod: ent._mod,
    _templates: ent._templates,
    _preserve: ent._preserve || { '*': true },
  };
  delete ent._mod;
  delete ent._templates;
  delete ent._preserve;
  return ent;
}
