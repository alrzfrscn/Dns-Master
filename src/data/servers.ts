import rawSeed from "./defaultDns.json";
import type { DnsServer } from "../types/network";
import { MOCK_ADAPTERS } from "./mock";

interface SeedFile {
  version: number;
  updatedAt: string;
  source: string;
  servers: DnsServer[];
}

/**
 * Typed view over the JSON seed. `defaultDns.json` is the file the "GitHub JSON
 * sync" action will overwrite in a later phase; keep the shape stable.
 */
export const DNS_SEED = rawSeed as unknown as SeedFile;

export const SEED_SERVERS: DnsServer[] = DNS_SEED.servers.map((server) => ({
  ...server,
  latency: server.latency ?? null,
  tags: server.tags ?? [],
  uptime: server.uptime ?? 0,
}));

export const DEFAULT_ADAPTER: string = MOCK_ADAPTERS.find((a) => a.isDefault)?.id ?? MOCK_ADAPTERS[0].id;
