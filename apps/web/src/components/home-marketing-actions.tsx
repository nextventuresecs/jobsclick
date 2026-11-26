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

export function MobileJobsAction({ href, label }: {
  readonly href: string;
  readonly label: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const form = document.getElementById('home-job-search');
    const footer = document.getElementById('home-footer');
    if (!form || !footer || typeof IntersectionObserver === 'undefined') return;

    const update = () => {
      const formIsAbove = form.getBoundingClientRect().bottom <= 64;
      const footerIsBelow = footer.getBoundingClientRect().top >= window.innerHeight;
      setShow(formIsAbove && footerIsBelow);
    };
    const observer = new IntersectionObserver(update, { rootMargin: '-64px 0px 0px' });
    observer.observe(form);
    observer.observe(footer);
    return () => observer.disconnect();
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
