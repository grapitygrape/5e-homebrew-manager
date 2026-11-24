// Shared selectors, icons, and injected stylesheet for the site browser window.

export const SEND_BUTTON = 'button[title^="Send to Foundry"]';
export const LIST_RELOAD_BUTTON = 'button[title="Reload Pinned List"]';
export const PINNED_ROW = '#sublist .ve-lst__row';
export const CARD_SEND_SOURCE = `#pagecontent ${SEND_BUTTON}`;
// The reskinned site's own card send button and overflow menu, in #tabs-right.
export const SITE_CARD_SEND = '.detail-bar-send-to-foundry';
export const CARD_MENU_ICON = '#tabs-right .glyphicon-option-vertical';

// An awning over a counter, drawn in strokes. It sits in a glyphicon span, as the
// site's icons do: the reskin sizes a button as a square only when its sole child
// is a .glyphicon.
export const SHOP_ICON = `<span class="glyphicon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12l1.5 4a2 2 0 0 1-3.75.9 2 2 0 0 1-3.75 0 2 2 0 0 1-3.75 0A2 2 0 0 1 .5 6zM2 8.5V14h12V8.5M6.5 14v-3.5h3V14"/></svg></span>`;

export const STYLES = `
  /* ── Site Browser - Disabled Send Buttons ───────────────────────────────── */
  html[data-hm-foundry="off"] ${SEND_BUTTON} {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Site Browser - Send And Clear Buttons ──────────────────────────────── */
  .hm-list-actions {
    flex-shrink: 0;
    margin-inline-start: 0.4rem;
  }

  /* ── Site Browser - Item Card Send Button ───────────────────────────────── */
  /* Only on a site without its own card send button. After the site's buttons. */
  .hm-send-card {
    order: 1;
  }
  :where(html:has(.hm-send-card)) #pagecontent ${SEND_BUTTON} {
    display: none;
  }

  /* ── Site Browser - Add To Shop Buttons ─────────────────────────────────── */
  .hm-add-shop svg {
    display: inline-block;
    inline-size: 1em;
    block-size: 1em;
    vertical-align: -0.125em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.3;
    stroke-linejoin: round;
  }

  /* ── Target Picker - Layout ─────────────────────────────────────────────── */
  /* The site sets its root font to 10px, so 1rem here is 10px. */
  .hm-target-picker {
    position: fixed;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    inline-size: 36rem;
    max-block-size: min(80vh, 56rem);
    padding: 0.8rem;
  }
  .hm-target-title {
    padding-inline: 0.8rem;
    font-weight: bold;
  }
  .hm-target-list {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow-y: auto;
  }

  /* ── Target Picker - Rows ───────────────────────────────────────────────── */
  /* In :where() so the site's menu classes win on color and hover. */
  :where(.hm-target-row, .hm-target-group-head) {
    display: flex;
    flex-shrink: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: 1.2rem;
    inline-size: 100%;
    padding-block: 0.4rem;
    padding-inline: 0.8rem;
    border: 0;
    background: transparent;
    font: inherit;
    text-align: start;
  }
  .hm-target-group-head {
    font-weight: bold;
  }
  .hm-target-chevron {
    display: inline-block;
    inline-size: 1.6rem;
  }
  .hm-target-row-indented {
    padding-inline-start: 2.4rem;
  }
  .hm-target-name,
  .hm-target-folder {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hm-target-folder,
  .hm-target-count,
  .hm-target-empty {
    opacity: 0.6;
  }
  .hm-target-folder {
    flex-shrink: 1;
    font-size: 0.85em;
  }
  .hm-target-empty {
    padding: 0.8rem;
  }

  /* ── Target Picker - States ─────────────────────────────────────────────── */
  .hm-target-row:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .hm-target-row[data-active] {
    outline: 0.0625rem solid currentColor;
    outline-offset: -0.0625rem;
  }
`;
