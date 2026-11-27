import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomePage from '../src/app/page';
import { observeMobileJobsAction } from '../src/components/home-marketing-actions';

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'hi',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('../src/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('../src/components/layout/Footer', () => ({ Footer: () => null }));
vi.mock('../src/context/AppContext', () => ({
  useApp: () => ({ isAuthenticated: false }),
}));

describe('public homepage journeys', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('submits labelled searches and links to public routes in Hindi', async () => {
    const fetchJobs = vi.fn().mockResolvedValue(Response.json({
      jobs: [
        { slug: 'welder-pune', title: 'Welder', companyName: 'Example Works', companySlug: 'example-works', city: 'Pune' },
      ],
    }));
    vi.stubGlobal('fetch', fetchJobs);

    const page = renderToStaticMarkup(await HomePage());

    expect(fetchJobs).toHaveBeenCalledWith(expect.stringMatching(/\/jobs\?limit=4$/), expect.anything());
    expect(page).toContain('action="/hi/jobs"');
    expect(page).toContain('for="home-search-keyword"');
    expect(page).toContain('for="home-search-city"');
    expect(page).toContain('href="/hi/jobs/welder-pune"');
    expect(page).toContain('href="/hi/institutions"');
    expect(page).toContain('href="/hi/company"');
    expect(page).not.toContain('500+');
  });

  it('distinguishes an unavailable feed from an empty feed and leaves job search available', async () => {
    const fetchJobs = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ jobs: [] }));
    vi.stubGlobal('fetch', fetchJobs);

    const unavailable = renderToStaticMarkup(await HomePage());
    const empty = renderToStaticMarkup(await HomePage());

    expect(unavailable).toContain('recentJobsUnavailable');
    expect(unavailable).not.toContain('noRecentJobs');
    expect(empty).toContain('noRecentJobs');
    expect(empty).not.toContain('recentJobsUnavailable');
    expect(unavailable).toContain('action="/hi/jobs"');
  });

  it('tracks form and footer visibility with two separate IntersectionObservers', () => {
    type ObserverRecord = {
      callback: IntersectionObserverCallback;
      options?: IntersectionObserverInit;
      targets: Element[];
      disconnect: ReturnType<typeof vi.fn>;
    };
    const observers: ObserverRecord[] = [];
    class MockIntersectionObserver {
      private record: ObserverRecord;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = { callback, options, targets: [], disconnect: vi.fn() };
        observers.push(this.record);
      }
      observe = (target: Element) => {
        this.record.targets.push(target);
      };
      unobserve = vi.fn();
      disconnect = () => {
        this.record.disconnect();
      };
      takeRecords = () => [];
      root = null;
      rootMargin = '';
      thresholds = [];
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

    const form = { id: 'home-job-search' } as unknown as Element;
    const footer = { id: 'home-footer' } as unknown as Element;
    let formAbove = false;
    let footerBelow = true;

    const cleanup = observeMobileJobsAction(
      form,
      footer,
      (value) => { formAbove = value; },
      (value) => { footerBelow = value; },
      800,
    );

    expect(observers).toHaveLength(2);
    expect(observers[0]!.targets).toEqual([form]);
    expect(observers[0]!.options).toEqual({ rootMargin: '-64px 0px 0px 0px' });
    expect(observers[1]!.targets).toEqual([footer]);

    const formObserver = observers[0]!;
    const footerObserver = observers[1]!;
    const emit = (obs: ObserverRecord, entry: Partial<IntersectionObserverEntry>) => {
      obs.callback([entry as IntersectionObserverEntry], obs as unknown as IntersectionObserver);
    };

    // Scrolling past the search form shows the sticky CTA while footer is below
    emit(formObserver, {
      isIntersecting: false,
      boundingClientRect: { bottom: 40 } as DOMRectReadOnly,
      rootBounds: { top: 64, bottom: 800 } as DOMRectReadOnly,
    });
    expect(formAbove).toBe(true);
    expect(formAbove && footerBelow).toBe(true);

    // Reaching the footer hides the sticky CTA
    emit(footerObserver, {
      isIntersecting: true,
      boundingClientRect: { top: 750 } as DOMRectReadOnly,
      rootBounds: { top: 0, bottom: 800 } as DOMRectReadOnly,
    });
    expect(footerBelow).toBe(false);
    expect(formAbove && footerBelow).toBe(false);

    // Scrolling back up above the footer restores the sticky CTA
    emit(footerObserver, {
      isIntersecting: false,
      boundingClientRect: { top: 820 } as DOMRectReadOnly,
      rootBounds: { top: 0, bottom: 800 } as DOMRectReadOnly,
    });
    expect(footerBelow).toBe(true);
    expect(formAbove && footerBelow).toBe(true);

    // Scrolling back into the search form hides the sticky CTA
    emit(formObserver, {
      isIntersecting: true,
      boundingClientRect: { bottom: 120 } as DOMRectReadOnly,
      rootBounds: { top: 64, bottom: 800 } as DOMRectReadOnly,
    });
    expect(formAbove).toBe(false);
    expect(formAbove && footerBelow).toBe(false);

    cleanup();
    expect(formObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(footerObserver.disconnect).toHaveBeenCalledTimes(1);
  });
});
