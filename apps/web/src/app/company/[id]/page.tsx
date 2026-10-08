import React from 'react';

interface CompanyPageProps {
  params: {
    id: string;
  };
}

export default async function PublicCompanyPage({ params }: CompanyPageProps) {
  const companyId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let companyData = {
    companyName: 'MSME Enterprise',
    ownershipType: 'Proprietorship',
    companySize: 'Micro',
    sector: 'Manufacturing',
    address: 'Industrial Area',
    city: 'Indore',
    district: 'Indore',
  };

  try {
    const res = await fetch(`${apiUrl}/profiles/business/${companyId}`, { next: { revalidate: 60 } });
    if (res.ok) {
      companyData = await res.json();
    }
  } catch {
    // Fallback to default companyData
  }

  // JSON-LD structured data for Google indexing (PRD 9 / EMP-02)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: companyData.companyName,
    address: {
      '@type': 'PostalAddress',
      addressLocality: companyData.city,
      addressRegion: companyData.district,
      streetAddress: companyData.address,
    },
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900">{companyData.companyName}</h1>
        <div className="mt-2 flex gap-2">
          <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded font-medium">
            {companyData.companySize} Enterprise
          </span>
          <span className="bg-green-100 text-green-800 text-xs px-2.5 py-0.5 rounded font-medium">
            {companyData.ownershipType}
          </span>
        </div>
        <p className="mt-4 text-gray-600">
          <strong>Sector:</strong> {companyData.sector}
        </p>
        <p className="mt-2 text-gray-600">
          <strong>Location:</strong> {companyData.address}, {companyData.city}, {companyData.district}
        </p>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Company QR Code</h2>
          <p className="text-sm text-gray-500">Scan or download QR code for this business profile.</p>
          <img
            src={`${apiUrl}/profiles/business/${companyId}/qr`}
            alt={`QR code for ${companyData.companyName}`}
            className="mt-4 w-48 h-48 border rounded p-2"
          />
        </div>
      </div>
    </main>
  );
}
