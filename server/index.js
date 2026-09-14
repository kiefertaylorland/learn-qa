import { createApp } from './app.js';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const { server, close } = createApp();
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`QA Quest listening on port ${port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => { void close().then(() => process.exit(0)); });
}
