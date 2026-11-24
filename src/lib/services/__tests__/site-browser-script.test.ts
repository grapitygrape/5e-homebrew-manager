/**
 * Tests for the script the desktop app injects into its site browser window.
 * Runs the real file in a VM with a stand-in window and a small stand-in DOM.
 * Replies are keyed by command, and rows are found by their text, not position.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SCRIPT = readFileSync(
  join(process.cwd(), 'src-tauri/src/site-browser.js'),
  'utf8',
);

type Replies = Record<string, unknown>;

/** Just enough of an element for the picker to build and be clicked. */
class FakeElement extends EventTarget {
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  className = '';
  ownText = '';
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  title = '';
  type = '';
  value = '';
  placeholder = '';
  disabled = false;
  focused = false;

  constructor(public tag: string) {
    super();
  }
  get textContent(): string {
    return this.ownText + this.children.map((c) => c.textContent).join('');
  }
  set textContent(value: string) {
    this.ownText = value;
  }
  append(...items: FakeElement[]) {
    for (const item of items) {
      item.parent = this;
      this.children.push(item);
    }
  }
  replaceChildren() {
    this.children = [];
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  contains(other: FakeElement | null): boolean {
    for (let at = other; at; at = at.parent) if (at === this) return true;
    return false;
  }
  closest() {
    return null;
  }
  get parentElement() {
    return this.parent;
  }
  get nextElementSibling(): FakeElement | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  get previousElementSibling(): FakeElement | null {
    const siblings = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }
  after(item: FakeElement) {
    item.remove();
    const siblings = this.parent!.children;
    item.parent = this.parent;
    siblings.splice(siblings.indexOf(this) + 1, 0, item);
  }
  before(item: FakeElement) {
    item.remove();
    const siblings = this.parent!.children;
    item.parent = this.parent;
    siblings.splice(siblings.indexOf(this), 0, item);
  }
  focus() {
    this.focused = true;
  }
  scrollIntoView() {}
  getBoundingClientRect() {
    return { width: 320, height: 200 };
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new Event('click'));
  }
  /** Every element in this tree, this one first. */
  all(): FakeElement[] {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
}

/** Carries its init across, as the real one does. Node has no MouseEvent. */
class FakeMouseEvent extends Event {
  shiftKey: boolean;
  constructor(type: string, init: EventInit & { shiftKey?: boolean } = {}) {
    super(type, init);
    this.shiftKey = !!init.shiftKey;
  }
}

function load(
  replies: Replies,
  { stored = {} as Record<string, string>, confirm = true } = {},
) {
  const win = new EventTarget() as EventTarget & Record<string, unknown>;
  win.innerWidth = 1000;
  win.innerHeight = 800;
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  const toasts: { content: string; type?: string }[] = [];
  const confirmations: string[] = [];

  win.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      calls.push({ cmd, args });
      const reply = replies[cmd.replace('plugin:site-browser|', '')];
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };

  const body = new FakeElement('body');
  const selects = (el: FakeElement, selector: string) => {
    if (selector === 'button[title="Reload Pinned List"]') return el.title === 'Reload Pinned List';
    if (selector === '.ve-ui-ctx__btn') return el.className.includes('ve-ui-ctx__btn');
    if (selector === '.hm-send-card') return el.className.includes('hm-send-card');
    if (selector === '.hm-add-shop-card') return el.className.includes('hm-add-shop-card');
    if (selector === '.detail-bar-send-to-foundry') {
      return el.className.includes('detail-bar-send-to-foundry');
    }
    if (selector === '#tabs-right .glyphicon-option-vertical') {
      return el.className.includes('glyphicon-option-vertical') && el.parent?.parent?.dataset.id === 'tabs-right';
    }
    if (selector === '#pagecontent button[title^="Send to Foundry"]') {
      return el.dataset.inCard === 'true';
    }
    if (selector === '#sublist .ve-lst__row') return el.className.includes('ve-lst__row');
    if (selector === '#sublist .ve-lst__row.list-multi-selected') {
      return el.className.includes('ve-lst__row') && el.className.includes('list-multi-selected');
    }
    throw new Error(`The stand-in DOM doesn't know "${selector}"`);
  };
  const documentStub = new EventTarget() as EventTarget & Record<string, unknown>;
  Object.assign(documentStub, {
    documentElement: { dataset: {} as Record<string, string> },
    head: new FakeElement('head'),
    body,
    hidden: false,
    createElement: (tag: string) => new FakeElement(tag),
    getElementById: (id: string) => body.all().find((e) => e.dataset.id === id) ?? null,
    querySelectorAll: (selector: string) => body.all().filter((e) => selects(e, selector)),
    querySelector: (selector: string) =>
      body.all().find((e) => selects(e, selector)) ?? null,
  });

  let onMutate: () => void = () => {};
  class FakeMutationObserver {
    constructor(callback: () => void) {
      onMutate = callback;
    }
    observe() {}
  }

