// Mirrors user-added 5etools blocklist rules back to the manager's Choose Content
// page. Only user actions are hooked: ExcludeUtil.pExtendList also runs on every
// load for brews that ship a blocklist, ours included, so hooking it would echo all.

import { invoke, toast } from './transport.js';

export const toRule = ({ displayName, hash, category, source }) => ({
  displayName: String(displayName ?? hash ?? ''),
  hash: String(hash ?? ''),
  category: String(category ?? ''),
  source: String(source?.source ?? source ?? ''),
  isAuto: false,
});

export const createBlocklistBridge = ({
  batchMs = 250,
  invokeFn = invoke,
  toastFn = toast,
} = {}) => {
  let blockQueue = [];
  let blockTimer = null;

  const flushBlocked = async () => {
    const entries = blockQueue;
    blockQueue = [];
    if (!entries.length) return;
    try {
      await invokeFn('blocklist_add', { entries });
      const what = entries.length === 1 ? 'it' : `${entries.length} rules`;
      toastFn(
        `Also sent ${what} to the manager's Choose Content page. Save there to keep.`,
        'success',
      );
    } catch (err) {
      toastFn(`Could not send to the manager: ${err?.message ?? err}`, 'danger');
    }
  };

  // The blocklist page adds a rule and its sub-rules one call at a time.
  const queueBlocked = (rules) => {
    blockQueue.push(...rules.map(toRule).filter((r) => r.hash && r.category && r.source));
    clearTimeout(blockTimer);
    blockTimer = setTimeout(() => void flushBlocked(), batchMs);
  };

  const hookBlocklist = () => {
    // Top-level classes in the site's scripts, so not on globalThis.
    const listPage = typeof ListPage === 'undefined' ? null : ListPage.prototype;
    const original = listPage?._pDoMassBlocklist;
    if (original && !original.hbmHooked) {
      listPage._pDoMassBlocklist = async function (ents) {
        const result = await original.call(this, ents);
        queueBlocked(
          (ents ?? []).filter(Boolean).map((ent) => ({
            displayName: ent._displayName || ent.name,
            hash: UrlUtil.autoEncodeHash(ent),
            category: ent.__prop,
            source: ent.source,
          })),
        );
        return result;
      };
      listPage._pDoMassBlocklist.hbmHooked = true;
    }

    const blocklistUi = typeof BlocklistUi === 'undefined' ? null : BlocklistUi.prototype;
    const addExclude = blocklistUi?._addExclude;
    if (addExclude && !addExclude.hbmHooked) {
      // Returns true only for a rule that wasn't already in the list.
      blocklistUi._addExclude = function (displayName, hash, category, source) {
        const added = addExclude.call(this, displayName, hash, category, source);
        if (added) queueBlocked([{ displayName, hash, category, source }]);
        return added;
      };
      blocklistUi._addExclude.hbmHooked = true;
    }
  };

  return { queueBlocked, flushBlocked, hookBlocklist };
};
