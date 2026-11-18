/** Test-only mailbox readiness; never creates or substitutes an OTP. */
export async function waitForNativeEmailOtp(
  readOtp: (signal: AbortSignal) => Promise<string>,
): Promise<string> {
  const deadline = Date.now() + 15000;
  const signal = AbortSignal.timeout(15000);
  while (Date.now() < deadline) {
    try {
      const otp = await readOtp(signal);
      if (otp) return otp;
    } catch (error) {
      if (signal.aborted) return '';
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return '';
}
