// Floating searchable pickers (Foundry target picker & manager shop picker)
// styled with 5etools' own context-menu classes.

export const OPEN_GROUPS_KEY = 'hm-foundry-open-groups';

export const GROUPS = [
  ['character', 'Player characters'],
  ['party', 'Parties'],
  ['group', 'Groups'],
  ['encounter', 'Encounters'],
];

export const WORLD_DIRECTORY = { uuid: null, name: 'World directory', blocked: false };

export const make = (tag, className, text) => {
  const element = document.createElement(tag);
  element.className = className;
  // Always text: actor and folder names are free text from the world.
  if (text != null) element.textContent = text;
  return element;
};

export const button = (className) => {
  const element = make('button', className);
  element.type = 'button';
  return element;
};

/** Folds case and accents, so "aria" finds "Áriá". */
export const fold = (text) =>
  String(text).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every word must appear somewhere in the name or folder. */
export const matches = ({ name, folder = '' }, query) => {
  const haystack = fold(`${name} ${folder ?? ''}`);
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

export const loadOpenGroups = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
};

export const saveOpenGroups = (open) => {
  try {
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...open]));
  } catch {
    // Private storage only costs remembering this between pickers.
  }
};

/** Shared floating picker shell: viewport-clamped anchor, keyboard nav, outside-click close. */
const mountPicker = ({ titleText, placeholder, anchor, onChoose, onClose, renderRows }) => {
  const root = make('div', 'hm-target-picker ve-ui-ctx__wrp');
  const title = make('div', 'hm-target-title', titleText);
  const search = make('input', 've-form-control ve-input-xs');
  search.placeholder = placeholder;
  const list = make('div', 'hm-target-list');
  root.append(title, search, list);

  // Only rows that can be chosen, in the order the arrows walk them.
  let rows = [];
  let active = -1;

  const setActive = (index) => {
    if (rows[active]) delete rows[active].element.dataset.active;
    active = index;
    if (!rows[active]) return;
    rows[active].element.dataset.active = 'true';
    rows[active].element.scrollIntoView({ block: 'nearest' });
  };

  // Stay on screen as groups open and the height changes.
  const place = () => {
    const { width, height } = root.getBoundingClientRect();
    const margin = 8;
    const x = Math.min(anchor.x, window.innerWidth - width - margin);
    const y = Math.min(anchor.y, window.innerHeight - height - margin);
    root.style.insetInlineStart = `${Math.max(x, margin)}px`;
    root.style.insetBlockStart = `${Math.max(y, margin)}px`;
  };

  const onOutside = (evt) => {
    if (!root.contains(evt.target)) close();
  };

  function close() {
    window.removeEventListener('pointerdown', onOutside, true);
    root.remove();
    onClose?.(close);
  }

  const choose = (target) => {
    close();
    onChoose(target);
  };

  function render() {
    const query = search.value.trim();
    list.replaceChildren();
    rows = [];
    active = -1;
    renderRows({
      query,
      list,
      search,
      render,
      choose,
      registerRow: (element, target) => rows.push({ element, target }),
      rowCount: () => rows.length,
    });
    if (query) setActive(rows.length ? 0 : -1);
    place();
  }

  search.addEventListener('input', render);
  search.addEventListener('keydown', (evt) => {
    // The site has its own hotkeys, such as p to pin.
    evt.stopPropagation?.();
    if (evt.key === 'Escape') {
      close();
    } else if (evt.key === 'Enter') {
      evt.preventDefault?.();
      if (rows[active]) choose(rows[active].target);
    } else if (rows.length && (evt.key === 'ArrowDown' || evt.key === 'ArrowUp')) {
      evt.preventDefault?.();
      const step = evt.key === 'ArrowDown' ? 1 : -1;
      const from = active === -1 && step === -1 ? 0 : active;
      setActive((from + step + rows.length) % rows.length);
    }
  });
  window.addEventListener('pointerdown', onOutside, true);

  document.body.append(root);
  render();
  search.focus();

  return { root, title, close };
};

export const showTargetPicker = (targets, batch, { anchor, onChoose, onClose }) => {
  const open = loadOpenGroups();
  const titleFor = () => (batch.length > 1 ? `Send ${batch.length} entries to` : 'Send to');

  const mounted = mountPicker({
    titleText: titleFor(),
    placeholder: 'Search actors and folders…',
    anchor,
    onChoose,
    onClose,
    renderRows: ({ query, list, search, render, choose, registerRow }) => {
      const addRow = (target, isIndented) => {
        const indent = isIndented ? ' hm-target-row-indented' : '';
        const row = button(`hm-target-row ve-ui-ctx__btn${indent}`);
        row.append(make('span', 'hm-target-name', target.name));
        if (target.folder) row.append(make('span', 'hm-target-folder', target.folder));
        row.disabled = !!target.blocked;
        if (target.blocked) row.title = `${target.name} can't hold this.`;
        row.addEventListener('click', () => choose(target));
        list.append(row);
        if (!target.blocked) registerRow(row, target);
      };

      const addGroupHead = (kind, label, count, isOpen) => {
        const head = button('hm-target-group-head ve-ui-ctx__btn');
        const text = make('span', 'hm-target-name');
        text.append(make('span', 'hm-target-chevron', isOpen ? '▾' : '▸'), make('span', '', label));
        head.append(text, make('span', 'hm-target-count', count));
        head.addEventListener('click', () => {
          if (open.has(kind)) open.delete(kind);
          else open.add(kind);
          saveOpenGroups(open);
          render();
          search.focus();
        });
        list.append(head);
      };

      if (matches(WORLD_DIRECTORY, query)) addRow(WORLD_DIRECTORY, false);

      for (const [kind, label] of GROUPS) {
        const inGroup = targets.filter((t) => t.kind === kind && matches(t, query));
        if (!inGroup.length) continue;
        // A search opens everything it finds, without changing what's remembered.
        const isOpen = !!query || open.has(kind);
        addGroupHead(kind, label, inGroup.length, isOpen);
        if (isOpen) inGroup.forEach((target) => addRow(target, true));
      }

      if (!list.children.length) list.append(make('div', 'hm-target-empty', 'No matches'));
    },
  });

  return {
    updateTitle: () => {
      mounted.title.textContent = titleFor();
    },
    close: mounted.close,
  };
};

/** Pick a shop to add to, or type a new shop's name. */
export const showShopPicker = (shops, entries, { anchor, onChoose, onClose }) => {
  const mounted = mountPicker({
    titleText: entries.length > 1 ? `Add ${entries.length} entries to a shop` : 'Add to a shop',
    placeholder: 'Search shops, or name a new one…',
    anchor,
    onChoose,
    onClose,
    renderRows: ({ query, list, choose, registerRow, rowCount }) => {
      const addRow = (label, detail, target) => {
        const row = button('hm-target-row ve-ui-ctx__btn');
        row.append(make('span', 'hm-target-name', label));
        if (detail) row.append(make('span', 'hm-target-count', detail));
        row.addEventListener('click', () => choose(target));
        list.append(row);
        registerRow(row, target);
      };

      const found = shops.filter((shop) => matches(shop, query));
      const exact = shops.some((shop) => fold(shop.name) === fold(query));
      if (query && !exact) addRow(`New shop “${query}”`, '', { name: query });
      for (const shop of found) addRow(shop.name, shop.count, { file: shop.file });
      if (!rowCount()) {
        list.append(make('div', 'hm-target-empty', 'No shops yet. Type a name to make one.'));
      }
    },
  });

  return mounted.close;
};
