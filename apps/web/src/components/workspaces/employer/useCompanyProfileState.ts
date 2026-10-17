'use client';

import { useState } from 'react';
import type { CompanyItem } from '../../../data/sampleCompanies';

export function useCompanyProfileState(initialCompany: CompanyItem) {
  const [formOrgName, setFormOrgName] = useState(initialCompany.name);
  const [formOwnership, setFormOwnership] = useState<CompanyItem['ownershipType']>(initialCompany.ownershipType);
  const [formPhone, setFormPhone] = useState(initialCompany.phone || '9876543210');
  const [formEmail, setFormEmail] = useState(initialCompany.email || 'contact@company.in');
  const [formWebsite, setFormWebsite] = useState(initialCompany.website || 'www.company.in');
  const [formSector, setFormSector] = useState(initialCompany.sector);
  const [formYearReg, setFormYearReg] = useState(initialCompany.yearOfRegistration || '2019');
  const [formCommenceYear, setFormCommenceYear] = useState(initialCompany.commencementYear || '2018');
  const [formFounder, setFormFounder] = useState(initialCompany.founderOrDirector || 'Adhyant Patil');
  const [formDesignation, setFormDesignation] = useState(initialCompany.designation || 'Founder & Managing Director');
  const [formDirectorPhoto, setFormDirectorPhoto] = useState(initialCompany.directorPhotoUrl || '');
  const [formKnowMyBusiness, setFormKnowMyBusiness] = useState(initialCompany.knowMyBusiness || initialCompany.description);
  const [formProductsBrief, setFormProductsBrief] = useState(initialCompany.productsBrief || 'Precision CNC Machined Gears, Couplings');
  const [formServicesBrief, setFormServicesBrief] = useState(initialCompany.servicesBrief || 'VMC Milling, CMM Inspection, Heat Treatment');
  const [formAddress, setFormAddress] = useState(initialCompany.address);
  const [formCity, setFormCity] = useState(initialCompany.city);
  const [formDistrict, setFormDistrict] = useState(initialCompany.district);
  const [formState, setFormState] = useState(initialCompany.state);
  const [formCompanySize, setFormCompanySize] = useState<CompanyItem['enterpriseSize']>(initialCompany.enterpriseSize);
  const [formIsMsme, setFormIsMsme] = useState(initialCompany.isMsme ?? true);
  const [formUdyamNumber, setFormUdyamNumber] = useState(initialCompany.udyamNumber || 'UDYAM-MH-26-0019482');
  const [formIsDpiit, setFormIsDpiit] = useState(initialCompany.isDpiitStartup ?? true);
  const [formDpiitNumber, setFormDpiitNumber] = useState(initialCompany.dpiitNumber || 'DIPP-89102-MH');
  const [formInstagram, setFormInstagram] = useState(initialCompany.socialMedia?.instagram || 'https://instagram.com/enterprise');
  const [formFacebook, setFormFacebook] = useState(initialCompany.socialMedia?.facebook || 'https://facebook.com/enterprise');
  const [formYoutube, setFormYoutube] = useState(initialCompany.socialMedia?.youtube || 'https://youtube.com/@enterprise');
  const [formOtherSocial, setFormOtherSocial] = useState(initialCompany.socialMedia?.other || '');

  const syncFromBusinessProfile = (busProfile: {
    companyName?: string;
    sector?: string;
    address?: string;
    city?: string;
    district?: string;
    state?: string;
    ownershipType?: string;
    companySize?: string;
  }) => {
    if (busProfile.companyName) setFormOrgName(busProfile.companyName);
    if (busProfile.sector) setFormSector(busProfile.sector);
    if (busProfile.address) setFormAddress(busProfile.address);
    if (busProfile.city) setFormCity(busProfile.city);
    if (busProfile.district) setFormDistrict(busProfile.district);
    if (busProfile.state) setFormState(busProfile.state);
    if (busProfile.ownershipType) setFormOwnership(busProfile.ownershipType as CompanyItem['ownershipType']);
    if (busProfile.companySize) setFormCompanySize(busProfile.companySize as CompanyItem['enterpriseSize']);
  };

  const getUpdatedCompany = (prev: CompanyItem): CompanyItem => ({
    ...prev,
    name: formOrgName.trim(),
    ownershipType: formOwnership,
    phone: formPhone.trim(),
    email: formEmail.trim(),
    website: formWebsite.trim(),
    sector: formSector.trim(),
    yearOfRegistration: formYearReg.trim(),
    commencementYear: formCommenceYear.trim(),
    founderOrDirector: formFounder.trim(),
    designation: formDesignation.trim(),
    directorPhotoUrl: formDirectorPhoto.trim(),
    knowMyBusiness: formKnowMyBusiness.trim(),
    description: formKnowMyBusiness.trim(),
    productsBrief: formProductsBrief.trim(),
    servicesBrief: formServicesBrief.trim(),
    address: formAddress.trim(),
    city: formCity.trim(),
    district: formDistrict.trim(),
    state: formState.trim(),
    enterpriseSize: formCompanySize,
    isMsme: formIsMsme,
    udyamNumber: formIsMsme ? formUdyamNumber.trim().toUpperCase() : '',
    isDpiitStartup: formIsDpiit,
    dpiitNumber: formIsDpiit ? formDpiitNumber.trim() : '',
    socialMedia: {
      instagram: formInstagram.trim(),
      facebook: formFacebook.trim(),
      youtube: formYoutube.trim(),
      other: formOtherSocial.trim(),
    },
    verified: formIsMsme,
  });

  return {
    formData: {
      formOrgName, setFormOrgName,
      formOwnership, setFormOwnership,
      formPhone, setFormPhone,
      formEmail, setFormEmail,
      formWebsite, setFormWebsite,
      formSector, setFormSector,
      formYearReg, setFormYearReg,
      formCommenceYear, setFormCommenceYear,
      formFounder, setFormFounder,
      formDesignation, setFormDesignation,
      formDirectorPhoto, setFormDirectorPhoto,
      formKnowMyBusiness, setFormKnowMyBusiness,
      formProductsBrief, setFormProductsBrief,
      formServicesBrief, setFormServicesBrief,
      formAddress, setFormAddress,
      formCity, setFormCity,
      formDistrict, setFormDistrict,
      formState, setFormState,
      formCompanySize, setFormCompanySize,
      formIsMsme, setFormIsMsme,
      formUdyamNumber, setFormUdyamNumber,
      formIsDpiit, setFormIsDpiit,
      formDpiitNumber, setFormDpiitNumber,
      formInstagram, setFormInstagram,
      formFacebook, setFormFacebook,
      formYoutube, setFormYoutube,
      formOtherSocial, setFormOtherSocial,
    },
    syncFromBusinessProfile,
    getUpdatedCompany,
  };
}
