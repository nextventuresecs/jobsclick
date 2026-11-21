import { describe, it, expect } from 'vitest';
import { DLT_SMS_TEMPLATES, calculateSmsCost } from '../src/auth/sms-templates.js';

describe('Hindi at Launch & DLT SMS Cost Calculation - Epic 8 (Issues #34-#37)', () => {
  it('provides DLT-approved English and Hindi SMS templates', () => {
    expect(DLT_SMS_TEMPLATES['OTP_HI']?.templateId).toBe('1277179312348407947');
    expect(DLT_SMS_TEMPLATES['INVITE_HI']?.templateId).toBe('1277179291746795224');
    expect(DLT_SMS_TEMPLATES['OTP_EN']?.templateId).toBe('1277179301139811147');
    expect(DLT_SMS_TEMPLATES['INVITE_EN']?.templateId).toBe('1277179291095585071');
    expect(DLT_SMS_TEMPLATES['OTP_HI']?.isUnicode).toBe(true);
    expect(DLT_SMS_TEMPLATES['INVITE_HI']?.isUnicode).toBe(true);
    expect(DLT_SMS_TEMPLATES['OTP_EN']?.isUnicode).toBe(false);
    expect(DLT_SMS_TEMPLATES['INVITE_EN']?.isUnicode).toBe(false);
  });

  it('calculates Unicode SMS cost multiplier correctly for Hindi templates', () => {
    const enCost = calculateSmsCost(1000, 'en', 0.2);
    const hiCost = calculateSmsCost(1000, 'hi', 0.2);

    expect(enCost.totalCostInr).toBe(200);
    expect(hiCost.isUnicode).toBe(true);
    expect(hiCost.totalCostInr).toBe(300); // 1.5x multiplier for Unicode SMS
  });
});
