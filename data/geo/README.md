# Jobsclick location reference data

Source selection for JS-02, EMP-01, JOB-01 and INT-01. This directory contains offline reference data. Application integration requires a verified district list and a source for crosswalking postal and administrative coverage.

| Dataset | Evidence | Use |
| --- | --- | --- |
| LGD states and union territories | The [Ministry of Panchayati Raj citizen report](https://lgdirectory.gov.in/globalviewstateforcitizen.do) generated the snapshot on 26 November 2026 at 12:35:39 PM IST. The [LGD copyright policy](https://lgdirectory.gov.in/copyRightPolicy.do) permits accurate reproduction with prominent attribution. | [UTF-8 CSV](lgd-states.2026-11-26.csv), sorted by LGD code. All 36 codes are unique. The report has 28 states and 8 UTs. `name_local` preserves the publisher's values. Three values use Devanagari, and other values use other scripts or English. Hindi display labels need their own reviewed translations. |
| LGD districts | The [official legacy CSV](https://data.gov.in/sites/default/files/datafile/lgd_districts.csv) contains 785 unique district codes across all 36 states and UTs, with zero unmatched parent codes. Five district local names are blank. Only 205 local names contain Devanagari. The newest row update is 30 November 2023. | Use for offline verification. Obtain a fresher official export through the [OGD resource](https://data.gov.in/resource/local-government-directory-lgd-districts) or [LGD citizen report](https://lgdirectory.gov.in/globalviewdistrictforcitizen.do). The current OGD CSV URL returned HTTP 403, its API requires authorization and the LGD report requires a CAPTCHA. |
| India Post PIN directory | The [official legacy CSV](https://data.gov.in/sites/default/files/dataurl03122020/pincode.csv) yielded 157,126 valid rows, 157,114 distinct records and 19,300 distinct PINs. Each row has an office, district and state. The file reports a 7 January 2026 HTTP modification date. The data vintage is unconfirmed. | Use for offline verification under the [Government Open Data License – India](https://data.gov.in/Godl). The [current OGD resource](https://data.gov.in/resource/all-india-pincode-directory-till-last-month) listed newer metadata, but its current CSV returned HTTP 403 and its API requires authorization. |

The state CSV SHA-256 with LF line endings is `b06e95f7cbc6c348d2ec2ab984e20cbcfb433822ea2a2ecf75b9dd1fac4823bf`.

## Local source verification

Raw files are cached in the ignored `.scratch/jobsclick-geo/` directory of this worktree. The Ministry of Panchayati Raj and Department of Posts publish these OGD files. Preserve provider attribution, source URLs and the [Government Open Data License – India](https://data.gov.in/Godl) with any published derivative.

| File | Verified SHA-256 |
| --- | --- |
| [Legacy LGD states](https://data.gov.in/sites/default/files/datafile/lgd_states.csv) | `df9d3f601d59b81e42fe1fb7fe0b0b9b56ce4b5bfe74385233d45951adec75ff` |
| Legacy LGD districts | `bfddac8703dff76bc9bbf1a1a006e60909c5e08f21553a3f308f7493fd7562a4` |
| Legacy India Post directory | `84af12fa29adddedfa9addcf46546000d89d2e2899b2993dc88050fafc8861e2` |
| [30 May 2019 India Post export](https://data.gov.in/sites/default/files/dataurl31052019/Pincode_30052019.csv) | `e2fc773ebc697bb5aa96b76b6a38a2289d450e896769550259df89a2afe54c90` |

The 23 official postal-circle PDFs dated 25 May 2026 yielded 156,863 distinct office mappings and 19,300 PINs. They have no administrative district field. The [India Post website policy](https://www.indiapost.gov.in/website-policy?tab=copyright) requires Department approval for uses beyond download or print. Keep their verification separate from the OGD data.

Store snapshot date, source URL, license, SHA-256 and record counts for each import. Preserve multiple offices per PIN. An India Post circle or division does not establish an LGD state or district. Keep ambiguous joins available for review and preserve historical free-text addresses through any approved backfill. Keep institution reference data on its own provenance record.

An offline join using normalized case and whitespace matched 146,765 postal rows to a unique LGD state and district name. The other 10,361 rows span 38 unmatched postal state/district pairs. This check measures name agreement. A release crosswalk needs authoritative mapping for renamed districts and postal coverage that crosses administrative boundaries.