  const sandbox = {
    window: win,
    document: documentStub,
    CustomEvent,
    MouseEvent: FakeMouseEvent,
    MutationObserver: FakeMutationObserver,
    InputUiUtil: {
      pGetUserBoolean: async (opts: { title: string }) => {
        confirmations.push(opts.title);
        return confirm;
      },
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    localStorage: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
    JqueryUtil: {
      doToast: (t: { content: string; type?: string }) => toasts.push(t),
    },
  };

  vm.runInNewContext(SCRIPT, sandbox);

  const picker = () =>
    body.children.find((c) => c.className.includes('hm-target-picker')) ?? null;
  const rowsIn = () =>
    (picker()?.all() ?? []).filter((e) => e.className.includes('hm-target-row'));
  const heads = () =>
    (picker()?.all() ?? []).filter((e) => e.className.includes('hm-target-group-head'));
  const search = () => picker()?.all().find((e) => e.tag === 'input') as FakeElement;

  return {
    sandbox,
    win,
    body,
    confirmations,
    mutated: () => onMutate(),
    documentStub,
    calls,
    toasts,
    stored,
    picker,
    search,
    rowNames: () => rowsIn().map((r) => r.children[0]?.textContent ?? r.textContent),
    row: (name: string) =>
      rowsIn().find((r) => (r.children[0]?.textContent ?? r.textContent) === name) as FakeElement,
    head: (label: string) =>
      heads().find((h) => h.textContent.includes(label)) as FakeElement,
    headTexts: () => heads().map((h) => h.textContent),
    type: (value: string) => {
      const input = search();
      input.value = value;
      input.dispatchEvent(new Event('input'));
    },
    key: (key: string) => {
      const evt = new Event('keydown');
      Object.assign(evt, { key });
      search().dispatchEvent(evt);
    },
    clickOutside: () => {
      const evt = new Event('pointerdown');
      Object.defineProperty(evt, 'target', { value: new FakeElement('div') });
      win.dispatchEvent(evt);
    },
    rivetSend: (detail: unknown) =>
      win.dispatchEvent(new CustomEvent('rivet.send', { detail })),
    clickPage: (onSendButton: boolean) => {
      const evt = new Event('click', { cancelable: true });
      Object.defineProperty(evt, 'target', {
        value: { closest: () => (onSendButton ? {} : null) },
      });
      win.dispatchEvent(evt);
      return evt;
    },
    clickPageAt: (clientX: number, clientY: number) => {
      const evt = new Event('click');
      Object.assign(evt, { clientX, clientY });
      Object.defineProperty(evt, 'target', { value: { closest: () => null } });
      win.dispatchEvent(evt);
    },
    called: (cmd: string) =>
      calls.filter((c) => c.cmd === `plugin:site-browser|${cmd}`),
  };
}

const CONNECTED = { connected: true, canSend: true, world: 'Test World' };
const TARGETS = {
  targets: [
    { uuid: 'Actor.vex', name: 'Vex', kind: 'character', blocked: false, folder: 'Current' },
    { uuid: 'Actor.vex2', name: 'Vex', kind: 'character', blocked: false, folder: 'Archive' },
    { uuid: 'Actor.aria', name: 'Áriá', kind: 'character', blocked: false, folder: '' },
    { uuid: 'Actor.co', name: 'Company', kind: 'party', blocked: false, folder: '' },
    { uuid: 'Actor.amb', name: 'Ambush & Co', kind: 'encounter', blocked: true, folder: '' },
  ],
};
const SENT = { sent: 1, failed: [] };

const item = { type: 'entity', data: { page: 'items.html', entity: { name: 'Rope' } } };
const lamp = { type: 'entity', data: { page: 'items.html', entity: { name: 'Lamp' } } };

/** Let the status call, batching timer and picker build all finish. */
const settle = async () => {
  await vi.advanceTimersByTimeAsync(1000);
};

const ready = async () => {
  const page = load({ status: CONNECTED, targets: TARGETS, send: SENT });
  await settle();
  return page;
};

const opened = async (packet: unknown = item) => {
  const page = await ready();
  page.rivetSend(packet);
  await settle();
  return page;
};

beforeEach(() => {
  vi.useFakeTimers();
});

describe('turning the site on', () => {
  it('announces itself as Rivet once the page is ready', async () => {
    const page = load({ status: CONNECTED });
    const announced = vi.fn();
    page.win.addEventListener('rivet.active', announced);
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    expect(announced).toHaveBeenCalled();
  });

  it('turns the site on as soon as it defines ExtensionUtil', async () => {
    const page = load({ status: CONNECTED });
    const active = vm.runInContext(
      'globalThis.ExtensionUtil = {ACTIVE: false}; ExtensionUtil.ACTIVE',
      page.sandbox,
    );
    expect(active).toBe(true);
  });

  it('marks the page by whether a world can receive sends', async () => {
    const page = load({ status: CONNECTED });
    await settle();
    const { dataset } = page.documentStub.documentElement as {
      dataset: Record<string, string>;
    };
    expect(dataset.hbmFoundry).toBe('on');

    const closed = load({ status: { connected: false, canSend: false } });
    await settle();
    const closedRoot = closed.documentStub.documentElement as {
      dataset: Record<string, string>;
    };
    expect(closedRoot.dataset.hbmFoundry).toBe('off');
  });

  it('stops a send button click while no world is connected', async () => {
    const page = load({ status: { connected: false, canSend: false } });
    await settle();
    expect(page.clickPage(true).defaultPrevented).toBe(true);
    expect(page.toasts).toHaveLength(1);
    expect(page.clickPage(false).defaultPrevented).toBe(false);
  });

  it('says to update the module when the world is too old to receive', async () => {
    const page = load({ status: { connected: true, canSend: false } });
    await settle();
    page.clickPage(true);
    expect(page.toasts[0].content).toMatch(/update/i);
  });
});

describe('the target picker', () => {
  it('opens on a short list of groups, with counts, not every actor', async () => {
    const page = await opened();
    expect(page.headTexts()).toEqual([
      expect.stringContaining('Player characters'),
      expect.stringContaining('Parties'),
      expect.stringContaining('Encounters'),
    ]);
    expect(page.head('Player characters').textContent).toContain('3');
    expect(page.rowNames()).toEqual(['World directory']);
    expect(page.search().focused).toBe(true);
  });

  it('opens a group when its heading is clicked, and closes it again', async () => {
    const page = await opened();
    page.head('Player characters').click();
    expect(page.rowNames()).toEqual(['World directory', 'Vex', 'Vex', 'Áriá']);
    page.head('Player characters').click();
    expect(page.rowNames()).toEqual(['World directory']);
  });

  it('remembers which groups were left open', async () => {
    const page = await opened();
    page.head('Parties').click();

    const next = load(
      { status: CONNECTED, targets: TARGETS, send: SENT },
      { stored: page.stored },
    );
    await settle();
    next.rivetSend(item);
    await settle();
    expect(next.rowNames()).toEqual(['World directory', 'Company']);
  });

  it('stays where it opened when a group inside it is clicked', async () => {
    const page = await ready();
    page.clickPageAt(100, 200);
    page.rivetSend(item);
    await settle();
    const { style } = page.picker() as FakeElement;
    expect(style.insetInlineStart).toBe('100px');
    expect(style.insetBlockStart).toBe('200px');

    page.clickPageAt(500, 500);
    page.head('Parties').click();
    expect(style.insetInlineStart).toBe('100px');
    expect(style.insetBlockStart).toBe('200px');
  });

  it('keeps on screen when opened near the corner', async () => {
    const page = await ready();
    page.clickPageAt(990, 790);
    page.rivetSend(item);
    await settle();
    const { style } = page.picker() as FakeElement;
    expect(style.insetInlineStart).toBe('672px');
    expect(style.insetBlockStart).toBe('592px');
  });

  it('tells apart actors with the same name by their folder', async () => {
    const page = await opened();
    page.head('Player characters').click();
    const folders = page
      .picker()
      ?.all()
      .filter((e) => e.className.includes('hm-target-folder'))
      .map((e) => e.textContent);
    expect(folders).toEqual(['Current', 'Archive']);
  });

  it('greys out a target that cannot hold what is being sent', async () => {
    const page = await opened();
    page.head('Encounters').click();
    expect(page.row('Ambush & Co').disabled).toBe(true);
    page.row('Ambush & Co').click();
    await settle();
    expect(page.called('send')).toHaveLength(0);
  });

  it('shows names as text, so a name cannot inject markup', async () => {
    const page = await opened();
    page.head('Encounters').click();
    expect(page.row('Ambush & Co').children[0].ownText).toBe('Ambush & Co');
  });

  it('sends to the chosen actor, reports it and closes', async () => {
    const page = await opened();
    page.head('Parties').click();
    page.row('Company').click();
    await settle();

    const [send] = page.called('send');
    expect(send.args.targetUuid).toBe('Actor.co');
    expect(send.args.packets).toEqual([item]);
    expect(page.toasts.at(-1)?.content).toContain('Company');
    expect(page.picker()).toBeNull();
  });

  it('sends to the world directory', async () => {
    const page = await opened();
    page.row('World directory').click();
    await settle();
    expect(page.called('send')[0].args.targetUuid).toBeNull();
  });

  it('asks about targets without sending the whole entity', async () => {
    const page = await opened();
    expect(page.called('targets')[0].args.packets).toEqual([
      { type: 'entity', page: 'items.html' },
    ]);
  });

  it('closes on a click outside or Escape, forgetting the packets', async () => {
    for (const close of ['outside', 'escape']) {
      const page = await opened();
      if (close === 'outside') page.clickOutside();
      else page.key('Escape');
      expect(page.picker()).toBeNull();

      page.rivetSend(lamp);
      await settle();
      page.row('World directory').click();
      await settle();
      expect(page.called('send')[0].args.packets).toEqual([lamp]);
    }
  });

  it('keeps a send made as the last picker closes', async () => {
    const page = await opened();
    // Clicking another send button closes the open picker, then its send arrives.
    page.clickOutside();
    page.rivetSend(lamp);
    await settle();
    expect(page.picker()).not.toBeNull();
    page.row('World directory').click();
    await settle();
    expect(page.called('send')[0].args.packets).toEqual([lamp]);
  });
});

describe('searching', () => {
  it('finds matches in every group, whether it is open or not', async () => {
    const page = await opened();
    page.type('com');
    expect(page.rowNames()).toEqual(['Company']);
    expect(page.headTexts()).toEqual([expect.stringContaining('Parties')]);
  });

  it('ignores case and accents, and searches folders', async () => {
    const page = await opened();
    page.type('ARIA');
    expect(page.rowNames()).toEqual(['Áriá']);
    page.type('archive');
    expect(page.rowNames()).toEqual(['Vex']);
    page.type('vex curr');
    expect(page.rowNames()).toEqual(['Vex']);
  });

  it('goes back to the groups when cleared', async () => {
    const page = await opened();
    page.type('com');
    page.type('');
    expect(page.rowNames()).toEqual(['World directory']);
  });

  it('says so when nothing matches', async () => {
    const page = await opened();
    page.type('zzz');
    expect(page.rowNames()).toEqual([]);
    expect(page.picker()?.textContent).toContain('No matches');
  });

  it('Enter sends to the first match', async () => {
    const page = await opened();
    page.type('com');
    page.key('Enter');
    await settle();
    expect(page.called('send')[0].args.targetUuid).toBe('Actor.co');
  });

  it('arrows move through matches, skipping what is blocked', async () => {
    const page = await opened();
    page.type('o');
    expect(page.rowNames()).toEqual([
      'World directory',
      'Company',
      'Ambush & Co',
    ]);
    page.key('ArrowDown');
    page.key('Enter');
    await settle();
    expect(page.called('send')[0].args.targetUuid).toBe('Actor.co');
  });

  it('wraps around when arrowing past either end', async () => {
    const page = await opened();
    page.type('com');
    page.key('ArrowUp');
    page.key('Enter');
    await settle();
    expect(page.called('send')[0].args.targetUuid).toBe('Actor.co');
  });

  it('does nothing on Enter before anything is chosen', async () => {
    const page = await opened();
    page.key('Enter');
    await settle();
    expect(page.called('send')).toHaveLength(0);
    expect(page.picker()).not.toBeNull();
  });
});

describe('pinned lists', () => {
  it('gathers a list send into one picker and one send', async () => {
    const page = await ready();
    page.rivetSend(item);
    page.rivetSend(lamp);
    await settle();

    expect(page.picker()?.textContent).toContain('2 entries');
    page.row('World directory').click();
    await settle();
    expect(page.called('send')).toHaveLength(1);
    expect(page.called('send')[0].args.packets).toEqual([item, lamp]);
  });

  it('adds entries that arrive slowly, while the picker is up', async () => {
    const page = await ready();
    page.rivetSend(item);
    await settle();
    expect(page.picker()?.textContent).not.toContain('entries');

    page.rivetSend(lamp);
    expect(page.picker()?.textContent).toContain('2 entries');
    page.row('World directory').click();
    await settle();
    expect(page.called('send')[0].args.packets).toEqual([item, lamp]);
  });

  it('keeps the entries gathered before the targets came back', async () => {
    const page = await ready();
    page.rivetSend(item);
    await vi.advanceTimersByTimeAsync(260);
    page.rivetSend(lamp);
    await settle();
    page.row('World directory').click();
    await settle();
    expect(page.called('send')[0].args.packets).toEqual([item, lamp]);
  });
});

describe('the pinned list button', () => {
  /** The site's toolbar, plus pinned rows whose right-click opens its menu. */
  const toolbar = async ({ rows = ['Abduct'], selected = '', confirm = true } = {}) => {
    const page = load({ status: CONNECTED, targets: TARGETS, send: SENT }, { confirm });
    await settle();
    const row = new FakeElement('div');
    const group = new FakeElement('div');
    const reload = new FakeElement('button');
    reload.title = 'Reload Pinned List';
    group.append(new FakeElement('button'), reload);
    row.append(group);
    page.body.append(row);

    const contextMenuOn: string[] = [];
    const sendFromMenu = vi.fn();
    const clearFromMenu = vi.fn();
    for (const name of rows) {
      const pinned = new FakeElement('div');
      pinned.className = `ve-lst__row${name === selected ? ' list-multi-selected' : ''}`;
      pinned.ownText = name;
      pinned.addEventListener('contextmenu', () => {
        contextMenuOn.push(name);
        const item = new FakeElement('div');
        item.className = 've-ui-ctx__btn';
        item.ownText = 'Send to Foundry';
        item.addEventListener('click', sendFromMenu);
        const clear = new FakeElement('div');
        clear.className = 've-ui-ctx__btn';
        clear.ownText = 'Clear List';
        clear.addEventListener('click', clearFromMenu);
        page.body.append(clear, item);
      });
      page.body.append(pinned);
    }
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    return { page, row, group, contextMenuOn, sendFromMenu, clearFromMenu };
  };
  const actions = (group: FakeElement) => group.nextElementSibling as FakeElement;
  const added = (group: FakeElement) => actions(group).children[0];
  const clearButton = (group: FakeElement) => actions(group).children[1];

  it('sits right after the toolbar group, not inside it', async () => {
    const { row, group } = await toolbar();
    expect(row.children).toHaveLength(2);
    expect(row.children[1]).toBe(actions(group));
    expect(group.children).toHaveLength(2);
    expect(added(group).tag).toBe('button');
    expect(added(group).title).toMatch(/^Send to Foundry/);
  });

  it('looks like the site’s own gold send button', async () => {
    const { group } = await toolbar();
    expect(added(group).className).toContain('ve-btn-primary');
    expect(added(group).children[0].className).toContain('glyphicon-send');
  });

  it('has a clear button to the right of send', async () => {
    const { group } = await toolbar();
    expect(actions(group).children).toHaveLength(2);
    expect(clearButton(group).title).toMatch(/clear/i);
  });

  it('clears the list only after confirming', async () => {
    const { page, group, clearFromMenu, sendFromMenu } = await toolbar();
    clearButton(group).click();
    await settle();
    expect(page.confirmations).toHaveLength(1);
    expect(clearFromMenu).toHaveBeenCalledTimes(1);
    expect(sendFromMenu).not.toHaveBeenCalled();
  });

  it('leaves the list alone when the confirmation is declined', async () => {
    const { page, group, clearFromMenu, contextMenuOn } = await toolbar({ confirm: false });
    clearButton(group).click();
    await settle();
    expect(page.confirmations).toHaveLength(1);
    expect(clearFromMenu).not.toHaveBeenCalled();
    expect(contextMenuOn).toEqual([]);
  });

  it('disables clear too while nothing is pinned', async () => {
    const { group } = await toolbar({ rows: [] });
    expect(clearButton(group).disabled).toBe(true);
  });

  it('is added once, however often the page changes', async () => {
    const { page, row } = await toolbar();
    page.mutated();
    page.mutated();
    expect(row.children).toHaveLength(2);
  });

  it('appears when the site builds its toolbar later', async () => {
    const page = load({ status: CONNECTED });
    await settle();
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));

    const group = new FakeElement('div');
    const reload = new FakeElement('button');
    reload.title = 'Reload Pinned List';
    group.append(reload);
    const row = new FakeElement('div');
    row.append(group);
    page.body.append(row);
    page.mutated();
    expect(added(group)).toBeTruthy();
  });

