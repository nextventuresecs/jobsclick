import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { review: { type: 'string' }, snapshot: { type: 'string' }, 'postal-total': { type: 'string' } },
});
assert.equal(positionals.length, 3,
  'Usage: node scripts/geo/verify-districts.mjs <states.csv> <districts.csv> <post-offices.csv> [--postal-total N] [--review file.csv --snapshot legacy|publisher]');

function readCsv(path, required) {
  const bytes = readFileSync(path);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF+/, '');
  const rows = parse(source, {
    columns: (header) => {
      const names = header.map((name) => name.trim().toLowerCase());
      assert.equal(new Set(names).size, names.length, `${path} has duplicate CSV headers`);
      for (const field of required) assert.ok(names.includes(field), `${path} is missing ${field}`);
      return names;
    },
    skip_empty_lines: true,
    trim: true,
  });
  assert.ok(rows.length, `${path} has no CSV records`);
  return { rows, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function normalized(value) {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

function pair(state, district) {
  return JSON.stringify([normalized(state), normalized(district)]);
}

const [statesPath, districtsPath, postPath] = positionals;
const states = readCsv(statesPath, ['state_code', 'state_name_english']);
const districts = readCsv(districtsPath, ['state_code', 'state_name_english', 'district_code', 'district_name_english']);
const post = readCsv(postPath, ['officename', 'pincode', 'statename', 'district']);

if (values['postal-total'] !== undefined) {
  const expected = Number(values['postal-total']);
  assert.ok(Number.isSafeInteger(expected) && expected > 0, 'The publisher postal total must be a positive integer');
  assert.equal(post.rows.length, expected, 'Postal CSV does not match the publisher record count');
}

const statesByCode = new Map();
for (const row of states.rows) {
  assert.match(row.state_code, /^[1-9]\d*$/);
  assert.ok(row.state_name_english, `State ${row.state_code} has no English name`);
  assert.ok(!statesByCode.has(row.state_code), `Duplicate state code ${row.state_code}`);
  statesByCode.set(row.state_code, normalized(row.state_name_english));
}
assert.equal(new Set(statesByCode.values()).size, statesByCode.size, 'Duplicate state names');

const districtsByCode = new Map();
const districtStates = new Set();
const districtKeys = new Set();
for (const row of districts.rows) {
  assert.match(row.district_code, /^[1-9]\d*$/);
  assert.ok(row.district_name_english, `District ${row.district_code} has no English name`);
  assert.ok(!districtsByCode.has(row.district_code), `Duplicate district code ${row.district_code}`);
  assert.equal(statesByCode.get(row.state_code), normalized(row.state_name_english),
    `District ${row.district_code} has an unknown or inconsistent parent state`);
  const key = pair(row.state_name_english, row.district_name_english);
  assert.ok(!districtKeys.has(key), `Duplicate LGD name pair ${key}`);
  districtStates.add(row.state_code);
  districtKeys.add(key);
  districtsByCode.set(row.district_code, row);
}
assert.equal(districtStates.size, statesByCode.size, 'LGD districts do not cover every listed state or UT');

const postalPairs = new Map();
const pinLabels = new Map();
const pins = new Set();
let rejectedPostalRows = 0;
let rowsWithMissingAdministrativeLabels = 0;
for (const row of post.rows) {
  if (!row.officename || !row.statename || !row.district || !/^[1-9]\d{5}$/.test(row.pincode)) {
    rejectedPostalRows++;
    continue;
  }
  const key = pair(row.statename, row.district);
  const group = postalPairs.get(key) ?? { records: 0, pins: new Set() };
  group.records++;
  group.pins.add(row.pincode);
  postalPairs.set(key, group);
  if (normalized(row.statename) === 'NA' || normalized(row.district) === 'NA') rowsWithMissingAdministrativeLabels++;

  const labels = pinLabels.get(row.pincode) ?? new Set();
  labels.add(key);
  pinLabels.set(row.pincode, labels);
  pins.add(row.pincode);
}

const unmatched = [...postalPairs.keys()].filter((key) => !districtKeys.has(key)).sort().map((key) => {
  const [state, district] = JSON.parse(key);
  const group = postalPairs.get(key);
  return {
    state, district,
    officeRows: group.records,
    distinctPins: group.pins.size,
    pinsWithOtherLabels: [...group.pins].filter((pin) => pinLabels.get(pin).size > 1).length,
  };
});

let reviewKinds;
if (values.review) {
  assert.ok(['legacy', 'publisher'].includes(values.snapshot), 'The review needs --snapshot legacy or --snapshot publisher');
  const review = readCsv(values.review, ['snapshot', 'postal_state', 'postal_district', 'kind', 'lgd_codes', 'evidence_url', 'note']);
  const outstanding = new Set(unmatched.map((row) => pair(row.state, row.district)));
  reviewKinds = { 'label-confirmed': 0, 'boundary-review': 0, 'office-conflict': 0, 'missing-label': 0 };
  for (const row of review.rows) {
    assert.ok(['both', 'legacy', 'publisher'].includes(row.snapshot), `Unknown review snapshot ${row.snapshot}`);
    if (row.snapshot !== 'both' && row.snapshot !== values.snapshot) continue;
    const key = pair(row.postal_state, row.postal_district);
    assert.ok(outstanding.delete(key), `Unexpected or duplicate review pair ${key}`);
    assert.ok(Object.hasOwn(reviewKinds, row.kind), `Unknown review kind ${row.kind}`);
    assert.ok(row.note && new URL(row.evidence_url).protocol === 'https:', `Missing evidence for ${key}`);
    const codes = row.lgd_codes ? row.lgd_codes.split('|') : [];
    if (row.kind === 'missing-label') {
      assert.ok(!codes.length && [row.postal_state, row.postal_district].some((label) => normalized(label) === 'NA'),
        `Missing administrative labels must have no candidate codes for ${key}`);
    } else {
      assert.ok(codes.length, `Missing LGD candidates for ${key}`);
      if (row.kind === 'label-confirmed') assert.equal(codes.length, 1, `A confirmed label needs one code for ${key}`);
    }
    assert.equal(new Set(codes).size, codes.length, `Duplicate candidate codes for ${key}`);
    for (const code of codes) {
      const candidate = districtsByCode.get(code);
      assert.ok(candidate && normalized(candidate.state_name_english) === normalized(row.postal_state),
        `Unknown or out-of-state candidate ${code} for ${key}`);
    }
    reviewKinds[row.kind]++;
  }
  assert.equal(outstanding.size, 0, `Missing review pairs: ${[...outstanding].join(', ')}`);
}

const unmatchedOfficeRows = unmatched.reduce((sum, row) => sum + row.officeRows, 0);
console.log(JSON.stringify({
  sources: { statesSha256: states.sha256, districtsSha256: districts.sha256, postalSha256: post.sha256 },
  states: statesByCode.size,
  districts: districtsByCode.size,
  postalRows: post.rows.length,
  rejectedPostalRows,
  rowsWithMissingAdministrativeLabels,
  distinctPins: pins.size,
  pinsWithMultiplePostalLabels: [...pinLabels.values()].filter((labels) => labels.size > 1).length,
  exactNameOfficeRows: post.rows.length - rejectedPostalRows - unmatchedOfficeRows,
  unmatchedOfficeRows,
  unmatchedPairs: unmatched.length,
  reviewKinds,
  unmatched,
}, null, 2));
