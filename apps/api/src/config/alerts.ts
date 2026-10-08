export interface SpendAlertConfig {
  dailySmsCapInr: number;
  monthlySmsCapInr: number;
  currentSmsSpendInr: number;
  smsAlertFired: boolean;
}

export function checkSpendAlerts(currentSmsSpendInr: number): SpendAlertConfig {
  const dailySmsCapInr = 5000;
  const monthlySmsCapInr = 100000;
  const smsAlertFired = currentSmsSpendInr >= dailySmsCapInr * 0.8;

  if (smsAlertFired) {
    console.warn(`[SPEND ALERT] SMS spend reached ₹${currentSmsSpendInr} (80% of daily cap ₹${dailySmsCapInr})`);
  }

  return {
    dailySmsCapInr,
    monthlySmsCapInr,
    currentSmsSpendInr,
    smsAlertFired,
  };
}