  it('is disabled while nothing is pinned, following the list as it changes', async () => {
    const { page, group } = await toolbar({ rows: [] });
    expect(added(group).disabled).toBe(true);

    const pinned = new FakeElement('div');
    pinned.className = 've-lst__row';
    page.body.append(pinned);
    page.mutated();
    expect(added(group).disabled).toBe(false);
  });

  it('runs the site’s own send, through its menu on a pinned row', async () => {
    const { group, contextMenuOn, sendFromMenu } = await toolbar({
      rows: ['Abduct', 'Aberrate'],
    });
    added(group).click();
    expect(contextMenuOn).toEqual(['Abduct']);
    expect(sendFromMenu).toHaveBeenCalledTimes(1);
  });

  it('uses a row already selected, so the selection survives', async () => {
    const { group, contextMenuOn } = await toolbar({
      rows: ['Abduct', 'Aberrate'],
      selected: 'Aberrate',
    });
    added(group).click();
    expect(contextMenuOn).toEqual(['Aberrate']);
  });

  it('opens the picker by the button, not where the menu item was', async () => {
    const { page, group, sendFromMenu } = await toolbar();
    // A scripted click on the menu item has no position of its own.
    sendFromMenu.mockImplementation(() => page.clickPageAt(0, 0));
    page.clickPageAt(300, 400);
    added(group).click();

    page.rivetSend(item);
    await settle();
    expect((page.picker() as FakeElement).style.insetInlineStart).toBe('300px');
  });
});

