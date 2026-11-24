export interface DltSmsTemplate {
  templateId: string;
  templateName: string;
  language: 'en' | 'hi';
  templateText: string;
  isUnicode: boolean;
  senderId: string;
  companyName: string;
}

/**
 * Approved Jio DLT SMS Templates for JobsClick (SPACECRAFTZZ INNOVATIONS LLP)
 * Registered Header (Sender ID): JOBSCK
 */
export const DLT_SMS_TEMPLATES: Record<string, DltSmsTemplate> = {
  OTP_EN: {
    templateId: '1277179301139811147',
    templateName: 'JOBSCLICK_OTP_LOGIN_EN',
    language: 'en',
    templateText:
      'Dear User,\nYour JobsClick verification code is {#number#}. Valid for {#number#} minutes. Do not share your OTP with anyone.\nRegards,\nSPACECRAFTZZ INNOVATIONS LLP Team',
    isUnicode: false,
    senderId: 'JOBSCK',
    companyName: 'SPACECRAFTZZ INNOVATIONS LLP Team',
  },
  OTP_HI: {
    templateId: '1277179312348407947',
    templateName: 'JOBSCLICK_OTP_LOGIN_HI',
    language: 'hi',
    templateText:
      'JobsClick पर लॉगिन करने के लिए आपका ओटीपी {#number#} है। यह {#number#}  मिनट के लिए मान्य है। इसे किसी के साथ साझा न करें। - SPACECRAFTZZ INNOVATIONS LLP Team',
    isUnicode: true,
    senderId: 'JOBSCK',
    companyName: 'SPACECRAFTZZ INNOVATIONS LLP Team',
  },
  INVITE_EN: {
    templateId: '1277179291095585071',
    templateName: 'JOBSCLICK_INVITE_CANDIDATE_EN',
    language: 'en',
    templateText:
      'You have been invited to Indian Job Portal. Complete your profile and activate your account at jobsclick.live. - SPACECRAFTZZ INNOVATIONS LLP Team',
    isUnicode: false,
    senderId: 'JOBSCK',
    companyName: 'SPACECRAFTZZ INNOVATIONS LLP Team',
  },
  INVITE_HI: {
    templateId: '1277179291746795224',
    templateName: 'JOBSCLICK_INVITE_CANDIDATE_HI',
    language: 'hi',
    templateText:
      'आपको JobsClick पर आमंत्रित किया गया है। अपना खाता सक्रिय करने के लिए jobsclick.live पर जाएं। - SPACECRAFTZZ INNOVATIONS LLP Team',
    isUnicode: true,
    senderId: 'JOBSCK',
    companyName: 'SPACECRAFTZZ INNOVATIONS LLP Team',
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
