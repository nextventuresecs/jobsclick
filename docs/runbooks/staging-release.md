# Railway release verification

Open **CI/CD Pipeline** in GitHub Actions and select **Run workflow** on `main` when a release is authorized. Pull requests, including drafts, and ordinary pushes run verification without starting a deployment. Both Railway environments use the workflow for releases. The GitHub Source auto-deploy switch must be off for API, web, and worker in both environments.

CI sends only tracked files from the workflow commit to Docker and Railway. Staging checks the exact deployment IDs for all services. API `/health` and web `/api/health` must return HTTP 200 with `status: ok` and the requested deployment ID. The private worker must report a fresh readiness heartbeat after connecting to Redis and the queues. The same checks must pass twice in succession. Production also requires the GitHub `production` environment approval.

Before running the release, confirm the approved application baseline and database migrations are in place. The release workflow does not apply database migrations. Confirm staging Redis and the health origins on Railway, and set the GitHub `staging` environment variables `STAGING_API_URL` and `STAGING_WEB_URL` if they differ from the defaults. Store the separate environment-scoped Railway project tokens in the corresponding GitHub environment.

Set `NEXT_PUBLIC_APP_ENV=staging` for the Railway web build and `APP_ENV=staging` for its runtime. Staging `robots.txt` permits crawling so search engines can read `X-Robots-Tag: noindex, nofollow`. The staging sitemap contains no URLs.
