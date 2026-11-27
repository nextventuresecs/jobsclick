import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeekerFormData } from '../src/components/workspaces/seeker/seekerFormTypes';
import enMessages from '../messages/en.json';
import hiMessages from '../messages/hi.json';

type HookState = {
  states: unknown[];
  refs: Array<{ current: unknown }>;
  stateIndex: number;
  refIndex: number;
};

const hookState: HookState = {
  states: [],
  refs: [],
  stateIndex: 0,
  refIndex: 0,
};

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    default: {
      ...actual,
      useState: (initial: unknown) => {
        const idx = hookState.stateIndex++;
        if (!(idx in hookState.states)) {
          hookState.states[idx] = initial;
        }
        const setState = (next: unknown) => {
          hookState.states[idx] =
            typeof next === 'function'
              ? (next as (prev: unknown) => unknown)(hookState.states[idx])
              : next;
        };
        return [hookState.states[idx], setState];
      },
      useRef: (initial: unknown) => {
        const idx = hookState.refIndex++;
        if (!(idx in hookState.refs)) {
          hookState.refs[idx] = { current: initial };
        }
        return hookState.refs[idx];
      },
      useEffect: vi.fn(),
    },
    useState: (initial: unknown) => {
      const idx = hookState.stateIndex++;
      if (!(idx in hookState.states)) {
        hookState.states[idx] = initial;
      }
      const setState = (next: unknown) => {
        hookState.states[idx] =
          typeof next === 'function'
            ? (next as (prev: unknown) => unknown)(hookState.states[idx])
            : next;
      };
      return [hookState.states[idx], setState];
    },
    useRef: (initial: unknown) => {
      const idx = hookState.refIndex++;
      if (!(idx in hookState.refs)) {
        hookState.refs[idx] = { current: initial };
      }
      return hookState.refs[idx];
    },
    useEffect: vi.fn(),
  };
});

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (key: string) => `${ns}.${key}`,
}));

import { SeekerProfileForm } from '../src/components/workspaces/seeker/SeekerProfileForm';

const baseFormData: SeekerFormData = {
  formName: 'Asha Devi',
  formGender: 'Female',
  formDob: '2001-04-12',
  formSeekerType: 'individual',
  formAddress: '12 Main Road',
  formCity: 'Indore',
  formDistrict: 'Indore',
  formState: 'Madhya Pradesh',
  formPincode: '452001',
  formQualification: 'ITI Electrician',
  formInstitution: 'Govt ITI Indore',
  formGraduationYear: '2022',
  formExperienceYears: 1,
  formCurrentRole: 'Apprentice',
  formSkillsInput: 'Wiring, Safety',
  formLanguagesInput: 'Hindi, English',
  formLocationsInput: 'Indore, Pune',
  formWillingToRelocate: true,
  formBio: 'Certified ITI electrician.',
  formAadhaarLastFour: '',
  formApaarId: '',
  formDpdpConsent: true,
};

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

function renderTree(formData: SeekerFormData, onCancel: () => void) {
  hookState.stateIndex = 0;
  hookState.refIndex = 0;
  return SeekerProfileForm({
    formData,
    updateField: vi.fn(),
    onSubmit: vi.fn(),
    onCancel,
  });
}

function flattenText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (React.isValidElement(node)) {
    return flattenText((node.props as Record<string, unknown>)['children'] as React.ReactNode);
  }
  return '';
}

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

describe('SeekerProfileForm cancel discard confirmation (JS-02)', () => {
  beforeEach(() => {
    hookState.states = [];
    hookState.refs = [];
    hookState.stateIndex = 0;
    hookState.refIndex = 0;
  });

  it('closes immediately without prompt when Cancel is clicked on an untouched form', () => {
    const onCancel = vi.fn();
    const tree = renderTree({ ...baseFormData }, onCancel);

    expect(findElements(tree, (el) => el.props['role'] === 'alertdialog')).toHaveLength(0);

    const cancelBtn = findElements(
      tree,
      (el) => flattenText(el.props['children'] as React.ReactNode) === 'SeekerWorkspace.cancel',
    )[0];
    expect(cancelBtn).toBeDefined();

    (cancelBtn!.props['onClick'] as () => void)();

    expect(onCancel).toHaveBeenCalledTimes(1);
    const afterTree = renderTree({ ...baseFormData }, onCancel);
    expect(findElements(afterTree, (el) => el.props['role'] === 'alertdialog')).toHaveLength(0);
  });

  it('prompts before discarding when Cancel is clicked after editing formData', () => {
    const onCancel = vi.fn();
    renderTree({ ...baseFormData }, onCancel);

    const edited = { ...baseFormData, formCity: 'Bhopal' };
    const editedTree = renderTree(edited, onCancel);

    const cancelBtn = findElements(
      editedTree,
      (el) => flattenText(el.props['children'] as React.ReactNode) === 'SeekerWorkspace.cancel',
    )[0];
    (cancelBtn!.props['onClick'] as () => void)();

    expect(onCancel).not.toHaveBeenCalled();

    const promptedTree = renderTree(edited, onCancel);
    const dialogs = findElements(promptedTree, (el) => el.props['role'] === 'alertdialog');
    expect(dialogs).toHaveLength(1);
    expect(flattenText(dialogs[0])).toContain('SeekerWorkspace.discardChangesTitle');
    expect(flattenText(dialogs[0])).toContain('SeekerWorkspace.discardChangesDesc');

    // Keep editing closes the prompt without calling onCancel
    const keepBtn = findElements(
      dialogs[0],
      (el) => flattenText(el.props['children'] as React.ReactNode) === 'SeekerWorkspace.keepEditing',
    )[0];
    expect(keepBtn).toBeDefined();
    (keepBtn!.props['onClick'] as () => void)();
    expect(onCancel).not.toHaveBeenCalled();

    const afterKeepTree = renderTree(edited, onCancel);
    expect(findElements(afterKeepTree, (el) => el.props['role'] === 'alertdialog')).toHaveLength(0);

    // Re-opening Cancel prompt and confirming discard calls onCancel
    const cancelBtnAgain = findElements(
      afterKeepTree,
      (el) => flattenText(el.props['children'] as React.ReactNode) === 'SeekerWorkspace.cancel',
    )[0];
    (cancelBtnAgain!.props['onClick'] as () => void)();
    const rePrompted = renderTree(edited, onCancel);
    const discardBtn = findElements(
      rePrompted,
      (el) => flattenText(el.props['children'] as React.ReactNode) === 'SeekerWorkspace.discardChangesConfirm',
    )[0];
    expect(discardBtn).toBeDefined();
    (discardBtn!.props['onClick'] as () => void)();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps en.json and hi.json key parity with discard confirmation translations', () => {
    const enKeys = collectLeafKeys(enMessages).sort();
    const hiKeys = collectLeafKeys(hiMessages).sort();
    expect(enKeys).toEqual(hiKeys);
    expect(enKeys).toContain('SeekerWorkspace.discardChangesTitle');
    expect(enKeys).toContain('SeekerWorkspace.discardChangesDesc');
    expect(enKeys).toContain('SeekerWorkspace.discardChangesConfirm');
    expect(enKeys).toContain('SeekerWorkspace.keepEditing');
  });
});
