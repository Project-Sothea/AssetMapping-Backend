import { client } from '../../src/db';
import app from '../../src/server';
const server = app.listen(0, '127.0.0.1', () =>
  process.send?.({ port: (server.address() as import('node:net').AddressInfo).port })
);
process.on('SIGTERM', async () => {
  server.closeAllConnections();
  server.close();
  await client.end({ timeout: 1 });
  process.exit(0);
});
