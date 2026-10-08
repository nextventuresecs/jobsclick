import React from 'react';
import Link from 'next/link';

interface JobsPageProps {
  searchParams?: {
    keyword?: string;
    city?: string;
    category?: string;
  };
}

export default async function JobsListPage({ searchParams }: JobsPageProps) {
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';
  const keyword = searchParams?.keyword || '';
  const city = searchParams?.city || '';
  const category = searchParams?.category || '';

  let jobs = [
    {
      id: 'job_sample_1',
      title: 'Tally Accountant',
      category: 'white',
      city: 'Indore',
      minPay: 18000,
      maxPay: 25000,
      openings: 2,
    },
  ];

  try {
    const res = await fetch(
      `${apiUrl}/jobs?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}&category=${encodeURIComponent(category)}`,
      { next: { revalidate: 30 } },
    );
    if (res.ok) {
      const data = await res.json();
      jobs = data.jobs || jobs;
    }
  } catch {
    // Fallback
  }

  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Explore Live Jobs in India</h1>

      {/* Filter Options */}
      <form className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-4 rounded-lg shadow border border-gray-200">
        <input
          type="text"
          name="keyword"
          placeholder="Search by keyword..."
          defaultValue={keyword}
          className="border rounded p-2 text-sm"
        />
        <input
          type="text"
          name="city"
          placeholder="Filter by city..."
          defaultValue={city}
          className="border rounded p-2 text-sm"
        />
        <select name="category" defaultValue={category} className="border rounded p-2 text-sm">
          <option value="">All Collar Categories</option>
          <option value="white">White Collar</option>
          <option value="blue">Blue Collar</option>
          <option value="grey">Grey Collar</option>
          <option value="open">Open Collar (Job Work)</option>
        </select>
        <button type="submit" className="bg-blue-600 text-white font-medium py-2 px-4 rounded hover:bg-blue-700">
          Search Jobs
        </button>
      </form>

      {/* Job Cards */}
      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.id} className="bg-white p-6 rounded-lg shadow border border-gray-200 flex justify-between items-center">
            <div>
              <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded font-medium capitalize">
                {job.category} Collar
              </span>
              <h2 className="text-xl font-semibold text-gray-900 mt-2">
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                📍 {job.city}, MP | 💰 ₹{job.minPay.toLocaleString()} - ₹{job.maxPay.toLocaleString()} / mo | 👥 {job.openings} Openings
              </p>
            </div>
            <Link
              href={`/jobs/${job.id}`}
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded hover:bg-gray-800"
            >
              View & Apply
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