describe('the item card send button', () => {
  const card = async ({ withSend = true } = {}) => {
    const page = load({ status: CONNECTED, targets: TARGETS, send: SENT });
    await settle();
    const tabs = new FakeElement('div');
    tabs.dataset.id = 'tabs-right';
    const overflow = new FakeElement('button');
    tabs.append(overflow);
    page.body.append(tabs);

    const siteClicks: { shiftKey: boolean }[] = [];
    const original = new FakeElement('button');
    if (withSend) {
      original.dataset.inCard = 'true';
      original.addEventListener('click', (evt) =>
        siteClicks.push(evt as unknown as { shiftKey: boolean }),
      );
      page.body.append(original);
    }
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    const send = tabs.children.find((c) => c.className.includes('hm-send-card')) as FakeElement;
    return { page, tabs, overflow, original, send, siteClicks };
  };

  it('joins the buttons at the top of the card, after the overflow menu', async () => {
    const { tabs, overflow, send } = await card();
    expect(tabs.children.indexOf(send)).toBeGreaterThan(tabs.children.indexOf(overflow));
    expect(send.title).toMatch(/^Send to Foundry/);
    expect(send.children[0].className).toContain('glyphicon-send');
  });

  it('stands aside for the reskinned site’s own card send button, even one added later', async () => {
    const { page, tabs, send } = await card();
    expect(send).toBeTruthy();
    const siteSend = new FakeElement('button');
    siteSend.className = 've-btn ve-btn-primary detail-bar-send-to-foundry';
    tabs.append(siteSend);
    page.mutated();
    expect(tabs.children.filter((c) => c.className.includes('hm-send-card'))).toHaveLength(0);
    page.mutated();
    expect(tabs.children.filter((c) => c.className.includes('hm-send-card'))).toHaveLength(0);
  });

  it('is added once, however often the page changes', async () => {
    const { page, tabs } = await card();
    page.mutated();
    page.mutated();
    expect(tabs.children.filter((c) => c.className.includes('hm-send-card'))).toHaveLength(1);
  });

  it('runs the site’s own send button for the card on show', async () => {
    const { send, siteClicks } = await card();
    send.click();
    expect(siteClicks).toHaveLength(1);
    expect(siteClicks[0].shiftKey).toBe(false);
  });

  it('passes shift through, for a temporary import', async () => {
    const { send, siteClicks } = await card();
    const evt = new FakeMouseEvent('click', { shiftKey: true });
    send.dispatchEvent(evt);
    expect(siteClicks[0].shiftKey).toBe(true);
  });

  it('is disabled while the card on show has nothing to send', async () => {
    const { send } = await card({ withSend: false });
    expect(send.disabled).toBe(true);
  });

  it('follows the card as the page changes', async () => {
    const { page, send } = await card({ withSend: false });
    const original = new FakeElement('button');
    original.dataset.inCard = 'true';
    page.body.append(original);
    page.mutated();
    expect(send.disabled).toBe(false);
  });

  it('leaves pages without those buttons alone', async () => {
    const page = load({ status: CONNECTED });
    await settle();
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    expect(page.body.children).toEqual([]);
  });
});

