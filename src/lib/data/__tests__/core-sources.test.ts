/** Tests for core source abbreviations and colours read from the 5etools site. */
import { describe, it, expect } from 'vitest';
import { parseCoreSources } from '../core-sources.ts';

// Shapes copied from 5etools' js/parser.js and css/main.css.
const PARSER_JS = `
Parser.SRC_PHB = "PHB";
Parser.SRC_XPHB = "XPHB";
Parser.SRC_XGE = "XGE";
Parser.SRC_NRH_ASS = "NRH-ASS"; // lmao
Parser.SRC_PS_PREFIX = "PS";
Parser.SRC_PSA = \`\${Parser.SRC_PS_PREFIX}A\`;
Parser.SOURCE_JSON_TO_FULL[Parser.SRC_PHB] = "Player's Handbook (2014)";
Parser.SOURCE_JSON_TO_ABV = {};
Parser.SOURCE_JSON_TO_ABV[Parser.SRC_PHB] = "PHB'14";
Parser.SOURCE_JSON_TO_ABV[Parser.SRC_XPHB] = "PHB'24";
Parser.SOURCE_JSON_TO_ABV[Parser.SRC_PSA] = "PSA";
`;

const MAIN_CSS =
  '.ve-source__XGE,.ve-source__PotA,.ve-source__PHB{color:#4a6898 !important;border-color:#4a6898 !important}' +
  '.ve-night-mode .ve-source__PHB{color:#337ab7 !important}' +
  '.ve-source__XPHB{color:#ed7c00 !important}' +
  '.ve-night-mode .ve-source__XPHB{color:#d98d2a !important}' +
  '.ve-source__NRH-ASS{color:#123456 !important}' +
  '.unrelated{color:#ffffff}';

describe('parseCoreSources', () => {
  const ix = parseCoreSources(PARSER_JS, MAIN_CSS);

  it('maps a json id to its display abbreviation and night colour', () => {
    expect(ix.get('xphb')).toEqual({
      json: 'XPHB',
      abbreviation: "PHB'24",
      color: '#d98d2a',
    });
    expect(ix.get('phb')).toEqual({
      json: 'PHB',
      abbreviation: "PHB'14",
      color: '#337ab7',
    });
  });
  it('takes the colour from a grouped selector', () => {
    expect(ix.get('xge')?.color).toBe('#4a6898');
  });
  it('keeps the json id when there is no abbreviation entry', () => {
    expect(ix.get('xge')?.abbreviation).toBe('XGE');
  });
  it('reads constants with trailing comments and template prefixes', () => {
    expect(ix.get('nrh-ass')).toEqual({
      json: 'NRH-ASS',
      abbreviation: 'NRH-ASS',
      color: '#123456',
    });
    expect(ix.get('psa')?.abbreviation).toBe('PSA');
  });
  it('leaves the colour empty for a source with no rule', () => {
    expect(ix.get('psa')?.color).toBe('');
  });
  it('is empty when the files are missing', () => {
    expect(parseCoreSources('', '').size).toBe(0);
  });
});
