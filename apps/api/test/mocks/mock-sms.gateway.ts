import { Injectable } from '@nestjs/common';
import { SmsGateway, SendOtpOptions, SendInviteSmsOptions, SmsResponse } from '../../src/auth/sms.service.js';

@Injectable()
export class MockSmsGateway extends SmsGateway {
  public dispatchedOtps: Array<{ phone: string; otp: string; language?: 'en' | 'hi' }> = [];
  public dispatchedInvites: Array<SendInviteSmsOptions> = [];
  public shouldSucceed = true;

  async sendOtp(options: SendOtpOptions): Promise<SmsResponse> {
    this.dispatchedOtps.push(options);
    if (!this.shouldSucceed) {
      return {
        success: false,
        message: 'Mock SMS gateway simulated failure',
      };
    }
    return {
      success: true,
      message: 'OTP dispatched via MockSmsGateway',
      messageId: `mock_msg_${Date.now()}`,
    };
  }

  async sendInviteSms(options: SendInviteSmsOptions): Promise<SmsResponse> {
    this.dispatchedInvites.push(options);
    if (!this.shouldSucceed) {
      return {
        success: false,
        message: 'Mock SMS gateway simulated failure',
      };
    }
    return {
      success: true,
      message: 'Interview invite dispatched via MockSmsGateway',
      messageId: `mock_invite_${Date.now()}`,
    };
  }
}