describe('sends with no choice to make', () => {
  it('ignores dice rolls', async () => {
    const page = await ready();
    page.rivetSend({ type: 'roll', data: { dice: '1d20' } });
    await settle();
    expect(page.picker()).toBeNull();
    expect(page.called('send')).toHaveLength(0);
  });

  it('sends a temporary import straight through', async () => {
    const page = await ready();
    page.rivetSend({ type: 'entity', data: { page: 'items.html', entity: {}, isTemp: true } });
    await settle();
    expect(page.picker()).toBeNull();
    expect(page.called('send')[0].args.targetUuid).toBeNull();
  });

  it('passes packets that have no target straight through', async () => {
    const page = await ready();
    page.rivetSend({ type: '5etools.blocklist.excludes', data: [] });
    await settle();
    expect(page.picker()).toBeNull();
    expect(page.called('send')[0].args.targetUuid).toBeNull();
  });

  it('skips the picker when no actor can take what is being sent', async () => {
    const page = load({
      status: CONNECTED,
      send: SENT,
      targets: {
        targets: [{ uuid: 'Actor.pc', name: 'Vex', kind: 'character', blocked: true }],
      },
    });
    await settle();
    page.rivetSend({ type: 'entity', data: { page: 'bestiary.html', entity: {} } });
    await settle();
    expect(page.picker()).toBeNull();
    expect(page.called('send')[0].args.targetUuid).toBeNull();
  });
});

