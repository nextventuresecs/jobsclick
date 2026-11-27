import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

export const MANUAL_GAZETTE_DISTRICTS = [
  {
    state_code: 37,
    name_en: 'Sham',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh April 2026 notification: https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/',
  },
  {
    state_code: 37,
    name_en: 'Nubra',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh April 2026 notification: https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/',
  },
  {
    state_code: 37,
    name_en: 'Changthang',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh April 2026 notification: https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/',
  },
  {
    state_code: 37,
    name_en: 'Zanskar',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh April 2026 notification: https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/',
  },
  {
    state_code: 37,
    name_en: 'Drass',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh April 2026 notification: https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/',
  },
  {
    state_code: 37,
    name_en: 'Sankoo',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: null,
    notes: 'Ladakh Sankoo notification (Oct 2026): https://ladakh.gov.in/ladakh-administration-notifies-creation-of-sankoo-as-new-district-of-ut-ladakh/',
  },
  {
    state_code: 28,
    name_en: 'Markapuram',
    name_hi: null,
    is_active: true,
    source: 'manual-gazette',
    effective_from: '2025-12-31',
    notes: 'Andhra Pradesh gazette order (effective 2025-12-31): https://markapuram.ap.gov.in/documents/',
  },
];

function normalized(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function pairKey(state, district) {
  return JSON.stringify([normalized(state), normalized(district)]);
}

function extractHindiOrNull(localName) {
  const trimmed = String(localName ?? '').trim();
  return /[\u0900-\u097F]/.test(trimmed) ? trimmed : null;
}

function readCsvFile(filePath, requiredColumns) {
  const bytes = readFileSync(filePath);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF+/, '');
  const rows = parse(source, {
    columns: (header) => {
      const names = header.map((name) => name.trim().toLowerCase());
      assert.equal(new Set(names).size, names.length, `${filePath} has duplicate CSV headers`);
      for (const col of requiredColumns) {
        assert.ok(names.includes(col), `${filePath} is missing column ${col}`);
      }
      return names;
    },
    skip_empty_lines: true,
    trim: true,
  });
  assert.ok(rows.length > 0, `${filePath} has no CSV records`);
  return rows;
}

