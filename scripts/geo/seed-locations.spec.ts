import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLocationSeedData } from './seed-locations.mjs';

describe('scripts/geo/seed-locations.mjs', () => {
  const geoDir = resolve(process.cwd(), '.scratch/jobsclick-geo');
  const hasLocalGeoExports =
    existsSync(join(geoDir, 'states-publisher-api.csv')) &&
    existsSync(join(geoDir, 'district-publisher-api.csv')) &&
    existsSync(join(geoDir, 'post-publisher-api-full.csv'));

  it.skipIf(!hasLocalGeoExports)(
    'validates real publisher CSVs: 36 states, 785 LGD districts, 7 manual gazette rows, 19586 distinct PINs',
    () => {
      const result = buildLocationSeedData({
        statesCsvPath: join(geoDir, 'states-publisher-api.csv'),
        districtsCsvPath: join(geoDir, 'district-publisher-api.csv'),
        postCsvPath: join(geoDir, 'post-publisher-api-full.csv'),
        reviewCsvPath: resolve(process.cwd(), 'data/geo/district-label-review.csv'),
      });

      expect(result.counts.states).toBe(36);
      expect(result.counts.lgdDistricts).toBe(785);
      expect(result.counts.manualDistricts).toBe(7);
      expect(result.counts.pincodes).toBe(19586);
      expect(result.counts.unambiguousPincodes).toBeGreaterThan(17000);
      expect(result.counts.ambiguousPincodes).toBeGreaterThan(0);

      // Baruphatak / Khargone office-conflict PIN 451449 must be marked ambiguous
      const pin451449 = result.pincodes.find((p) => p.pincode === '451449');
      expect(pin451449).toBeDefined();
      expect(pin451449?.ambiguous).toBe(true);
      expect(pin451449?.primary_district_lgd_code).toBeNull();
      expect(pin451449?.candidate_district_lgd_codes.length).toBeGreaterThanOrEqual(2);
    },
  );

  it('collapses multi-district and NA PINs to ambiguous rows and fails on wrong counts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seed-locations-test-'));
    try {
      const statesPath = join(dir, 'states.csv');
      const districtsPath = join(dir, 'districts.csv');
      const postPath = join(dir, 'post.csv');
      const reviewPath = join(dir, 'review.csv');

      writeFileSync(
        statesPath,
        [
          'state_code,state_name_english,state_name_local,state_census2011_code,state_or_ut,last_updated',
          '23,"Madhya Pradesh","MADHYA PRADESH",23,S,2024-10-07',
          '37,"Ladakh","Ladakh",00,U,2024-10-07',
          '28,"Andhra Pradesh","ANDHRA PRADESH",28,S,2024-10-07',
        ].join('\n'),
      );
      writeFileSync(
        districtsPath,
        [
          'state_code,state_name_english,state_name_local,state_census2011_code,district_code,district_name_english,district_name_local,district_census2011_code',
          '23,"Madhya Pradesh","MADHYA PRADESH",23,406,"Indore","INDORE",439',
          '23,"Madhya Pradesh","MADHYA PRADESH",23,409,"Narmadapuram","NARMADAPURAM",449',
          '23,"Madhya Pradesh","MADHYA PRADESH",23,418,"Narsimhapur","NARSIMHAPUR",452',
        ].join('\n'),
      );
      writeFileSync(
        reviewPath,
        [
          'snapshot,postal_state,postal_district,kind,lgd_codes,evidence_url,note',
          'both,"MADHYA PRADESH","HOSHANGABAD","label-confirmed","409","https://narmadapuram.nic.in/","Renamed"',
          'publisher,"NA","NA","missing-label","","https://data.gov.in/","Missing"',
        ].join('\n'),
      );
      writeFileSync(
        postPath,
        [
          'circlename,regionname,divisionname,officename,pincode,officetype,delivery,district,statename,latitude,longitude',
          'MP,Indore,Indore,Indore GPO,452001,HO,Delivery,Indore,MADHYA PRADESH,22.7,75.8',
          'MP,Bhopal,Hoshangabad,Itarsi SO,461001,SO,Delivery,HOSHANGABAD,MADHYA PRADESH,22.6,77.7',
          'MP,Jabalpur,Narsinghpur,Office A,461001,BO,Delivery,Narsimhapur,MADHYA PRADESH,22.9,79.1',
          'NA,NA,NA,Unknown BO,452099,BO,Delivery,NA,NA,NA,NA',
        ].join('\n'),
      );

      const seeded = buildLocationSeedData({
        statesCsvPath: statesPath,
        districtsCsvPath: districtsPath,
        postCsvPath: postPath,
        reviewCsvPath: reviewPath,
        expectedStatesCount: 3,
        expectedLgdDistrictsCount: 3,
        expectedDistinctPinsCount: 3,
      });

      const pin452001 = seeded.pincodes.find((p) => p.pincode === '452001');
      expect(pin452001).toEqual({
        pincode: '452001',
        state_code: 23,
        primary_district_lgd_code: 406,
        ambiguous: false,
        candidate_district_lgd_codes: [],
      });

      const pin461001 = seeded.pincodes.find((p) => p.pincode === '461001');
      expect(pin461001).toEqual({
        pincode: '461001',
        state_code: 23,
        primary_district_lgd_code: null,
        ambiguous: true,
        candidate_district_lgd_codes: [409, 418],
      });

      const pin452099 = seeded.pincodes.find((p) => p.pincode === '452099');
      expect(pin452099).toEqual({
        pincode: '452099',
        state_code: null,
        primary_district_lgd_code: null,
        ambiguous: true,
        candidate_district_lgd_codes: [],
      });

      expect(() =>
        buildLocationSeedData({
          statesCsvPath: statesPath,
          districtsCsvPath: districtsPath,
          postCsvPath: postPath,
          reviewCsvPath: reviewPath,
          expectedStatesCount: 36,
          expectedLgdDistrictsCount: 3,
          expectedDistinctPinsCount: 3,
        }),
      ).toThrow(/Expected 36 states/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
