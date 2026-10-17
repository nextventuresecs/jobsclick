'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { ProfileQrShareCard } from '../../common/ProfileQrShareCard';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';

interface CampusQrCardProps {
  readonly institution: InstitutionProfileData;
}

export function CampusQrCard({ institution }: CampusQrCardProps) {
  const t = useTranslations('InstitutionWorkspace');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProfileQrShareCard
        title={institution.institutionName}
        subtitle={`${institution.affiliation} • Established ${institution.establishmentYear}`}
        path={`/institution/${institution.id}`}
        badgeText={t('campusQrHeading')}
        description={t('campusQrSubheading')}
        downloadFileName={`${institution.institutionName}-campus-qr`}
        isInstitution={true}
        udyamOrAffiliation={institution.affiliationCode}
        locationText={`${institution.city}, ${institution.state}`}
      />
    </div>
  );
}
