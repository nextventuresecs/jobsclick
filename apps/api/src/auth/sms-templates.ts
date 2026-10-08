export interface DltSmsTemplate {
  templateId: string;
  language: 'en' | 'hi';
  templateText: string;
  isUnicode: boolean;
}

export const DLT_SMS_TEMPLATES: Record<string, DltSmsTemplate> = {
  OTP_EN: {
    templateId: 'DLT_1001_OTP_EN',
    language: 'en',
    templateText: 'Your Indian Job Portal OTP is {#var#}. Valid for 10 minutes.',
    isUnicode: false,
  },
  OTP_HI: {
    templateId: 'DLT_1002_OTP_HI',
    language: 'hi',
    templateText: 'भारतीय जॉब पोर्टल के लिए आपका ओटीपी {#var#} है। 10 मिनट के लिए मान्य।',
    isUnicode: true,
  },
  INVITE_EN: {
    templateId: 'DLT_2001_INVITE_EN',
    language: 'en',
    templateText: 'You are invited to Indian Job Portal. Login at https://indianjobportal.in to activate your account.',
    isUnicode: false,
  },
  INVITE_HI: {
    templateId: 'DLT_2002_INVITE_HI',
    language: 'hi',
    templateText: 'आपको भारतीय जॉब पोर्टल पर आमंत्रित किया गया है। अपना खाता सक्रिय करने के लिए https://indianjobportal.in पर लॉगिन करें।',
    isUnicode: true,
  },
};

export function calculateSmsCost(
  messageCount: number,
  language: 'en' | 'hi' = 'en',
  baseCostPerSmsInr = 0.2,
): { messageCount: number; isUnicode: boolean; totalCostInr: number } {
  const isUnicode = language === 'hi';
  // Unicode SMS costs 1.5x due to 70-character segment limit vs 160-character ASCII segment limit
  const multiplier = isUnicode ? 1.5 : 1.0;
  const totalCostInr = Number((messageCount * baseCostPerSmsInr * multiplier).toFixed(2));

  return {
    messageCount,
    isUnicode,
    totalCostInr,
  };
}
