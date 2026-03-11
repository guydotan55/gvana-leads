import { clientConfig } from "@/client.config";

export function getConfig() {
  return clientConfig;
}

export function getStatusByKey(key: string) {
  return clientConfig.statuses.find((s) => s.key === key);
}

export function isFeatureEnabled(feature: keyof typeof clientConfig.features) {
  return clientConfig.features[feature];
}
