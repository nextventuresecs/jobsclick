import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UsePipes,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { PlacementService } from './placement.service.js';
import {
  CreateCorporateTieUpSchema,
  ShareCandidateBatchSchema,
  UpdatePlacementStageSchema,
} from '@indian-job-portal/validation';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard, Roles } from '../auth/guards/roles.guard.js';
import { CurrentUser, type AuthUser } from '../auth/decorators/current-user.decorator.js';

@Controller('placement')
@UseGuards(JwtAuthGuard, RolesGuard)
@UsePipes(ZodValidationPipe)
export class PlacementController {
  constructor(@Inject(PlacementService) private readonly placementService: PlacementService) {}

  @Roles('institution', 'intermediary', 'employer', 'admin')
  @Get('tie-ups')
  async getTieUps(@CurrentUser() user: AuthUser) {
    return this.placementService.getTieUps(user.id, user.role);
  }

  @Roles('institution', 'intermediary', 'admin')
  @Post('tie-ups')
  async createTieUp(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = CreateCorporateTieUpSchema.parse(body);
    return this.placementService.createTieUp(user.id, parsed, user.role);
  }

  @Roles('institution', 'intermediary', 'employer', 'job_seeker', 'admin')
  @Get('pipeline')
  async getPipeline(@CurrentUser() user: AuthUser) {
    return this.placementService.getPipeline(user.id, user.role);
  }

  @Roles('institution', 'intermediary', 'admin')
  @Post('batch-share')
  async shareCandidateBatch(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = ShareCandidateBatchSchema.parse(body);
    return this.placementService.shareCandidateBatch(user.id, parsed, user.role);
  }

  @Roles('employer', 'institution', 'intermediary', 'job_seeker', 'admin')
  @Patch('pipeline/:id/stage')
  async updateStage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdatePlacementStageSchema.parse(body);
    return this.placementService.updateStage(id, parsed, user);
  }
}
