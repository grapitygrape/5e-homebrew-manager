// The Homebrew Parser is an in-browser editor (CodeMirror 6 needs the DOM), so
// render it client-side only. Avoids SSR importing/constructing the editor.
export const ssr = false;
