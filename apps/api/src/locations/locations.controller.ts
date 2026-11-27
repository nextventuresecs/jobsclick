import { BadRequestException, Controller, Get, Header, Inject, Param, Query } from '@nestjs/common';
import {
  locationDistrictsQuerySchema,
  locationPincodeParamSchema,
} from '@indian-job-portal/validation';
import { Public } from '../auth/decorators/public.decorator.js';
import { LocationsService } from './locations.service.js';

@Controller('locations')
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locationsService: LocationsService) {}

  @Public()
  @Get('states')
  @Header('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  async getStates() {
    return this.locationsService.getStates();
  }

  @Public()
  @Get('districts')
  @Header('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  async getDistricts(@Query() query: Record<string, unknown>) {
    const parsed = locationDistrictsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('INVALID_STATE_CODE');
    }
    return this.locationsService.getDistricts(parsed.data.state);
  }

  @Public()
  @Get('pincode/:pin')
  @Header('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800')
  async lookupPincode(@Param('pin') pin: string) {
    const parsed = locationPincodeParamSchema.safeParse({ pin });
    if (!parsed.success) {
      throw new BadRequestException('INVALID_PINCODE');
    }
    return this.locationsService.lookupPincode(parsed.data.pin);
  }
}