export function buildLocationSeedData({
  statesCsvPath,
  districtsCsvPath,
  postCsvPath,
  reviewCsvPath,
  expectedStatesCount = 36,
  expectedLgdDistrictsCount = 785,
  expectedDistinctPinsCount = 19586,
}) {
  const stateRows = readCsvFile(statesCsvPath, [
    'state_code',
    'state_name_english',
    'state_name_local',
    'state_or_ut',
  ]);
  const districtRows = readCsvFile(districtsCsvPath, [
    'state_code',
    'state_name_english',
    'district_code',
    'district_name_english',
    'district_name_local',
  ]);
  const postRows = readCsvFile(postCsvPath, ['officename', 'pincode', 'statename', 'district']);
  const reviewRows = readCsvFile(reviewCsvPath, [
    'snapshot',
    'postal_state',
    'postal_district',
    'kind',
    'lgd_codes',
    'evidence_url',
    'note',
  ]);

  const states = [];
  const stateByCode = new Map();
  const stateCodeByName = new Map();
  for (const row of stateRows) {
    assert.match(row.state_code, /^[1-9]\d*$/, `Invalid state_code: ${row.state_code}`);
    const lgdCode = Number(row.state_code);
    assert.ok(!stateByCode.has(lgdCode), `Duplicate state_code ${lgdCode}`);
    const nameEn = row.state_name_english.trim();
    assert.ok(nameEn.length > 0, `Empty state_name_english for ${lgdCode}`);
    const record = {
      lgd_code: lgdCode,
      name_en: nameEn,
      name_hi: extractHindiOrNull(row.state_name_local),
      is_ut: normalized(row.state_or_ut) === 'U',
    };
    states.push(record);
    stateByCode.set(lgdCode, record);
    stateCodeByName.set(normalized(nameEn), lgdCode);
  }
  assert.equal(states.length, expectedStatesCount, `Expected ${expectedStatesCount} states, got ${states.length}`);

  const lgdDistricts = [];
  const districtByLgdCode = new Map();
  const lgdCodeByPair = new Map();
  for (const row of districtRows) {
    assert.match(row.district_code, /^[1-9]\d*$/, `Invalid district_code: ${row.district_code}`);
    const lgdCode = Number(row.district_code);
    const stateCode = Number(row.state_code);
    assert.ok(!districtByLgdCode.has(lgdCode), `Duplicate district_code ${lgdCode}`);
    const parentState = stateByCode.get(stateCode);
    assert.ok(parentState, `District ${lgdCode} references unknown state_code ${stateCode}`);
    const nameEn = row.district_name_english.trim();
    assert.ok(nameEn.length > 0, `Empty district_name_english for ${lgdCode}`);

    const record = {
      lgd_code: lgdCode,
      state_code: stateCode,
      name_en: nameEn,
      name_hi: extractHindiOrNull(row.district_name_local),
      is_active: true,
      source: 'lgd',
      effective_from: null,
      notes: null,
    };
    lgdDistricts.push(record);
    districtByLgdCode.set(lgdCode, record);
    lgdCodeByPair.set(pairKey(parentState.name_en, nameEn), lgdCode);
  }
  assert.equal(
    lgdDistricts.length,
    expectedLgdDistrictsCount,
    `Expected ${expectedLgdDistrictsCount} LGD districts, got ${lgdDistricts.length}`,
  );

  for (const manual of MANUAL_GAZETTE_DISTRICTS) {
    assert.ok(stateByCode.has(manual.state_code), `Manual district ${manual.name_en} references unknown state ${manual.state_code}`);
  }

  const reviewByPair = new Map();
  for (const row of reviewRows) {
    if (row.snapshot !== 'both' && row.snapshot !== 'publisher') continue;
    const key = pairKey(row.postal_state, row.postal_district);
    const codes = row.lgd_codes
      ? row.lgd_codes.split('|').map((c) => Number(c.trim())).filter((n) => Number.isSafeInteger(n))
      : [];
    reviewByPair.set(key, { kind: row.kind, codes });
  }

  const pinBuckets = new Map();
  for (const row of postRows) {
    if (!row.officename || !row.statename || !row.district || !/^[1-9]\d{5}$/.test(row.pincode)) {
      continue;
    }
    let bucket = pinBuckets.get(row.pincode);
    if (!bucket) {
      bucket = {
        pincode: row.pincode,
        stateCodes: new Set(),
        candidateLgdCodes: new Set(),
        hasNaLabel: false,
        hasAmbiguousReview: false,
      };
      pinBuckets.set(row.pincode, bucket);
    }

    const stateNorm = normalized(row.statename);
    const districtNorm = normalized(row.district);
    if (stateNorm === 'NA' || districtNorm === 'NA') {
      bucket.hasNaLabel = true;
      continue;
    }

    const stateCodeFromName = stateCodeByName.get(stateNorm);
    if (stateCodeFromName !== undefined) {
      bucket.stateCodes.add(stateCodeFromName);
    }

    const key = pairKey(row.statename, row.district);
    const exactCode = lgdCodeByPair.get(key);
    if (exactCode !== undefined) {
      bucket.candidateLgdCodes.add(exactCode);
      const dist = districtByLgdCode.get(exactCode);
      if (dist) bucket.stateCodes.add(dist.state_code);
      continue;
    }

    const reviewed = reviewByPair.get(key);
    assert.ok(reviewed, `Unreviewed postal state/district pair: ${row.statename} / ${row.district} (PIN ${row.pincode})`);
    if (reviewed.kind === 'missing-label') {
      bucket.hasNaLabel = true;
    } else {
      if (reviewed.kind !== 'label-confirmed' || reviewed.codes.length !== 1) {
        bucket.hasAmbiguousReview = true;
      }
      for (const code of reviewed.codes) {
        const dist = districtByLgdCode.get(code);
        assert.ok(dist, `Review references unknown LGD district code ${code}`);
        bucket.candidateLgdCodes.add(code);
        bucket.stateCodes.add(dist.state_code);
      }
    }
  }

  assert.equal(
    pinBuckets.size,
    expectedDistinctPinsCount,
    `Expected ${expectedDistinctPinsCount} distinct PINs, got ${pinBuckets.size}`,
  );

  const pincodes = [];
  for (const bucket of pinBuckets.values()) {
    const candidateLgdCodes = [...bucket.candidateLgdCodes].sort((a, b) => a - b);
    const stateCodes = [...bucket.stateCodes];
    const ambiguous =
      bucket.hasNaLabel ||
      bucket.hasAmbiguousReview ||
      candidateLgdCodes.length !== 1 ||
      stateCodes.length !== 1;

    pincodes.push({
      pincode: bucket.pincode,
      state_code: stateCodes.length === 1 ? stateCodes[0] : null,
      primary_district_lgd_code: ambiguous ? null : candidateLgdCodes[0],
      ambiguous,
      candidate_district_lgd_codes: ambiguous ? candidateLgdCodes : [],
    });
  }

  return {
    states,
    lgdDistricts,
    manualDistricts: MANUAL_GAZETTE_DISTRICTS,
    pincodes,
    counts: {
      states: states.length,
      lgdDistricts: lgdDistricts.length,
      manualDistricts: MANUAL_GAZETTE_DISTRICTS.length,
      pincodes: pincodes.length,
      ambiguousPincodes: pincodes.filter((p) => p.ambiguous).length,
      unambiguousPincodes: pincodes.filter((p) => !p.ambiguous).length,
    },
  };
}

