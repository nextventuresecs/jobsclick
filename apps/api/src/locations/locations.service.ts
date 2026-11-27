import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { DistrictRow, StateRow } from '@indian-job-portal/database';
import type {
  LocationDistrict,
  LocationPincodeResponse,
  LocationState,
} from '@indian-job-portal/validation';
import { LocationRepository } from '../database/repositories/location.repository.js';

function mapState(row: StateRow): LocationState {
  return {
    lgdCode: row.lgd_code,
    nameEn: row.name_en,
    nameHi: row.name_hi ?? null,
    isUt: row.is_ut,
  };
}

function mapDistrict(row: DistrictRow): LocationDistrict {
  return {
    id: row.id,
    lgdCode: row.lgd_code ?? null,
    stateCode: row.state_code,
    nameEn: row.name_en,
    nameHi: row.name_hi ?? null,
    isActive: row.is_active,
    source: row.source,
  };
}

@Injectable()
export class LocationsService {
  constructor(
    @Inject(LocationRepository) private readonly locationRepository: LocationRepository,
  ) {}

  async getStates(): Promise<{ states: LocationState[] }> {
    const rows = await this.locationRepository.findAllStates();
    return { states: rows.map(mapState) };
  }

  async getDistricts(stateCode: number): Promise<{ districts: LocationDistrict[] }> {
    const rows = await this.locationRepository.findDistrictsByState(stateCode);
    return { districts: rows.map(mapDistrict) };
  }

  async lookupPincode(pincode: string): Promise<LocationPincodeResponse> {
    const row = await this.locationRepository.findPincode(pincode);
    if (!row) {
      throw new NotFoundException('PINCODE_NOT_FOUND');
    }

    const candidateIds = row.candidate_district_ids ?? [];
    const [stateRow, primaryDistrictRow, candidateRows] = await Promise.all([
      row.state_code !== null ? this.locationRepository.findStateByCode(row.state_code) : Promise.resolve(null),
      !row.ambiguous && row.district_id
        ? this.locationRepository.findDistrictById(row.district_id)
        : Promise.resolve(null),
      candidateIds.length > 0
        ? this.locationRepository.findDistrictsByIds(candidateIds)
        : Promise.resolve([]),
    ]);

    return {
      pincode: row.pincode.trim(),
      stateCode: row.state_code ?? null,
      districtId: row.ambiguous ? null : row.district_id ?? null,
      ambiguous: row.ambiguous,
      candidateDistrictIds: candidateIds,
      state: stateRow ? mapState(stateRow) : null,
      district: !row.ambiguous && primaryDistrictRow ? mapDistrict(primaryDistrictRow) : null,
      candidates: candidateRows.map(mapDistrict),
    };
  }
}
