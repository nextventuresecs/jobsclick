import React from 'react';

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy & DPDP Disclosures</h1>

      <div className="bg-white rounded-lg shadow p-6 border border-gray-200 space-y-6 text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Data Protection & Digital Personal Data Protection (DPDP)</h2>
          <p>
            The Indian Job Portal platform complies with Digital Personal Data Protection (DPDP) principles. We collect personal data strictly with explicit consent for job matching and platform verification.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Candidate Privacy Protection (Hard Invariant #1)</h2>
          <p>
            Employers and third parties never see a job seeker&apos;s phone number or email address on candidate profiles. All initial contact happens exclusively through verified platform messaging.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Aadhaar & APAAR Identity Verification (Hard Invariant #8)</h2>
          <p>
            Aadhaar and APAAR ID submission is entirely optional. Full Aadhaar numbers are <strong>never stored</strong> on our servers. Only the last 4 digits are recorded alongside verification status flags after user consent is logged.
          </p>
        </section>

        <section className="pt-4 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Request Data Deletion</h2>
          <p className="mb-4">
            Under DPDP guidelines, you have the right to request full erasure of your account and personal data at any time.
          </p>
          <button className="px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700">
            Submit Account Erasure Request
          </button>
        </section>
      </div>
    </main>
  );
}