async function seedDatabase(seedData) {
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  assert.ok(supabaseUrl && serviceRoleKey, 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed');

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Upsert states
  const { error: statesErr } = await db
    .from('states')
    .upsert(seedData.states, { onConflict: 'lgd_code' });
  if (statesErr) throw new Error(`Failed upserting states: ${statesErr.message}`);

  // 2. Fetch existing manual-gazette districts (lgd_code is null) so any newly
  //    assigned LGD code promotes the row in-place and preserves its UUID.
  const { data: existingManual, error: manualFetchErr } = await db
    .from('districts')
    .select('id, state_code, name_en')
    .is('lgd_code', null);
  if (manualFetchErr) throw new Error(`Failed querying manual districts: ${manualFetchErr.message}`);

  const existingByKey = new Map(
    (existingManual ?? []).map((r) => [`${r.state_code}:${String(r.name_en).trim().toLowerCase()}`, r.id]),
  );

  // 3. Promote matching manual-gazette rows and upsert remaining LGD districts
  const lgdToUuid = new Map();
  const lgdToUpsert = [];
  for (const district of seedData.lgdDistricts) {
    const k = `${district.state_code}:${district.name_en.trim().toLowerCase()}`;
    const existingId = existingByKey.get(k);
    if (existingId) {
      const { error } = await db.from('districts').update(district).eq('id', existingId);
      if (error) throw new Error(`Failed promoting manual district ${district.name_en}: ${error.message}`);
      lgdToUuid.set(district.lgd_code, existingId);
      existingByKey.delete(k);
    } else {
      lgdToUpsert.push(district);
    }
  }

  for (let i = 0; i < lgdToUpsert.length; i += 200) {
    const batch = lgdToUpsert.slice(i, i + 200);
    const { data, error } = await db
      .from('districts')
      .upsert(batch, { onConflict: 'lgd_code' })
      .select('id, lgd_code');
    if (error) throw new Error(`Failed upserting LGD districts batch ${i}: ${error.message}`);
    for (const row of data ?? []) {
      if (typeof row.lgd_code === 'number') {
        lgdToUuid.set(row.lgd_code, row.id);
      }
    }
  }
  assert.equal(lgdToUuid.size, seedData.lgdDistricts.length, 'Did not resolve UUIDs for all LGD districts');

  // 4. Idempotently upsert remaining manual-gazette districts (lgd_code is null)
  for (const manual of seedData.manualDistricts) {
    const k = `${manual.state_code}:${manual.name_en.trim().toLowerCase()}`;
    const existingId = existingByKey.get(k);
    if (existingId) {
      const { error } = await db.from('districts').update(manual).eq('id', existingId);
      if (error) throw new Error(`Failed updating manual district ${manual.name_en}: ${error.message}`);
    } else {
      const { error } = await db.from('districts').insert(manual);
      if (error) throw new Error(`Failed inserting manual district ${manual.name_en}: ${error.message}`);
    }
  }

  // 5. Validate all candidate UUIDs and upsert pincodes in batches
  const pincodeRows = seedData.pincodes.map((p) => {
    const primaryDistrictId =
      p.primary_district_lgd_code !== null ? lgdToUuid.get(p.primary_district_lgd_code) ?? null : null;
    if (!p.ambiguous) {
      assert.ok(primaryDistrictId, `Missing primary district UUID for unambiguous PIN ${p.pincode}`);
    }
    const candidateIds = p.candidate_district_lgd_codes.map((code) => {
      const id = lgdToUuid.get(code);
      assert.ok(id, `Missing candidate district UUID for LGD code ${code} on PIN ${p.pincode}`);
      return id;
    });
    return {
      pincode: p.pincode,
      state_code: p.state_code,
      district_id: primaryDistrictId,
      ambiguous: p.ambiguous,
      candidate_district_ids: candidateIds,
    };
  });

  for (let i = 0; i < pincodeRows.length; i += 500) {
    const batch = pincodeRows.slice(i, i + 500);
    const { error } = await db.from('pincodes').upsert(batch, { onConflict: 'pincode' });
    if (error) throw new Error(`Failed upserting pincodes batch ${i}: ${error.message}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'geo-dir': { type: 'string', default: '.scratch/jobsclick-geo' },
      review: { type: 'string', default: 'data/geo/district-label-review.csv' },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const geoDir = resolve(process.cwd(), values['geo-dir']);
  const seedData = buildLocationSeedData({
    statesCsvPath: resolve(geoDir, 'states-publisher-api.csv'),
    districtsCsvPath: resolve(geoDir, 'district-publisher-api.csv'),
    postCsvPath: resolve(geoDir, 'post-publisher-api-full.csv'),
    reviewCsvPath: resolve(process.cwd(), values.review),
  });

  if (!values['dry-run']) {
    await seedDatabase(seedData);
  }

  console.log(JSON.stringify({ dryRun: values['dry-run'], ...seedData.counts }, null, 2));
}

const isEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
