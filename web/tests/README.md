# Exposure checks

From `web`, run `node --test tests/exposure.test.mjs`. These tests use Node's
built-in test runner and the project's installed TypeScript compiler.

The browser suite uses an existing Playwright installation and Microsoft Edge.
It does not add either to the application dependencies. Start the application
on port 3001, then run:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3001
# In another terminal:
node tests/exposure.browser.mjs C:/path/to/node_modules/playwright
```

You can omit the module path if Playwright is installed in your environment.
Set `NIRMOL_TEST_URL` to test a different local port or the production server.
The suite intercepts `/api/air` with controlled fixtures; it verifies rendering,
input behavior, source labels, invalid responses, freshness, request races,
timeouts, translations, focus, and mobile overflow without relying on upstream
availability. It checks for runtime and hydration errors and saves a mobile
screenshot to the operating system's temporary directory.

Live provider availability, Bangla wording review, and real phone/screen-reader
testing remain separate checks. Exposure bands remain provisional and have not
been medically validated.
