import React from 'react';

interface JobDetailPageProps {
  params: {
    id: string;
  };
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const jobId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let job = {
    id: jobId,
    title: 'Tally Accountant MSME',
    description: 'Looking for a qualified Tally accountant to handle daily accounts, GST filing, and bookkeeping.',
    category: 'white',
    city: 'Indore',
    district: 'Indore',
    minPay: 18000,
    maxPay: 25000,
    openings: 2,
    skills: ['Tally', 'GST', 'Excel'],
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${apiUrl}/jobs/${jobId}`, { next: { revalidate: 60 } });
    if (res.ok) {
      job = await res.json();
    }
  } catch {
    // Fallback
  }

  // Google JobPosting JSON-LD Structured Data (PRD 9 / JOB-02)
  const jobPostingJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.createdAt,
    employmentType: 'FULL_TIME',
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: job.city,
        addressRegion: job.district,
        addressCountry: 'IN',
      },
    },
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'INR',
      value: {
        '@type': 'QuantitativeValue',
        minValue: job.minPay,
        maxValue: job.maxPay,
        unitText: 'MONTH',
      },
    },
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
      />
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded font-medium capitalize">
          {job.category} Collar Category
        </span>
        <h1 className="text-3xl font-bold text-gray-900 mt-2">{job.title}</h1>
        <p className="text-gray-600 mt-1">
          📍 {job.city}, {job.district} | 💰 ₹{job.minPay.toLocaleString()} - ₹{job.maxPay.toLocaleString()} / month
        </p>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Job Description</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-line">{job.description}</p>
        </div>

        <div className="mt-6 border-t border-gray-200 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Required Skills</h2>
          <div className="flex flex-wrap gap-2">
            {job.skills.map((skill, i) => (
              <span key={i} className="bg-gray-100 text-gray-800 text-xs px-3 py-1 rounded">
                {skill}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 flex justify-between items-center">
          <span className="text-sm text-gray-500">Openings: {job.openings}</span>
          <button className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded hover:bg-blue-700">
            Apply Now
          </button>
        </div>
      </div>
    </main>
  );
}
