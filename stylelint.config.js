/** @type {import('stylelint').Config} */
export default {
  customSyntax: 'postcss-html',
  // Generated copies from mimic-ui, linted there.
  ignoreFiles: ['src/lib/ui/mimic/**'],
  rules: {
    'declaration-block-single-line-max-declarations': 1,
  },
};
