'use client';

import { useState } from 'react';
import type { InstitutionProfileData } from '../../../data/sampleWorkspaces';

export function useInstitutionProfileState(initialInstitution: InstitutionProfileData) {
  const [formInstName, setFormInstName] = useState(initialInstitution.institutionName);
  const [formInstType, setFormInstType] = useState<InstitutionProfileData['institutionType']>(initialInstitution.institutionType);
  const [formAffiliation, setFormAffiliation] = useState(initialInstitution.affiliation);
  const [formAffiliationCode, setFormAffiliationCode] = useState(initialInstitution.affiliationCode);
  const [formEstablishmentYear, setFormEstablishmentYear] = useState(initialInstitution.establishmentYear);
  const [formPrincipalName, setFormPrincipalName] = useState(initialInstitution.principalName);
  const [formContactPerson, setFormContactPerson] = useState(initialInstitution.contactPerson);
  const [formContactDesignation, setFormContactDesignation] = useState(initialInstitution.contactDesignation);
  const [formContactEmail, setFormContactEmail] = useState(initialInstitution.contactEmail);
  const [formContactPhone, setFormContactPhone] = useState(initialInstitution.contactPhone);
  const [formWebsite, setFormWebsite] = useState(initialInstitution.website);
  const [formAddress, setFormAddress] = useState(initialInstitution.address);
  const [formCity, setFormCity] = useState(initialInstitution.city);
  const [formDistrict, setFormDistrict] = useState(initialInstitution.district);
  const [formState, setFormState] = useState(initialInstitution.state);
  const [formPincode, setFormPincode] = useState(initialInstitution.pincode);
  const [formTradesInput, setFormTradesInput] = useState(initialInstitution.tradesOffered.join(', '));
  const [formAnnualCapacity, setFormAnnualCapacity] = useState(initialInstitution.annualCapacity);
  const [formBrochureUrl, setFormBrochureUrl] = useState(initialInstitution.placementBrochureUrl || '');
  const [formAbout, setFormAbout] = useState(initialInstitution.about);

  return {
    formInstName, setFormInstName,
    formInstType, setFormInstType,
    formAffiliation, setFormAffiliation,
    formAffiliationCode, setFormAffiliationCode,
    formEstablishmentYear, setFormEstablishmentYear,
    formPrincipalName, setFormPrincipalName,
    formContactPerson, setFormContactPerson,
    formContactDesignation, setFormContactDesignation,
    formContactEmail, setFormContactEmail,
    formContactPhone, setFormContactPhone,
    formWebsite, setFormWebsite,
    formAddress, setFormAddress,
    formCity, setFormCity,
    formDistrict, setFormDistrict,
    formState, setFormState,
    formPincode, setFormPincode,
    formTradesInput, setFormTradesInput,
    formAnnualCapacity, setFormAnnualCapacity,
    formBrochureUrl, setFormBrochureUrl,
    formAbout, setFormAbout,
  };
}
