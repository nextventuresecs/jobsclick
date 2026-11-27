'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import { useApp } from '../context/AppContext';

export function HireWorkersAction({ label, workspacePath }: {
  readonly label: string;
  readonly workspacePath: string;
}) {
  const app = useApp();
  const className = 'inline-flex min-h-14 w-full items-center gap-3 rounded-xl border border-gray-muted bg-white p-4 text-left font-semibold text-charcoal hover:bg-brand-orange-light active:bg-brand-orange-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal';
  const content = <><BriefcaseBusiness aria-hidden="true" className="h-6 w-6 shrink-0 text-brand-orange" />{label}</>;

  if (app.isAuthenticated && app.currentUserRole === 'employer') {
    return <Link href={workspacePath} className={className}>{content}</Link>;
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (app.isAuthenticated) app.openRoleSwitcher();
        else app.openAuthModal('employer');
      }}
    >
      {content}
    </button>
  );
}

export function observeMobileJobsAction(
  form: Element,
  footer: Element,
  onFormAbove: (value: boolean) => void,
  onFooterBelow: (value: boolean) => void,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
): () => void {
  const formObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      const rootTop = entry.rootBounds?.top ?? 64;
      onFormAbove(!entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop);
    },
    { rootMargin: '-64px 0px 0px 0px' },
  );

  const footerObserver = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    const rootBottom = entry.rootBounds?.bottom ?? viewportHeight;
    onFooterBelow(!entry.isIntersecting && entry.boundingClientRect.top >= rootBottom);
  });

  formObserver.observe(form);
  footerObserver.observe(footer);

  return () => {
    formObserver.disconnect();
    footerObserver.disconnect();
  };
}

export function MobileJobsAction({ href, label }: {
  readonly href: string;
  readonly label: string;
}) {
  const [formAbove, setFormAbove] = useState(false);
  const [footerBelow, setFooterBelow] = useState(true);
  const show = formAbove && footerBelow;

  useEffect(() => {
    const form = document.getElementById('home-job-search');
    const footer = document.getElementById('home-footer');
    if (!form || !footer || typeof IntersectionObserver === 'undefined') return;
    return observeMobileJobsAction(form, footer, setFormAbove, setFooterBelow);
  }, []);

  if (!show) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:hidden">
      <Link
        href={href}
        className="pointer-events-auto flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-orange px-4 text-center font-semibold text-white hover:bg-brand-orange-hover active:bg-brand-orange-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-charcoal"
      >
        {label}
      </Link>
    </div>
  );
}