describe('reporting', () => {
  const chooseCompany = async (send: unknown) => {
    const page = load({ status: CONNECTED, targets: TARGETS, send });
    await settle();
    page.rivetSend(item);
    await settle();
    page.head('Parties').click();
    page.row('Company').click();
    await settle();
    return page;
  };

  it('reports what failed, keeping the count of what landed', async () => {
    const page = await chooseCompany({ sent: 2, failed: [{ name: 'Rope', error: 'nope' }] });
    const toast = page.toasts.at(-1);
    expect(toast?.type).toBe('warning');
    expect(toast?.content).toContain('Rope');
    expect(toast?.content).toContain('2');
  });

  it('shows the reason when a send is refused', async () => {
    const page = await chooseCompany(new Error('Neptunium is not active'));
    expect(page.toasts.at(-1)?.type).toBe('danger');
    expect(page.toasts.at(-1)?.content).toContain('Neptunium');
  });

  it('shows the reason when the actors cannot be read', async () => {
    const page = load({
      status: CONNECTED,
      targets: new Error('world went away'),
    });
    await settle();
    page.rivetSend(item);
    await settle();
    expect(page.picker()).toBeNull();
    expect(page.toasts.at(-1)?.content).toContain('world went away');
  });
});

describe('blocklist adds', () => {
  // Stand-ins for the site's own classes, declared the way its scripts declare
  // them: top-level classes, not properties of globalThis.
  const SITE_CLASSES = `
    var UrlUtil = { autoEncodeHash: (ent) => (ent.name + '_' + ent.source).toLowerCase() };
    var ExcludeUtil = { added: [], pExtendList: async (rows) => { ExcludeUtil.added.push(...rows); } };
    class ListPage {
      async _pDoMassBlocklist (ents) {
        await ExcludeUtil.pExtendList(ents.map((ent) => ({ hash: UrlUtil.autoEncodeHash(ent) })));
      }
    }
    class BlocklistUi {
      constructor () { this._excludes = []; }
      _addExclude (displayName, hash, category, source) {
        if (this._excludes.some((r) => r.hash === hash && r.category === category && r.source === source)) return false;
        this._excludes.push({ displayName, hash, category, source });
        return true;
      }
    }
  `;

  const sitePage = async () => {
    const page = load({ status: CONNECTED, blocklist_add: 1 });
    vm.runInContext(SITE_CLASSES, page.sandbox);
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    return page;
  };

  const rope = { name: 'Rope', source: 'PHB', __prop: 'item' };
  const hoodedLamp = { name: 'Lamp', source: 'PHB', __prop: 'item', _displayName: 'Lamp (Hooded)' };

  it('sends a list page blocklist to the app in one batch, and still blocks on the site', async () => {
    const page = await sitePage();
    await vm.runInContext('new ListPage()._pDoMassBlocklist(ents)', Object.assign(page.sandbox, { ents: [rope, hoodedLamp] }));
    await settle();

    const [call] = page.called('blocklist_add');
    expect(page.called('blocklist_add')).toHaveLength(1);
    expect(call.args.entries).toEqual([
      { displayName: 'Rope', hash: 'rope_phb', category: 'item', source: 'PHB', isAuto: false },
      { displayName: 'Lamp (Hooded)', hash: 'lamp_phb', category: 'item', source: 'PHB', isAuto: false },
    ]);
    expect(vm.runInContext('ExcludeUtil.added.length', page.sandbox)).toBe(2);
  });

  it("doesn't send blocklists the site loads from brews", async () => {
    const page = await sitePage();
    await vm.runInContext(
      'ExcludeUtil.pExtendList([{ hash: "x", category: "item", source: "PHB" }])',
      page.sandbox,
    );
    await settle();
    expect(page.called('blocklist_add')).toHaveLength(0);
  });

  it('sends only new rules from the Blocklist page, gathered into one batch', async () => {
    const page = await sitePage();
    const added = vm.runInContext(
      `const ui = new BlocklistUi();
       [ui._addExclude('Rope', 'rope_phb', 'item', 'PHB'),
        ui._addExclude('*', '*', '*', 'XGE'),
        ui._addExclude('Rope', 'rope_phb', 'item', 'PHB')]`,
      page.sandbox,
    );
    await settle();

    expect(added).toEqual([true, true, false]);
    const calls = page.called('blocklist_add');
    expect(calls).toHaveLength(1);
    expect((calls[0].args.entries as { hash: string }[]).map((e) => e.hash)).toEqual([
      'rope_phb',
      '*',
    ]);
  });

  it('says when the app could not take the rules', async () => {
    const page = load({ status: CONNECTED, blocklist_add: new Error('app closed') });
    vm.runInContext(SITE_CLASSES, page.sandbox);
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    await vm.runInContext('new ListPage()._pDoMassBlocklist([{ name: "Rope", source: "PHB", __prop: "item" }])', page.sandbox);
    await settle();
    expect(page.toasts.at(-1)).toMatchObject({ type: 'danger' });
    expect(page.toasts.at(-1)?.content).toContain('app closed');
  });
});

