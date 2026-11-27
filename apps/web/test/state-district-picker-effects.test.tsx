import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocationDistrict, LocationState } from '@indian-job-portal/validation';

interface EffectEntry {
  deps: unknown[] | undefined;
  cleanup: (() => void) | void;
}

const hookState = {
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  effects: [] as EffectEntry[],
  stateIndex: 0,
  refIndex: 0,
  effectIndex: 0,
  pendingEffects: [] as Array<() => void>,
};

function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (!prev || !next || prev.length !== next.length) return true;
  return next.some((v, i) => !Object.is(v, prev[i]));
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  const useState = (initial: unknown) => {
    const idx = hookState.stateIndex++;
    if (!(idx in hookState.states)) {
      hookState.states[idx] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    }
    const setState = (next: unknown) => {
      hookState.states[idx] =
        typeof next === 'function'
          ? (next as (prev: unknown) => unknown)(hookState.states[idx])
          : next;
    };
    return [hookState.states[idx], setState];
  };
  const useRef = (initial: unknown) => {
    const idx = hookState.refIndex++;
    if (!(idx in hookState.refs)) {
      hookState.refs[idx] = { current: initial };
    }
    return hookState.refs[idx];
  };
  const useEffect = (fn: () => (() => void) | void, deps?: unknown[]) => {
    const idx = hookState.effectIndex++;
    const prev = hookState.effects[idx];
    if (!prev || depsChanged(prev.deps, deps)) {
      hookState.pendingEffects.push(() => {
        if (prev?.cleanup) prev.cleanup();
        hookState.effects[idx] = { deps, cleanup: fn() };
      });
    }
  };
  const useId = () => ':r0:';
  return {
    ...actual,
    default: { ...actual, useState, useRef, useEffect, useId },
    useState,
    useRef,
    useEffect,
    useId,
  };
});

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

import { StateDistrictPicker } from '../src/components/common/StateDistrictPicker';

function renderPicker(props: React.ComponentProps<typeof StateDistrictPicker>) {
  hookState.stateIndex = 0;
  hookState.refIndex = 0;
  hookState.effectIndex = 0;
  hookState.pendingEffects = [];
  const tree = StateDistrictPicker(props);
  const effectsToRun = [...hookState.pendingEffects];
  hookState.pendingEffects = [];
  for (const run of effectsToRun) run();
  return tree;
}

function findElements(
  node: React.ReactNode,
  predicate: (el: React.ReactElement<Record<string, unknown>>) => boolean,
  found: Array<React.ReactElement<Record<string, unknown>>> = [],
): Array<React.ReactElement<Record<string, unknown>>> {
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, found);
    return found;
  }
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<Record<string, unknown>>;
    if (predicate(el)) found.push(el);
    findElements(el.props['children'] as React.ReactNode, predicate, found);
  }
  return found;
}

const STATES: readonly LocationState[] = [
  { lgdCode: 23, nameEn: 'Madhya Pradesh', nameHi: null, isUt: false },
  { lgdCode: 27, nameEn: 'Maharashtra', nameHi: null, isUt: false },
];

const MP_DISTRICTS: readonly LocationDistrict[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    lgdCode: 406,
    stateCode: 23,
    nameEn: 'Indore',
    nameHi: null,
    source: 'lgd',
    isActive: true,
  },
];

describe('StateDistrictPicker effect lifecycle (Findings 13 & 14)', () => {
  beforeEach(() => {
    hookState.states = [];
    hookState.refs = [];
    hookState.effects = [];
    hookState.pendingEffects = [];
  });

  it('does not abort or stall PIN lookup when parent rerenders with a new inline onChange', async () => {
    let resolvePin!: (res: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvePin = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const firstOnChange = vi.fn();
    const secondOnChange = vi.fn();

    renderPicker({
      stateCode: null,
      districtId: null,
      stateName: '',
      districtName: '',
      pincode: '452001',
      initialStates: STATES,
      onChange: firstOnChange,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstSignal = (fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal })?.signal;
    expect(firstSignal?.aborted).toBe(false);

    // Parent rerenders with new inline onChange while PIN fetch is still in flight
    renderPicker({
      stateCode: null,
      districtId: null,
      stateName: '',
      districtName: '',
      pincode: '452001',
      initialStates: STATES,
      onChange: secondOnChange,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstSignal?.aborted).toBe(false);

    resolvePin(
      new Response(
        JSON.stringify({
          pincode: '452001',
          stateCode: 23,
          districtId: MP_DISTRICTS[0]!.id,
          ambiguous: false,
          candidateDistrictIds: [],
          candidates: [],
          state: STATES[0],
          district: MP_DISTRICTS[0],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(secondOnChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stateCode: 23,
        districtId: MP_DISTRICTS[0]!.id,
      }),
    );
    vi.unstubAllGlobals();
  });

  it('clears stale districts and disables district select while new state districts are loading', async () => {
    let resolveDistricts!: (res: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveDistricts = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // First render with MP initial districts
    const tree1 = renderPicker({
      stateCode: 23,
      districtId: MP_DISTRICTS[0]!.id,
      stateName: 'Madhya Pradesh',
      districtName: 'Indore',
      initialStates: STATES,
      initialDistricts: MP_DISTRICTS,
      onChange: vi.fn(),
    });
    const options1 = findElements(tree1, (el) => el.type === 'option');
    expect(options1.some((o) => o.props['value'] === MP_DISTRICTS[0]!.id)).toBe(true);

    // Switch to stateCode 27 without initialDistricts matching 27 -> starts loading
    renderPicker({
      stateCode: 27,
      districtId: null,
      stateName: 'Maharashtra',
      districtName: '',
      initialStates: STATES,
      onChange: vi.fn(),
    });

    // Re-render to observe cleared districts + disabled select while loading
    const loadingTree = renderPicker({
      stateCode: 27,
      districtId: null,
      stateName: 'Maharashtra',
      districtName: '',
      initialStates: STATES,
      onChange: vi.fn(),
    });

    const selects = findElements(loadingTree, (el) => el.type === 'select');
    const districtSelect = selects[1];
    expect(districtSelect?.props['disabled']).toBe(true);
    const loadingOptions = findElements(loadingTree, (el) => el.type === 'option');
    expect(loadingOptions.some((o) => o.props['value'] === MP_DISTRICTS[0]!.id)).toBe(false);

    resolveDistricts(
      new Response(
        JSON.stringify({
          districts: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              lgdCode: 490,
              stateCode: 27,
              nameEn: 'Pune',
              nameHi: null,
              source: 'lgd',
              isActive: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await new Promise((r) => setTimeout(r, 0));

    const loadedTree = renderPicker({
      stateCode: 27,
      districtId: null,
      stateName: 'Maharashtra',
      districtName: '',
      initialStates: STATES,
      onChange: vi.fn(),
    });
    const loadedDistrictSelect = findElements(loadedTree, (el) => el.type === 'select')[1];
    expect(loadedDistrictSelect?.props['disabled']).toBe(false);
    const loadedOptions = findElements(loadedTree, (el) => el.type === 'option');
    expect(loadedOptions.some((o) => o.props['value'] === '22222222-2222-4222-8222-222222222222')).toBe(true);

    vi.unstubAllGlobals();
  });
});
