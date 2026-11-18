import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Express } from 'express'

/** Ports fetch (undici) refuses as unsafe, e.g. 4045, 6000, 6665-6669, 10080. Rare, but port 0 can hand one out. */
const BLOCKED = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])

/** Listen on a random loopback port, re-rolling any port `fetch` would reject. */
export async function listenSafe(app: Express): Promise<Server> {
  for (;;) {
    const server = app.listen(0, '127.0.0.1')
    await new Promise((r) => server.once('listening', r))
    if (!BLOCKED.has((server.address() as AddressInfo).port)) return server
    await new Promise((r) => server.close(r))
  }
}
