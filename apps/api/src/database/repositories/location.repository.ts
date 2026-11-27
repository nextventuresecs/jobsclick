import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, DistrictRow, PincodeRow, StateRow } from '@indian-job-portal/database';
import { isTestEnv } from '@indian-job-portal/validation';
import { PersistentDatabaseStore, SUPABASE_CLIENT } from '../supabase.provider.js';

@Injectable()
export class LocationRepository {
  private readonly logger = new Logger(LocationRepository.name);
  private readonly store = PersistentDatabaseStore.getInstance();
  private readonly testMode: boolean;

  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient<Database>,
    @Optional() isTestMode?: boolean,
  ) {
    this.testMode = isTestEnv() && typeof isTestMode === 'boolean' ? isTestMode : isTestEnv();
  }

  async findAllStates(): Promise<StateRow[]> {
    if (this.testMode) {
      return Object.values(this.store.getTable<StateRow>('states')).sort((a, b) =>
        a.name_en.localeCompare(b.name_en),
      );
    }

    const { data, error } = await this.supabase
      .from('states')
      .select('lgd_code, name_en, name_hi, is_ut')
      .order('name_en', { ascending: true });

    if (error) {
      this.logger.error(`Failed fetching states: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as StateRow[]) ?? [];
  }

  async findStateByCode(lgdCode: number): Promise<StateRow | null> {
    if (this.testMode) {
      return Object.values(this.store.getTable<StateRow>('states')).find(
        (s) => s.lgd_code === lgdCode,
      ) ?? null;
    }

    const { data, error } = await this.supabase
      .from('states')
      .select('lgd_code, name_en, name_hi, is_ut')
      .eq('lgd_code', lgdCode)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed fetching state ${lgdCode}: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as StateRow) ?? null;
  }

  async findDistrictsByState(stateCode: number): Promise<DistrictRow[]> {
    if (this.testMode) {
      return Object.values(this.store.getTable<DistrictRow>('districts'))
        .filter((d) => d.state_code === stateCode && d.is_active)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    }

    const { data, error } = await this.supabase
      .from('districts')
      .select('id, lgd_code, state_code, name_en, name_hi, is_active, source, effective_from, notes')
      .eq('state_code', stateCode)
      .eq('is_active', true)
      .order('name_en', { ascending: true });

    if (error) {
      this.logger.error(`Failed fetching districts for state ${stateCode}: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as DistrictRow[]) ?? [];
  }

  async findDistrictById(id: string): Promise<DistrictRow | null> {
    if (this.testMode) {
      const table = this.store.getTable<DistrictRow>('districts');
      return table[id] ?? Object.values(table).find((d) => d.id === id) ?? null;
    }

    const { data, error } = await this.supabase
      .from('districts')
      .select('id, lgd_code, state_code, name_en, name_hi, is_active, source, effective_from, notes')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed fetching district ${id}: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as DistrictRow) ?? null;
  }

  async findDistrictsByIds(ids: readonly string[]): Promise<DistrictRow[]> {
    if (ids.length === 0) return [];
    if (this.testMode) {
      const wanted = new Set(ids);
      return Object.values(this.store.getTable<DistrictRow>('districts'))
        .filter((d) => wanted.has(d.id) && d.is_active)
        .sort((a, b) => a.name_en.localeCompare(b.name_en));
    }

    const { data, error } = await this.supabase
      .from('districts')
      .select('id, lgd_code, state_code, name_en, name_hi, is_active, source, effective_from, notes')
      .in('id', [...ids])
      .eq('is_active', true)
      .order('name_en', { ascending: true });

    if (error) {
      this.logger.error(`Failed fetching candidate districts: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as DistrictRow[]) ?? [];
  }

  async findPincode(pincode: string): Promise<PincodeRow | null> {
    if (this.testMode) {
      const table = this.store.getTable<PincodeRow>('pincodes');
      return table[pincode] ?? Object.values(table).find((p) => p.pincode === pincode) ?? null;
    }

    const { data, error } = await this.supabase
      .from('pincodes')
      .select('pincode, state_code, district_id, ambiguous, candidate_district_ids')
      .eq('pincode', pincode)
      .maybeSingle();

    if (error) {
      this.logger.error(`Failed fetching pincode ${pincode}: ${error.message}`);
      throw new InternalServerErrorException('DATABASE_ERROR');
    }

    return (data as PincodeRow) ?? null;
  }

  async validateDistrictForState(
    stateCode?: number | null,
    districtId?: string | null,
  ): Promise<{ stateCode: number | null; districtId: string | null }> {
    if (stateCode == null && districtId == null) {
      return { stateCode: null, districtId: null };
    }

    if (districtId != null) {
      const district = await this.findDistrictById(districtId);
      if (!district || !district.is_active) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_DISTRICT_ID',
          message: 'Selected district does not exist or is inactive.',
        });
      }
      if (stateCode != null && district.state_code !== stateCode) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'DISTRICT_STATE_MISMATCH',
          message: 'Selected district does not belong to the selected state.',
        });
      }
      return { stateCode: district.state_code, districtId: district.id };
    }

    const state = await this.findStateByCode(stateCode!);
    if (!state) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_STATE_CODE',
        message: 'Selected state does not exist.',
      });
    }
    return { stateCode: state.lgd_code, districtId: null };
  }
}
