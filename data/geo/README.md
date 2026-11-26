# Jobsclick location reference data

Offline verification for JS-02, EMP-01, JOB-01 and INT-01. The downloads and crosswalk review are evidence for designing the location system. A production roster needs current administrative codes and verified office-level assignments.

## Publisher exports retrieved on 26 November 2026

The national Open Government Data resource pages publish CSV export URLs in their resource metadata. Direct file URLs returned HTTP 403. The APIs published on the same pages returned complete files using the portal's public example access. The LGD citizen district report still presents a CAPTCHA. Raw CSVs and API metadata are in the ignored `.scratch/jobsclick-geo/` directory of this worktree.

| Export | File and checks | Publisher evidence |
| --- | --- | --- |
| LGD states and UTs | [Raw CSV](../../.scratch/jobsclick-geo/states-publisher-api.csv). 36 unique state codes. API update date 26 November 2026. | [Ministry of Panchayati Raj OGD resource](https://data.gov.in/resource/local-government-directory-lgd-states) |
| LGD districts | [Raw CSV](../../.scratch/jobsclick-geo/district-publisher-api.csv). 785 unique district codes, each with a validated parent state. API update date 26 November 2026. | [Ministry of Panchayati Raj OGD resource](https://data.gov.in/resource/local-government-directory-lgd-districts) |
| Department of Posts PIN directory | [Raw CSV](../../.scratch/jobsclick-geo/post-publisher-api-full.csv). 165,627 records, matching the API total. 165,625 distinct parsed records and 19,586 unique PINs. | [Department of Posts OGD resource](https://data.gov.in/resource/all-india-pincode-directory-till-last-month) |

The India Post API metadata reports 3 October 2025. The resource page lists 10 August 2026. Neither source establishes when each office row was last maintained. The [India Post RTI directory](https://www.indiapost.gov.in/rti/pincodelist) publishes circle lists dated 25 May 2026. Those PDFs include office names and PINs but omit the administrative district field. Keep them as a separate verification source. [India Post website policy](https://www.indiapost.gov.in/website-policy?tab=copyright)

| Raw file | SHA-256 |
| --- | --- |
| `states-publisher-api.csv` | `a897f9bb1a7b7018ef8ced59e878168b061b5e6d40389bf2df9e3d63068a31b2` |
| `district-publisher-api.csv` | `b8901c98350a4057d3371ce14228181e4bb12cc447f847490efee599a0e38b59` |
| `post-publisher-api-full.csv` | `701ee84ba125a914e7ffc979c0308b3a041b8adffa85ec9d5f4e0579ecf062e5` |

All three CSVs come from the Ministry of Panchayati Raj or Department of Posts. Preserve the publisher attribution, provenance, and [Government Open Data License – India](https://data.gov.in/Godl) when redistributing the exports or derivatives. The checked-in [citizen state report snapshot](lgd-states.2026-11-26.csv) uses the separate [LGD reproduction policy](https://lgdirectory.gov.in/copyRightPolicy.do).

## District-label comparison

The verifier compares state and district names using case and whitespace normalization. A name match records agreement between labels. An office or service-area assignment still needs its own evidence.

| Comparison | Original official files | OGD publisher exports |
| --- | ---: | ---: |
| LGD codes | 785 | 785 |
| Postal rows | 157,126 | 165,627 |
| Unique PINs | 19,300 | 19,586 |
| Exact state and district names | 146,765 rows | 153,005 rows |
| Unmatched groups | 38 | 48 |
| Unmatched postal rows | 10,361 | 12,622 |
| PINs appearing under more than one raw state/district label | 1,168 | 1,478 |
| Rows with `NA` as both state and district | 0 | 715 |

[District label review CSV](district-label-review.csv) records all 50 groups across the two snapshots. Thirty-six groups recur, the two old Warangal labels disappear, and 12 groups are newly observed in the publisher comparison. The original 38 contain 29 documented label matches, eight boundary cases, and one evidenced conflict. The publisher 48 contain 36 documented label matches, nine boundary cases, two conflicts, and one missing-label group. Candidate LGD codes are scoped to states and have been checked against the relevant export.

- **Warangal.** An exact join on normalized state and office name plus six-digit PIN found 130 of 133 former Warangal Urban rows labeled Hanumakonda in the new postal CSV. The former Warangal Rural rows match across six newer administrative labels. The 2021 Telangana order confirms the reorganization. [Final state notification](https://cdnbbsr.s3waas.gov.in/s3ec04ddcbe25988981920c872c1787382/uploads/2024/06/2024062599.pdf)
- **Sikkim.** East and West District were split. The West District postal examples Chingthang BO and Rinchenpong BO both use PIN `737111`. Their names appear in the 2021 legislation under Gyalshing and Soreng respectively. [Sikkim Gazette, schedules IV–V](https://cdnbbsr.s3waas.gov.in/s3ec022b45e8d6abf59038a975faeeb6dc/uploads/2023/03/2023031530.pdf)
- **Andhra Pradesh.** Exact office joins show 448 former Anantapur rows in Sri Sathya Sai, 152 former Nellore rows in Tirupati, and 369 former Visakhapatnam rows in Anakapalli or Alluri Sitharama Raju. The state has documented the reorganizations. [Sri Sathya Sai history](https://srisathyasai.ap.gov.in/history/) · [Tirupati history](https://tirupati.ap.gov.in/history/) · [Anakapalli mandals](https://anakapalli.ap.gov.in/mandals/)
- **Conflicting office evidence.** The MP postal-circle list records Baruphatak BO `451449` under Barwani, while the legacy OGD row uses Khargone. The latest OGD labels Medra BO and Limbadia BO `382330` as Ahmedabad, while the housing ministry lists the named villages in Gandhinagar within the Ahmedabad Development Authority. Validate those office locations before assigning district codes. [Madhya Pradesh postal-circle list](https://mppost.gov.in/PDF/Branch%20Offices.pdf) · [Ministry of Housing and Urban Affairs village list](https://pmaymis.gov.in/PMAYMIS2_2024/list-uda.pdf)

## Release blockers

The November LGD publisher response lists only Leh and Kargil for Ladakh. The UT notified five additional districts in April 2026 and Sankoo in October 2026. The response also lacks Markapuram, which Andhra Pradesh established with effect from 31 December 2025. The portal's update date therefore does not establish current administrative coverage. Obtain an official roster with the missing LGD codes and effective dates before releasing a nationwide district picker. [Ladakh April notification](https://ladakh.gov.in/historic-milestone-for-ladakh-five-new-districts-notified-in-ladakh-taking-total-districts-to-seven/) · [Sankoo notification](https://ladakh.gov.in/ladakh-administration-notifies-creation-of-sankoo-as-new-district-of-ut-ladakh/) · [Markapuram gazette order](https://markapuram.ap.gov.in/documents/)

Keep 715 rows with missing administrative labels pending and preserve multiple offices per PIN. Resolve split and disputed assignments with an authoritative office or locality crosswalk. Reviewed Hindi display labels and human review of any RLS or existing-address migration are still required. Preserve historical free-text addresses during any approved backfill.

## Reproduce the checks

Run from the repository root. The output includes counts, hashes, and every unresolved name group with its office and PIN counts.

```powershell
$geo = '.scratch/jobsclick-geo'
node scripts/geo/verify-districts.mjs "$geo/lgd_states.csv" "$geo/lgd_districts.csv" "$geo/pincode.csv" --postal-total 157126 --review data/geo/district-label-review.csv --snapshot legacy
node scripts/geo/verify-districts.mjs "$geo/states-publisher-api.csv" "$geo/district-publisher-api.csv" "$geo/post-publisher-api-full.csv" --postal-total 165627 --review data/geo/district-label-review.csv --snapshot publisher
```

The original files used for the comparison remain cached in the same directory.

| Original source | SHA-256 |
| --- | --- |
| [Legacy LGD states](https://data.gov.in/sites/default/files/datafile/lgd_states.csv) | `df9d3f601d59b81e42fe1fb7fe0b0b9b56ce4b5bfe74385233d45951adec75ff` |
| [Legacy LGD districts](https://data.gov.in/sites/default/files/datafile/lgd_districts.csv) | `bfddac8703dff76bc9bbf1a1a006e60909c5e08f21553a3f308f7493fd7562a4` |
| [Legacy India Post directory](https://data.gov.in/sites/default/files/dataurl03122020/pincode.csv) | `84af12fa29adddedfa9addcf46546000d89d2e2899b2993dc88050fafc8861e2` |
