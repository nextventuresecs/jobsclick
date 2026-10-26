'use client';

import React from 'react';
import { ProfileQrShareCard } from '../../common/ProfileQrShareCard';
import type { CompanyItem } from '../../../data/sampleCompanies';

interface WalkInQrCardProps {
  readonly company: CompanyItem;
}

export function WalkInQrCard({ company }: WalkInQrCardProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProfileQrShareCard
        title={company.name}
        subtitle={`${company.sector} • ${company.enterpriseSize} Enterprise`}
        path={`/company/${company.id}`}
        badgeText="Factory Gate & Entrance Walk-in QR Poster"
        description="Display this official QR code at your factory main gate, security cabin, or office reception. Job seekers scan with their smartphone camera to view open positions and apply with verified digital CVs."
        downloadFileName={`${company.name}-walkin-poster`}
        isMsme={company.isMsme ?? true}
        udyamOrAffiliation={company.udyamNumber}
        locationText={`${company.address}, ${company.city}`}
      />
    </div>
  );
}
