# Runtime pin (AUTH-06)

Development, CI and all three production Dockerfiles use Node **24.22.3**. .nvmrc is the local/CI selector; package.json engines fixes the exact version. Use nvm install/nvm use (or the exact official portable binary on Windows) before pnpm install/checks. No system-wide installation was changed by this work.

The official Node release index lists 24.22.3 as a patched Node 24 LTS release (2026-11-10): https://nodejs.org/download/release/index.json . The official Docker node:24.22.3-alpine manifest exists. Local binary SHA256 matched the official SHASUMS256.txt: 86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6.

The runtime contract test fails for a mismatched process, engine, CI selector or container tag. Remote CI is required on the new packaged review stack; local passes alone do not substitute. Updating the version requires all selectors and verification together. No Railway deployment occurred.
