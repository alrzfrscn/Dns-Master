import type { BypassTarget, NetworkAdapter } from "../types/network";

/** Browser fallback inventory, used only when the Rust core is unavailable. */
export const MOCK_ADAPTERS: NetworkAdapter[] = [
  {
    id: "adapter-wifi",
    name: "Wi-Fi",
    kind: "wifi",
    status: "up",
    ipv4: "192.168.1.42",
    gateway: "192.168.1.1",
    mac: "A4:5E:60:B1:7C:04",
    speedMbps: 866,
    isDefault: true,
  },
  {
    id: "adapter-eth",
    name: "Ethernet",
    kind: "ethernet",
    status: "up",
    ipv4: "10.0.4.17",
    gateway: "10.0.4.1",
    mac: "3C:7C:3F:22:91:AE",
    speedMbps: 2500,
    isDefault: false,
  },
  {
    id: "adapter-vpn",
    name: "WireGuard VPN",
    kind: "vpn",
    status: "up",
    ipv4: "10.8.0.2",
    gateway: "10.8.0.1",
    mac: "00:00:00:00:00:00",
    speedMbps: 0,
    isDefault: false,
  },
];

export const BYPASS_TARGETS: BypassTarget[] = [
  { id: "docker", label: "Docker Hub", host: "registry-1.docker.io", group: "dev" },
  { id: "github", label: "GitHub", host: "github.com", group: "dev" },
  { id: "openai", label: "OpenAI API", host: "api.openai.com", group: "ai" },
  { id: "huggingface", label: "Hugging Face", host: "huggingface.co", group: "ai" },
  { id: "steam", label: "Steam Store", host: "store.steampowered.com", group: "gaming" },
  { id: "ea", label: "EA Online", host: "ea.com", group: "gaming" },
];

export const PINNED_FALLBACK_IDS = ["electro", "radar-game", "shecan", "cloudflare"];
