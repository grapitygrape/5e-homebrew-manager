// Safe hook execution and one-time error/missing-hook reporting for supersession.
// A bug in supersession must never break rendering, filtering, or page load.

export const tryOr = (failedHooks, label, fn, fnFallback) => {
  try {
    return fn();
  } catch (e) {
    if (!failedHooks.has(label)) {
      failedHooks.add(label);
      console.error(`[supersede] ${label} failed; using the stock behaviour`, e);
      if (failedHooks.size === 1) {
        try {
          JqueryUtil.doToast({
            type: 'danger',
            content:
              'Content replacement hit an error and is partly off. See the console for details.',
            autoHideTime: 15000,
          });
        } catch {
          // No toast available; the console error already went out.
        }
      }
    }
    return fnFallback();
  }
};

export const warnMissingHooks = (missing) => {
  if (!missing.length) return;
  console.warn(
    `[supersede] could not install ${missing.length} hook(s) — upstream probably renamed them; supersession is degraded:`,
    missing,
  );
};
