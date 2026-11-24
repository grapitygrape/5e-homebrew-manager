// app.d.ts — ambient types for SvelteKit's App namespace.
// See https://svelte.dev/docs/kit/types#app. Extend Error/Locals/PageData as
// the app grows (e.g. add a typed `App.Error` shape for engine failures).
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Vendored PrismJS (loaded as a global script in app.html). Only the bits the
  // guides view calls are typed here.
  interface Window {
    Prism?: {
      highlightAllUnder: (container: Element | Document) => void;
      highlightElement: (element: Element) => void;
    };
  }
}

export {};
