import { createZodDto } from 'nestjs-zod';
import {
  createPaymentOrderSchema,
  verifyPaymentSchema,
  sponsorshipQuoteInputSchema,
  createSponsorshipOrderSchema,
  grantCreditSchema,
  unlockContactSchema,
  featureJobSchema,
  configureCostSchema,
} from '@indian-job-portal/validation';

export class CreatePaymentOrderDto extends createZodDto(createPaymentOrderSchema) {}
export class VerifyPaymentDto extends createZodDto(verifyPaymentSchema) {}
export class SponsorshipQuoteDto extends createZodDto(sponsorshipQuoteInputSchema) {}
export class CreateSponsorshipOrderDto extends createZodDto(createSponsorshipOrderSchema) {}
export class GrantCreditDto extends createZodDto(grantCreditSchema) {}
export class UnlockContactDto extends createZodDto(unlockContactSchema) {}
export class FeatureJobDto extends createZodDto(featureJobSchema) {}
export class ConfigureCostDto extends createZodDto(configureCostSchema) {}
