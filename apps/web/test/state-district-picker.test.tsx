import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LocationDistrict,
  LocationPincodeResponse,
  LocationState,
} from '@indian-job-portal/validation';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

let mockLocale = 'en';

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale,
  useTranslations: (ns: string) => (key: string, params?: Record<string, string>) => {
    const suffix = params ? `(${JSON.stringify(params)})` : '';
    return `${ns}.${key}${suffix}`;
  },
}));

import {
  StateDistrictPicker,
  applyPincodeLookupResult,
  getLocalizedLocationName,
} from '../src/components/common/StateDistrictPicker';

const STATES_FIXTURE: readonly LocationState[] = [
  { lgdCode: 23, nameEn: 'Madhya Pradesh', nameHi: 'मध्य प्रदेश', isUt: false },
  { lgdCode: 37, nameEn: 'Ladakh', nameHi: null, isUt: true },
];

const DISTRICTS_FIXTURE: readonly LocationDistrict[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    lgdCode: 416,
    stateCode: 23,
    nameEn: 'Indore',
    nameHi: 'इंदौर',
    source: 'lgd',
    isActive: true,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    lgdCode: null,
    stateCode: 37,
    nameEn: 'Sankoo',
    nameHi: null,
    source: 'manual-gazette',
    isActive: true,
  },
];

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectLeafKeys(v as Record<string, unknown>, next));
    } else {
      keys.push(next);
    }
  }
  return keys;
}

describe('StateDistrictPicker (JS-02 / EMP-01 / JOB-01 / INT-01)', () => {
  beforeEach(() => {
    mockLocale = 'en';
  });

  it('falls back to English name when Hindi label is null or empty', () => {
    expect(getLocalizedLocationName(STATES_FIXTURE[0]!, 'hi')).toBe('मध्य प्रदेश');
    expect(getLocalizedLocationName(STATES_FIXTURE[1]!, 'hi')).toBe('Ladakh');
    expect(getLocalizedLocationName({ nameEn: 'Indore', nameHi: '   ' }, 'hi')).toBe('Indore');
    expect(getLocalizedLocationName(STATES_FIXTURE[0]!, 'en')).toBe('Madhya Pradesh');
  });

  it('suggests state/district for unambiguous PIN, refuses auto-select for ambiguous PIN, and preserves user selection', () => {
    const base = {
      stateCode: null,
      districtId: null,
      stateName: '',
      districtName: '',
      pincode: '452001',
    };

    const exactLookup: LocationPincodeResponse = {
      pincode: '452001',
      stateCode: 23,
      districtId: DISTRICTS_FIXTURE[0]!.id,
      ambiguous: false,
      candidateDistrictIds: [],
      candidates: [],
      state: { lgdCode: 23, nameEn: 'Madhya Pradesh', nameHi: 'मध्य प्रदेश', isUt: false },
      district: {
        id: DISTRICTS_FIXTURE[0]!.id,
        lgdCode: 416,
        stateCode: 23,
        nameEn: 'Indore',
        nameHi: null,
        source: 'lgd',
        isActive: true,
      },
    };

    const suggested = applyPincodeLookupResult(base, exactLookup, 'hi', false);
    expect(suggested.status).toBe('suggested');
    expect(suggested.next.stateCode).toBe(23);
    expect(suggested.next.districtId).toBe(DISTRICTS_FIXTURE[0]!.id);
    expect(suggested.next.stateName).toBe('मध्य प्रदेश');
    expect(suggested.next.districtName).toBe('Indore'); // English fallback when nameHi is null

    const ambiguousLookup: LocationPincodeResponse = {
      pincode: '110001',
      stateCode: 7,
      districtId: null,
      ambiguous: true,
      candidateDistrictIds: [
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ],
      candidates: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          lgdCode: 71,
          stateCode: 7,
          nameEn: 'Central Delhi',
          nameHi: null,
          source: 'lgd',
          isActive: true,
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          lgdCode: 72,
          stateCode: 7,
          nameEn: 'New Delhi',
          nameHi: null,
          source: 'lgd',
          isActive: true,
        },
      ],
      state: { lgdCode: 7, nameEn: 'Delhi', nameHi: 'दिल्ली', isUt: true },
      district: null,
    };

    const ambiguousRes = applyPincodeLookupResult(base, ambiguousLookup, 'en', false);
    expect(ambiguousRes.status).toBe('ambiguous');
    expect(ambiguousRes.next.districtId).toBeNull();

    const manualChoice = {
      stateCode: 37,
      districtId: DISTRICTS_FIXTURE[1]!.id,
      stateName: 'Ladakh',
      districtName: 'Sankoo',
      pincode: '452001',
    };
    const preserved = applyPincodeLookupResult(manualChoice, exactLookup, 'en', true);
    expect(preserved.status).toBe('preserved');
    expect(preserved.next).toEqual(manualChoice);
  });

  it('renders labelled 48px selects, Not listed custom inputs, Hindi fallback, and optional PIN mode', () => {
    mockLocale = 'hi';
    const htmlWithPin = renderToStaticMarkup(
      <StateDistrictPicker
        stateCode={23}
        districtId={DISTRICTS_FIXTURE[0]!.id}
        stateName="मध्य प्रदेश"
        districtName="इंदौर"
        pincode="452001"
        showPincode
        required
        initialStates={STATES_FIXTURE}
        initialDistricts={DISTRICTS_FIXTURE}
        onChange={vi.fn()}
      />,
    );

    expect(htmlWithPin).toContain('autoComplete="postal-code"');
    expect(htmlWithPin).toContain('min-h-12');
    expect(htmlWithPin).toContain('<option value="__other__">LocationPicker.notListed</option>');
    expect(htmlWithPin).toContain('मध्य प्रदेश');
    expect(htmlWithPin).toContain('Ladakh'); // nameHi null -> English fallback
    expect(htmlWithPin).toContain('Sankoo'); // nameHi null -> English fallback

    const labelForMatches = [...htmlWithPin.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
    expect(labelForMatches.length).toBeGreaterThanOrEqual(3);
    for (const controlId of labelForMatches) {
      expect(htmlWithPin).toContain(`id="${controlId}"`);
    }

    const customHtml = renderToStaticMarkup(
      <StateDistrictPicker
        stateCode={null}
        districtId={null}
        stateName="Custom State"
        districtName="Custom Town"
        showPincode={false}
        initialStates={STATES_FIXTURE}
        initialDistricts={[]}
        onChange={vi.fn()}
      />,
    );

    expect(customHtml).not.toContain('autoComplete="postal-code"');
    expect(customHtml).toContain('value="Custom State"');
    expect(customHtml).toContain('value="Custom Town"');
  });

  it('maintains en.json and hi.json key parity with LocationPicker keys', () => {
    const enKeys = collectLeafKeys(enMessages).sort();
    const hiKeys = collectLeafKeys(hiMessages).sort();
    expect(enKeys).toEqual(hiKeys);
    expect(enKeys).toContain('LocationPicker.stateLabel');
    expect(enKeys).toContain('LocationPicker.districtLabel');
    expect(enKeys).toContain('LocationPicker.notListed');
    expect(enKeys).toContain('LocationPicker.pincodeAmbiguous');
    expect(enKeys).toContain('LocationPicker.pincodeSuggested');
  });
});
