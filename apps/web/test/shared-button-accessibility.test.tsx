import React from 'react';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import postcss from 'postcss';
import { renderToStaticMarkup } from 'react-dom/server';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import { Button, type ButtonSize } from '../../../packages/ui/src/button';

const requireFromRoot = createRequire(resolve('package.json'));

function renderedClasses(markup: string) {
  return markup.match(/class="([^"]+)"/)?.[1]?.split(' ') ?? [];
}

describe('shared button accessibility', () => {
  const sizes: ButtonSize[] = ['sm', 'md', 'lg'];

  it.each(sizes)('keeps the %s target at least 48px on both axes and text at 16px', (size) => {
    const classes = renderedClasses(renderToStaticMarkup(<Button size={size}>Apply</Button>));
    expect(classes).toContain('min-w-12');
    expect(classes).toContain(size === 'lg' ? 'min-h-[50px]' : 'min-h-12');
    expect(classes).toContain('text-base');
  });

  it('uses palette tokens and keeps keyboard focus visible without a transition', () => {
    const classes = renderedClasses(renderToStaticMarkup(<Button>Apply</Button>));
    expect(classes).toEqual(expect.arrayContaining([
      'bg-[theme(colors.brand.orange)]',
      'hover:bg-[theme(colors.brand.orange-hover)]',
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-charcoal',
      'focus-visible:ring-2',
      'focus-visible:ring-white',
      'motion-safe:transition-[background-color,color,border-color,transform]',
    ]));
    expect(classes).not.toContain('transition-all');
  });

  it('honors reduced motion and keeps the loading submit state', () => {
    const markup = renderToStaticMarkup(
      <Button type="submit" isLoading className="w-full">Apply</Button>,
    );
    expect(markup).toContain('motion-safe:animate-spin');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('type="submit"');
    expect(renderedClasses(markup)).toContain('w-full');
    expect(markup).toContain('Apply');
  });

  it('keeps caller background overrides ahead in the generated CSS cascade', async () => {
    const raw = renderToStaticMarkup(
      <Button className="bg-amber-600 hover:bg-amber-700 bg-orange-600 hover:bg-orange-700">
        Apply
      </Button>,
    );
    const config = requireFromRoot('./apps/web/tailwind.config.js');
    const result = await postcss([tailwindcss({ ...config, content: [{ raw, extension: 'html' }] })])
      .process('@tailwind utilities;', { from: undefined });
    const rules: string[] = [];
    result.root.walkRules((rule) => { rules.push(rule.selector.replace(/\\/g, '')); });

    const primary = rules.indexOf('.bg-[theme(colors.brand.orange)]');
    const hover = rules.indexOf('.hover:bg-[theme(colors.brand.orange-hover)]:hover');
    expect(primary).toBeGreaterThanOrEqual(0);
    expect(hover).toBeGreaterThanOrEqual(0);
    expect(rules.indexOf('.bg-amber-600')).toBeGreaterThan(primary);
    expect(rules.indexOf('.bg-orange-600')).toBeGreaterThan(primary);
    expect(rules.indexOf('.hover:bg-amber-700:hover')).toBeGreaterThan(hover);
    expect(rules.indexOf('.hover:bg-orange-700:hover')).toBeGreaterThan(hover);
  });
});