describe('shop adds', () => {
  // The site's page object as its scripts declare it, with an entry on show
  // and a pinned list.
  const siteClasses = (pageName: string) => `
    var UrlUtil = {
      PG_ITEMS: 'items.html',
      getCurrentPage: () => '${pageName}',
      // As the site's toUrlified: lower-cased after encoding too.
      autoEncodeHash: (ent) => encodeURIComponent(ent.name.toLowerCase()).toLowerCase() + '_' + ent.source.toLowerCase(),
    };
    class ListPage {
      constructor () {
        this._lastRender = {};
        this._dataList = [
          { name: '+1 Longsword', source: 'XDMG', value: 101500 },
          { name: 'Rope', source: 'PHB', value: 100 },
        ];
        this._sublistManager = {
          getSublistedEntityMetas: () => [
            { entity: this._dataList[1], count: 3 },
            { entity: { name: 'Lamp', source: 'PHB', _displayName: 'Lamp (Hooded)' } },
          ],
          _getCustomHashId: () => null,
        };
      }
      async pDoLoadHash (id) { this._lastRender.entity = this._dataList[id]; }
    }
  `;
  const SHOPS = [
    { file: 'goods.json', name: 'Goods', count: 4 },
    { file: 'smithy.json', name: 'Smithy', count: 2 },
  ];

  const sitePage = async ({
    pageName = 'items.html',
    add = {} as unknown,
    withMenu = false,
  } = {}) => {
    const page = load({
      status: CONNECTED,
      shop_list: SHOPS,
      shop_add: add instanceof Error ? add : { file: 'goods.json', name: 'Goods', added: 1, count: 5 },
    });
    vm.runInContext(siteClasses(pageName), page.sandbox);
    const tabs = new FakeElement('div');
    tabs.dataset.id = 'tabs-right';
    // The site's overflow menu, already built when the shop button arrives.
    const menu = new FakeElement('button');
    if (withMenu) {
      const icon = new FakeElement('span');
      icon.className = 'glyphicon glyphicon-option-vertical';
      menu.append(icon);
      tabs.append(menu);
    }
    page.body.append(tabs);
    page.documentStub.dispatchEvent(new Event('DOMContentLoaded'));
    await vm.runInContext('globalThis.itemsPage = new ListPage(); itemsPage.pDoLoadHash(0)', page.sandbox);
    await settle();
    const cardButton = () =>
      tabs.children.find((c) => c.className.includes('hm-add-shop-card')) as FakeElement | undefined;
    return { page, tabs, menu, cardButton };
  };

  it('adds the item on show to a chosen shop, with what the site shows for it', async () => {
    const { page, cardButton } = await sitePage();
    cardButton()!.click();
    await settle();
    expect(page.rowNames()).toEqual(['Goods', 'Smithy']);

    page.row('Goods').click();
    await settle();
    expect(page.called('shop_add').map((c) => c.args)).toEqual([
      {
        file: 'goods.json',
        entries: [{ h: '%2b1%20longsword_xdmg', c: 1, name: '+1 Longsword', source: 'XDMG', value: 101500 }],
      },
    ]);
    expect(page.picker()).toBeNull();
    expect(page.toasts.at(-1)).toMatchObject({ type: 'success' });
    expect(page.toasts.at(-1)?.content).toContain('+1 Longsword to Goods');
  });

  it('offers a new shop for a name no shop has, first, so Enter makes it', async () => {
    const { page, cardButton } = await sitePage();
    cardButton()!.click();
    await settle();
    page.type('Trollskull');
    expect(page.rowNames()).toEqual(['New shop “Trollskull”']);
    page.key('Enter');
    await settle();
    expect(page.called('shop_add')[0].args).toMatchObject({ name: 'Trollskull' });
  });

  it("doesn't offer a new shop for a name already taken", async () => {
    const { page, cardButton } = await sitePage();
    cardButton()!.click();
    await settle();
    page.type('goods');
    expect(page.rowNames()).toEqual(['Goods']);
  });

  it('adds the pinned list with its counts', async () => {
    const { page } = await sitePage();
    const group = new FakeElement('div');
    const reload = new FakeElement('button');
    reload.title = 'Reload Pinned List';
    group.append(reload);
    page.body.append(group);
    const pinned = new FakeElement('div');
    pinned.className = 've-lst__row';
    page.body.append(pinned);
    page.mutated();

    const shopButton = (group.nextElementSibling as FakeElement).children.find((c) =>
      c.className.includes('hm-add-shop'),
    ) as FakeElement;
    shopButton.click();
    await settle();
    page.row('Smithy').click();
    await settle();
    expect(page.called('shop_add')[0].args.entries).toEqual([
      { h: 'rope_phb', c: 3, name: 'Rope', source: 'PHB', value: 100 },
      { h: 'lamp_phb', c: 1, name: 'Lamp (Hooded)', source: 'PHB' },
    ]);
  });

  it('wraps its icon in a glyphicon, so the reskin sizes it as a square icon button', async () => {
    const { cardButton } = await sitePage();
    const html = (cardButton() as unknown as { innerHTML: string }).innerHTML;
    expect(html).toMatch(/^<span class="glyphicon"><svg[^]*<\/svg><\/span>$/);
  });

  it('sits just before the card’s overflow menu', async () => {
    const { page, tabs, menu, cardButton } = await sitePage({ withMenu: true });
    expect(menu.previousElementSibling).toBe(cardButton());
    page.mutated();
    expect(menu.previousElementSibling).toBe(cardButton());
    expect(tabs.children.filter((c) => c === cardButton())).toHaveLength(1);
  });

  it('leaves pages other than items and spells alone', async () => {
    const { cardButton } = await sitePage({ pageName: 'bestiary.html' });
    expect(cardButton()).toBeUndefined();
  });

  it('adds a spell from the spells page, marked as a spell with its level', async () => {
    const { page, cardButton } = await sitePage({ pageName: 'spells.html' });
    await vm.runInContext(
      "itemsPage._dataList[0] = { name: 'Fireball', source: 'XPHB', level: 3, value: 7 }; itemsPage.pDoLoadHash(0)",
      page.sandbox,
    );
    await settle();
    cardButton()!.click();
    await settle();
    page.row('Goods').click();
    await settle();
    expect(page.called('shop_add')[0].args.entries).toEqual([
      { h: 'fireball_xphb', c: 1, name: 'Fireball', source: 'XPHB', page: 'spells.html', level: 3 },
    ]);
  });

  it('says when the manager could not add', async () => {
    const { page, cardButton } = await sitePage({ add: new Error('disk full') });
    cardButton()!.click();
    await settle();
    page.row('Goods').click();
    await settle();
    expect(page.toasts.at(-1)).toMatchObject({ type: 'danger' });
    expect(page.toasts.at(-1)?.content).toContain('disk full');
  });
});
