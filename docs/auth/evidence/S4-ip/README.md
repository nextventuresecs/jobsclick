# AUTH-03 local IP reality

Empirical local GoTrue auth.audit_log_entries rows for direct and controlled server-side API OTP/verification calls recorded empty ip_address for both user_confirmation_requested and user_signedup. This does not establish the browser IP or prove native per-IP limiting. The local API socket was 127.0.0.1 and ignored a forged X-Forwarded-For 203.0.113.77. It was a test-only transport, not production BFF cutover.

Do not claim trusted client IP propagation from this result. Native phone/HMAC quotas, global budget and CAPTCHA supply separate defenses. The required production BFF device/IP limits and trusted ingress rule remain open; provider-direct abuse still needs explicit admission before enablement. Exact PII-free observations are retained in followup/S4-native/captcha-enabled-observations.json relative to the evidence directory.
