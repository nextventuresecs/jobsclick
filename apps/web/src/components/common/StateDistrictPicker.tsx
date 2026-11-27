'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type {
  LocationDistrict,
  LocationPincodeResponse,
  LocationState,
} from '@indian-job-portal/validation';

const NOT_LISTED_VALUE = '__other__';

export interface StateDistrictSelection {
  readonly stateCode: number | null;
  readonly districtId: string | null;
  readonly stateName: string;
  readonly districtName: string;
  readonly pincode?: string;
}

export interface StateDistrictPickerProps {
  readonly stateCode: number | null;
  readonly districtId: string | null;
  readonly stateName: string;
  readonly districtName: string;
  readonly pincode?: string;
  readonly showPincode?: boolean;
  readonly required?: boolean;
  readonly onChange: (next: StateDistrictSelection) => void;
  readonly initialStates?: readonly LocationState[];
  readonly initialDistricts?: readonly LocationDistrict[];
}

export function getLocalizedLocationName(
  item: { readonly nameEn: string; readonly nameHi?: string | null },
  locale: string,
): string {
  if (locale === 'hi' && item.nameHi && item.nameHi.trim().length > 0) {
    return item.nameHi;
  }
  return item.nameEn;
}

export function applyPincodeLookupResult(
  current: StateDistrictSelection,
  lookup: LocationPincodeResponse,
  locale: string,
  hasUserSelection: boolean,
): {
  next: StateDistrictSelection;
  status: 'ambiguous' | 'suggested' | 'preserved';
} {
  if (hasUserSelection) {
    return { next: current, status: lookup.ambiguous ? 'ambiguous' : 'preserved' };
  }

  if (lookup.ambiguous || !lookup.districtId || !lookup.district) {
    return {
      next: {
        ...current,
        districtId: null,
      },
      status: 'ambiguous',
    };
  }

  return {
    next: {
      ...current,
      stateCode: lookup.stateCode,
      districtId: lookup.districtId,
      stateName: lookup.state ? getLocalizedLocationName(lookup.state, locale) : current.stateName,
      districtName: getLocalizedLocationName(lookup.district, locale),
    },
    status: 'suggested',
  };
}

const controlClass =
  'min-h-12 w-full px-3 py-2 text-base rounded-xl border border-gray-300 bg-white text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal';

