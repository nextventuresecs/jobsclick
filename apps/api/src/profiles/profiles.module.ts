import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';
import { InstitutionCmsService } from './institution-cms.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, InstitutionCmsService],
  exports: [ProfilesService, InstitutionCmsService],
})
export class ProfilesModule {}
