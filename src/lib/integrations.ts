import type { IntegrationCategory } from "@prisma/client";

/**
 * Provider catalogue shared by the integrations API, the settings UI and the
 * demo seed. One definition of what each connector is, what it can do and which
 * scopes it needs — no duplicated provider lists anywhere else.
 */
export type IntegrationCatalogueEntry = {
  provider: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  scopes: string[];
  syncDirection: "inbound" | "outbound" | "bidirectional";
  /** Whether the connector can still work without a stored credential. */
  requiresCredential: boolean;
  docsUrl: string | null;
};

export const INTEGRATION_CATALOGUE: IntegrationCatalogueEntry[] = [
  {
    provider: "salesforce",
    name: "Salesforce",
    category: "CRM",
    description: "Two-way sync for accounts, opportunities, stages and owners.",
    scopes: ["read_accounts", "read_opportunities", "write_opportunities"],
    syncDirection: "bidirectional",
    requiresCredential: true,
    docsUrl: "https://developer.salesforce.com/docs",
  },
  {
    provider: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description: "Contacts, deals, lifecycle stages and engagement history.",
    scopes: ["read_contacts", "read_deals"],
    syncDirection: "bidirectional",
    requiresCredential: true,
    docsUrl: "https://developers.hubspot.com/docs/api/overview",
  },
  {
    provider: "pipedrive",
    name: "Pipedrive",
    category: "CRM",
    description: "Pipeline mirroring for teams that keep deals in Pipedrive.",
    scopes: ["read_deals"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://developers.pipedrive.com/docs/api/v1",
  },
  {
    provider: "slack",
    name: "Slack",
    category: "COMMUNICATION",
    description: "Automation alerts, digests and approval requests in channels.",
    scopes: ["chat:write", "channels:read"],
    syncDirection: "outbound",
    requiresCredential: true,
    docsUrl: "https://api.slack.com/messaging/webhooks",
  },
  {
    provider: "microsoft_teams",
    name: "Microsoft Teams",
    category: "COMMUNICATION",
    description: "Channel notifications and approval workflows in Teams.",
    scopes: ["chat:write"],
    syncDirection: "outbound",
    requiresCredential: true,
    docsUrl: "https://learn.microsoft.com/graph/api/overview",
  },
  {
    provider: "stripe",
    name: "Stripe",
    category: "FINANCE",
    description: "Subscriptions, invoices, payment status and dunning outcomes.",
    scopes: ["read_invoices", "read_subscriptions"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://stripe.com/docs/api",
  },
  {
    provider: "chargebee",
    name: "Chargebee",
    category: "FINANCE",
    description: "Billing, revenue recognition and subscription lifecycle.",
    scopes: ["read_subscriptions"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://apidocs.chargebee.com/docs/api",
  },
  {
    provider: "google_workspace",
    name: "Google Workspace",
    category: "PRODUCTIVITY",
    description: "Calendar, mail and drive activity for engagement scoring.",
    scopes: ["calendar.readonly", "drive.file"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://developers.google.com/workspace",
  },
  {
    provider: "notion",
    name: "Notion",
    category: "PRODUCTIVITY",
    description: "Shared account plans and onboarding documentation.",
    scopes: ["read_content"],
    syncDirection: "outbound",
    requiresCredential: true,
    docsUrl: "https://developers.notion.com",
  },
  {
    provider: "zendesk",
    name: "Zendesk",
    category: "SUPPORT",
    description: "Ticket severity, SLA breaches and CSAT backfill.",
    scopes: ["read_tickets", "read_users"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://developer.zendesk.com/api-reference",
  },
  {
    provider: "intercom",
    name: "Intercom",
    category: "SUPPORT",
    description: "Conversation volume and first-response times.",
    scopes: ["read_conversations"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://developers.intercom.com",
  },
  {
    provider: "marketo",
    name: "Marketo",
    category: "MARKETING",
    description: "Campaign responses and marketing-qualified lead handoff.",
    scopes: ["read_leads"],
    syncDirection: "inbound",
    requiresCredential: true,
    docsUrl: "https://developers.marketo.com",
  },
  {
    provider: "csv_import",
    name: "CSV import",
    category: "DATA",
    description: "Bulk import of accounts, contacts and deals from spreadsheet exports.",
    scopes: ["import"],
    syncDirection: "inbound",
    requiresCredential: false,
    docsUrl: "/api/reports/export",
  },
  {
    provider: "rest_api",
    name: "REST API",
    category: "DATA",
    description: "Programmatic access with scoped keys and per-day quotas.",
    scopes: ["read", "write"],
    syncDirection: "bidirectional",
    requiresCredential: false,
    docsUrl: "/settings?tab=api",
  },
  {
    provider: "webhooks",
    name: "Outbound Webhooks",
    category: "DATA",
    description: "Signed event delivery to your own endpoints with retries.",
    scopes: ["deliver"],
    syncDirection: "outbound",
    requiresCredential: false,
    docsUrl: "/settings?tab=webhooks",
  },
];

export const INTEGRATION_CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  CRM: "CRM",
  COMMUNICATION: "Communication",
  FINANCE: "Finance",
  PRODUCTIVITY: "Productivity",
  SUPPORT: "Support",
  MARKETING: "Marketing",
  DATA: "Data",
};

export const INTEGRATION_STATUS_LABELS: Record<string, string> = {
  CONNECTED: "Connected",
  PENDING: "Needs credential",
  ERROR: "Error",
  DISCONNECTED: "Not connected",
  PAUSED: "Paused",
};

export function integrationByProvider(provider: string) {
  return INTEGRATION_CATALOGUE.find((entry) => entry.provider === provider) ?? null;
}

export const SYNC_FREQUENCIES = ["realtime", "15min", "hourly", "6h", "daily", "manual"] as const;
export type SyncFrequency = (typeof SYNC_FREQUENCIES)[number];

export const SYNC_DIRECTIONS = ["inbound", "outbound", "bidirectional"] as const;
export type SyncDirection = (typeof SYNC_DIRECTIONS)[number];
