import React from 'react';
import { Button } from '@indian-job-portal/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
        Indian Job Portal
      </h1>
      <p className="mt-4 text-lg text-gray-600 max-w-xl">
        Empowering MSMEs, educational institutions, and job seekers with direct, transparent opportunities.
      </p>
      <div className="mt-8 flex gap-4">
        <Button>Get Started</Button>
      </div>
    </main>
  );
}
