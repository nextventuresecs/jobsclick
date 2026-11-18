# Native phase composition correction

The first combined fallback + native OTP invocation failed the native OTP zero-row precondition: fallback intentionally created one application and Auth fixture, then the runner tried a second fixture phase in the same database. The failed output is retained. Each phase below gets a new marked Supabase/Redis run and volume disposal. No original assertion is changed; no fixture rows or append-only ledgers are manually deleted. Existing repository CI does not select the fallback native case without its explicit native mode.