export function StateDistrictPicker({
  stateCode,
  districtId,
  stateName,
  districtName,
  pincode = '',
  showPincode = true,
  required = false,
  onChange,
  initialStates,
  initialDistricts,
}: StateDistrictPickerProps) {
  const locale = useLocale();
  const t = useTranslations('LocationPicker');
  const baseId = useId();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const [states, setStates] = useState<readonly LocationState[]>(initialStates ?? []);
  const [districts, setDistricts] = useState<readonly LocationDistrict[]>(initialDistricts ?? []);
  const [customStateMode, setCustomStateMode] = useState(
    stateCode === null && stateName.trim().length > 0,
  );
  const [customDistrictMode, setCustomDistrictMode] = useState(
    districtId === null && districtName.trim().length > 0,
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const [pinStatus, setPinStatus] = useState<'idle' | 'checking' | 'ambiguous' | 'suggested' | 'not-found'>('idle');
  const [pinSummary, setPinSummary] = useState<{ district: string; state: string } | null>(null);

  const hasUserSelectionRef = useRef(stateCode !== null || districtId !== null);
  const latestSelectionRef = useRef<StateDistrictSelection>({
    stateCode,
    districtId,
    stateName,
    districtName,
    pincode,
  });
  latestSelectionRef.current = { stateCode, districtId, stateName, districtName, pincode };

  useEffect(() => {
    if (initialStates && initialStates.length > 0) return;
    let active = true;
    fetch(`${apiUrl}/locations/states`, { headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('STATES_LOAD_FAILED'))))
      .then((data: { states?: LocationState[] }) => {
        if (!active) return;
        if (Array.isArray(data.states)) {
          setStates(data.states);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [apiUrl, initialStates]);

  useEffect(() => {
    if (stateCode === null) {
      if (!initialDistricts) setDistricts([]);
      return;
    }
    if (initialDistricts && initialDistricts.length > 0 && initialDistricts.every((d) => d.stateCode === stateCode)) {
      setDistricts(initialDistricts);
      return;
    }
    let active = true;
    fetch(`${apiUrl}/locations/districts?state=${encodeURIComponent(String(stateCode))}`, {
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('DISTRICTS_LOAD_FAILED'))))
      .then((data: { districts?: LocationDistrict[] }) => {
        if (!active) return;
        if (Array.isArray(data.districts)) {
          setDistricts(data.districts);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [apiUrl, initialDistricts, stateCode]);

  const lastCheckedPinRef = useRef<string>('');
  useEffect(() => {
    if (!showPincode) return;
    const clean = pincode.trim();
    if (!/^[1-9]\d{5}$/.test(clean)) {
      setPinStatus('idle');
      setPinSummary(null);
      lastCheckedPinRef.current = '';
      return;
    }
    if (clean === lastCheckedPinRef.current) return;
    lastCheckedPinRef.current = clean;

    let active = true;
    setPinStatus('checking');
    fetch(`${apiUrl}/locations/pincode/${clean}`, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (res.status === 404) {
          if (active) {
            setPinStatus('not-found');
            setPinSummary(null);
          }
          return;
        }
        if (!res.ok) throw new Error('PIN_LOOKUP_FAILED');
        const lookup = (await res.json()) as LocationPincodeResponse;
        if (!active) return;

        const applied = applyPincodeLookupResult(
          latestSelectionRef.current,
          lookup,
          locale,
          hasUserSelectionRef.current,
        );
        if (applied.status === 'suggested') {
          setCustomStateMode(false);
          setCustomDistrictMode(false);
          setPinStatus('suggested');
          setPinSummary({
            district: applied.next.districtName,
            state: applied.next.stateName,
          });
          onChange(applied.next);
        } else if (applied.status === 'ambiguous') {
          setPinStatus('ambiguous');
          setPinSummary(null);
          if (!hasUserSelectionRef.current) {
            onChange(applied.next);
          }
        } else {
          setPinStatus('idle');
        }
      })
      .catch(() => {
        if (active) {
          setPinStatus('idle');
        }
      });

    return () => {
      active = false;
    };
  }, [apiUrl, locale, onChange, pincode, showPincode]);

  const stateSelectValue = customStateMode
    ? NOT_LISTED_VALUE
    : stateCode !== null
      ? String(stateCode)
      : '';

  const districtSelectValue = customDistrictMode || customStateMode
    ? NOT_LISTED_VALUE
    : districtId ?? '';

  const handleStateSelect = (value: string) => {
    hasUserSelectionRef.current = true;
    if (value === NOT_LISTED_VALUE) {
      setCustomStateMode(true);
      setCustomDistrictMode(true);
      onChange({
        stateCode: null,
        districtId: null,
        stateName: '',
        districtName: '',
        ...(showPincode ? { pincode } : {}),
      });
      return;
    }

    setCustomStateMode(false);
    setCustomDistrictMode(false);
    if (!value) {
      onChange({
        stateCode: null,
        districtId: null,
        stateName: '',
        districtName: '',
        ...(showPincode ? { pincode } : {}),
      });
      return;
    }

    const code = Number(value);
    const chosen = states.find((s) => s.lgdCode === code);
    onChange({
      stateCode: code,
      districtId: null,
      stateName: chosen ? getLocalizedLocationName(chosen, locale) : '',
      districtName: '',
      ...(showPincode ? { pincode } : {}),
    });
  };

  const handleDistrictSelect = (value: string) => {
    hasUserSelectionRef.current = true;
    if (value === NOT_LISTED_VALUE) {
      setCustomDistrictMode(true);
      onChange({
        stateCode,
        districtId: null,
        stateName,
        districtName: '',
        ...(showPincode ? { pincode } : {}),
      });
      return;
    }

    setCustomDistrictMode(false);
    if (!value) {
      onChange({
        stateCode,
        districtId: null,
        stateName,
        districtName: '',
        ...(showPincode ? { pincode } : {}),
      });
      return;
    }

    const chosen = districts.find((d) => d.id === value);
    onChange({
      stateCode,
      districtId: value,
      stateName,
      districtName: chosen ? getLocalizedLocationName(chosen, locale) : '',
      ...(showPincode ? { pincode } : {}),
    });
  };

  return (
    <div className="space-y-3 sm:col-span-3">
      <div className={`grid grid-cols-1 gap-4 ${showPincode ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {showPincode && (
          <div>
            <label htmlFor={`${baseId}-pincode`} className="mb-1 block text-base font-semibold text-gray-700">
              {t('pincodeLabel')}
            </label>
            <input
              id={`${baseId}-pincode`}
              autoComplete="postal-code"
              inputMode="numeric"
              type="text"
              maxLength={6}
              placeholder={t('pincodePlaceholder')}
              value={pincode}
              onChange={(e) => {
                onChange({
                  stateCode,
                  districtId,
                  stateName,
                  districtName,
                  pincode: e.target.value,
                });
              }}
              className={`${controlClass} font-mono`}
            />
          </div>
        )}

        <div>
          <label htmlFor={`${baseId}-state`} className="mb-1 block text-base font-semibold text-gray-700">
            {t('stateLabel')} {required && <span className="text-red-500">*</span>}
          </label>
          <select
            id={`${baseId}-state`}
            value={stateSelectValue}
            onChange={(e) => handleStateSelect(e.target.value)}
            className={controlClass}
            required={required && !customStateMode}
          >
            <option value="">{t('selectState')}</option>
            {states.map((s) => (
              <option key={s.lgdCode} value={String(s.lgdCode)}>
                {getLocalizedLocationName(s, locale)}
              </option>
            ))}
            <option value={NOT_LISTED_VALUE}>{t('notListed')}</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${baseId}-district`} className="mb-1 block text-base font-semibold text-gray-700">
            {t('districtLabel')} {required && <span className="text-red-500">*</span>}
          </label>
          <select
            id={`${baseId}-district`}
            value={districtSelectValue}
            onChange={(e) => handleDistrictSelect(e.target.value)}
            disabled={!customStateMode && stateCode === null && !customDistrictMode}
            className={`${controlClass} disabled:bg-gray-100 disabled:text-gray-500`}
            required={required && !customDistrictMode && !customStateMode}
          >
            <option value="">{t('selectDistrict')}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {getLocalizedLocationName(d, locale)}
              </option>
            ))}
            <option value={NOT_LISTED_VALUE}>{t('notListed')}</option>
          </select>
        </div>
      </div>

      {(customStateMode || customDistrictMode) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {customStateMode && (
            <div>
              <label htmlFor={`${baseId}-custom-state`} className="mb-1 block text-base font-semibold text-gray-700">
                {t('customStateLabel')} {required && <span className="text-red-500">*</span>}
              </label>
              <input
                id={`${baseId}-custom-state`}
                autoComplete="address-level1"
                type="text"
                value={stateName}
                onChange={(e) => {
                  hasUserSelectionRef.current = true;
                  onChange({
                    stateCode: null,
                    districtId: null,
                    stateName: e.target.value,
                    districtName,
                    ...(showPincode ? { pincode } : {}),
                  });
                }}
                className={controlClass}
                required={required}
              />
            </div>
          )}

          <div>
            <label htmlFor={`${baseId}-custom-district`} className="mb-1 block text-base font-semibold text-gray-700">
              {t('customDistrictLabel')} {required && <span className="text-red-500">*</span>}
            </label>
            <input
              id={`${baseId}-custom-district`}
              autoComplete="address-level3"
              type="text"
              value={districtName}
              onChange={(e) => {
                hasUserSelectionRef.current = true;
                onChange({
                  stateCode,
                  districtId: null,
                  stateName,
                  districtName: e.target.value,
                  ...(showPincode ? { pincode } : {}),
                });
              }}
              className={controlClass}
              required={required}
            />
          </div>
        </div>
      )}

      {loadFailed && (
        <p role="status" className="text-sm text-gray-text">
          {t('loadError')}
        </p>
      )}

      {showPincode && pinStatus === 'checking' && (
        <p role="status" className="text-sm text-gray-text">
          {t('pincodeChecking')}
        </p>
      )}
      {showPincode && pinStatus === 'ambiguous' && (
        <p role="status" className="text-sm text-amber-800">
          {t('pincodeAmbiguous')}
        </p>
      )}
      {showPincode && pinStatus === 'suggested' && pinSummary && (
        <p role="status" className="text-sm text-gray-text">
          {t('pincodeSuggested', pinSummary)}
        </p>
      )}
      {showPincode && pinStatus === 'not-found' && (
        <p role="status" className="text-sm text-gray-text">
          {t('pincodeNotFound')}
        </p>
      )}
    </div>
  );
}
