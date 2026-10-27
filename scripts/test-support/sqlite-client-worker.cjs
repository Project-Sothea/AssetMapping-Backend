/* eslint-disable @typescript-eslint/no-require-imports -- This subprocess exercises the CommonJS native SQLite transport harness. */
const {
  fixture,
} = require('../../../AssetMapping-Frontend/scripts/test-support/local-fixture.cjs');
(async () => {
  const f = fixture(process.env.QA_SQLITE_FILE, {
    apiUrl: process.env.QA_API_URL,
    pinId: process.env.QA_PIN_ID,
  });
  const form = await f.formService.createForm(f.values);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    if (init?.method === 'POST' && JSON.parse(init.body).entityType === 'form') {
      await f.formService.updateForm(form.id, { name: 'QA latest edit before process death' });
      process.send({
        formId: form.id,
        journalCount: f.sqlite.prepare('SELECT count(*) n FROM sync_inflight').get().n,
      });
      await new Promise(() => {});
    }
    return response;
  };
  await f.syncQueue.processQueue();
})().catch((error) => {
  process.send?.({ error: error.message });
  process.exit(1);
});
