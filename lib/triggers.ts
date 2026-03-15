import { readFile } from "fs/promises";
import path from "path";
import { getLeads } from "./sheets";
import type { Lead } from "./sheets";

export interface Trigger {
  id: string;
  name: string;
  enabled: boolean;
  when: "new_lead";
  delay_minutes: number;
  template: string;
  sender: string;
  capi_event: string;
}

interface TriggersConfig {
  triggers: Trigger[];
}

export async function getTriggers(): Promise<Trigger[]> {
  const filePath = path.join(process.cwd(), "config", "triggers.json");
  const data = await readFile(filePath, "utf-8");
  const config: TriggersConfig = JSON.parse(data);
  return config.triggers;
}

export interface PendingTrigger {
  trigger: Trigger;
  lead: Lead;
}

export async function findPendingTriggers(): Promise<PendingTrigger[]> {
  const triggers = await getTriggers();
  const leads = await getLeads();
  const now = Date.now();
  const pending: PendingTrigger[] = [];

  for (const trigger of triggers) {
    if (!trigger.enabled || !trigger.template) continue;

    if (trigger.when === "new_lead") {
      for (const lead of leads) {
        if (lead.messageId || lead.status !== "new") continue;

        const createdAt = lead.createdTime ? new Date(lead.createdTime).getTime() : 0;
        if (createdAt === 0) continue;

        const minutesSinceCreation = (now - createdAt) / (1000 * 60);
        if (minutesSinceCreation >= trigger.delay_minutes) {
          pending.push({ trigger, lead });
        }
      }
    }
  }

  return pending;
}
