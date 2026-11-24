/**
 * Mapeamento Drizzle das tabelas definidas em db/migrations/*.sql.
 * A fonte de verdade do schema são as migrações SQL; mantenha os dois em sincronia.
 */
import {
  pgTable, text, uuid, integer, boolean, timestamp, jsonb, bigint, date, primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { OrgSettings } from "@/lib/settings";
import type { PlanLimits } from "@/lib/plans";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "number" });

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  limits: jsonb("limits").$type<PlanLimits>().notNull(),
  features: jsonb("features").$type<string[]>().notNull(),
  sortOrder: integer("sort_order").notNull(),
  active: boolean("active").notNull(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  segment: text("segment").notNull().default("generic"),
  baseSize: text("base_size"),
  planId: text("plan_id").notNull().default("basic"),
  settings: jsonb("settings").$type<Partial<OrgSettings>>().notNull().default({}),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  onboardingDone: boolean("onboarding_done").notNull().default(false),
  dataRetentionDays: integer("data_retention_days").notNull().default(1095),
  slug: text("slug"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: ts("email_verified_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const memberships = pgTable("memberships", {
  userId: uuid("user_id").notNull(),
  orgId: uuid("org_id").notNull(),
  role: text("role").$type<Role>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.orgId] })]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  orgId: uuid("org_id"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  firstVisitAt: date("first_visit_at", { mode: "string" }),
  lastVisitAt: date("last_visit_at", { mode: "string" }),
  visitCount: integer("visit_count").notNull().default(0),
  totalSpentCents: money("total_spent_cents").notNull().default(0),
  avgTicketCents: money("avg_ticket_cents").notNull().default(0),
  favoriteService: text("favorite_service"),
  preferredStaff: text("preferred_staff"),
  notes: text("notes"),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  status: text("status").$type<CustomerStatus>().notNull().default("unknown"),
  statusChangedAt: ts("status_changed_at"),
  recoveredAt: ts("recovered_at"),
  priorityScore: integer("priority_score").notNull().default(0),
  consentWhatsapp: boolean("consent_whatsapp").notNull().default(false),
  consentEmail: boolean("consent_email").notNull().default(false),
  consentSms: boolean("consent_sms").notNull().default(false),
  legalBasis: text("legal_basis").$type<LegalBasis>().notNull().default("none"),
  consentSource: text("consent_source"),
  consentAt: ts("consent_at"),
  optedOutAt: ts("opted_out_at"),
  lastContactAt: ts("last_contact_at"),
  contactCount: integer("contact_count").notNull().default(0),
  isDemo: boolean("is_demo").notNull().default(false),
  source: text("source").notNull().default("manual"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  objective: text("objective"),
  audience: jsonb("audience").$type<Audience>().notNull().default({}),
  channel: text("channel").$type<Channel>().notNull(),
  tone: text("tone").notNull().default("acolhedor"),
  offer: text("offer"),
  variants: jsonb("variants").$type<string[]>().notNull().default([]),
  emailSubject: text("email_subject"),
  status: text("status").$type<CampaignStatus>().notNull().default("draft"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  approvedBy: uuid("approved_by"),
  approvedAt: ts("approved_at"),
  generatedBy: text("generated_by").$type<"ai" | "template" | "user">().notNull().default("template"),
  rationale: text("rationale"),
  createdByType: text("created_by_type").$type<"user" | "agent" | "automation">().notNull().default("user"),
  createdBy: uuid("created_by"),
  automationId: uuid("automation_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  completedAt: ts("completed_at"),
});

export const campaignMessages = pgTable("campaign_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  campaignId: uuid("campaign_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  channel: text("channel").$type<Channel>().notNull(),
  body: text("body").notNull(),
  variantIndex: integer("variant_index").notNull().default(0),
  status: text("status").$type<MessageStatus>().notNull().default("queued"),
  skipReason: text("skip_reason"),
  providerMessageId: text("provider_message_id"),
  sentVia: text("sent_via").$type<"api" | "manual">(),
  error: text("error"),
  sentAt: ts("sent_at"),
  deliveredAt: ts("delivered_at"),
  readAt: ts("read_at"),
  repliedAt: ts("replied_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const visits = pgTable("visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  occurredAt: date("occurred_at", { mode: "string" }).notNull(),
  amountCents: money("amount_cents").notNull().default(0),
  description: text("description"),
  source: text("source").notNull().default("manual"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const recoveries = pgTable("recoveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id").notNull(),
  campaignId: uuid("campaign_id"),
  messageId: uuid("message_id"),
  visitId: uuid("visit_id"),
  returnedAt: date("returned_at", { mode: "string" }).notNull(),
  revenueCents: money("revenue_cents").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const inboundMessages = pgTable("inbound_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id"),
  campaignMessageId: uuid("campaign_message_id"),
  channel: text("channel").notNull(),
  body: text("body"),
  isOptOut: boolean("is_opt_out").notNull().default(false),
  receivedAt: ts("received_at").notNull().defaultNow(),
});

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  filename: text("filename").notNull(),
  status: text("status").notNull().default("completed"),
  totalRows: integer("total_rows").notNull().default(0),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: jsonb("errors").$type<{ row: number; message: string }[]>().notNull().default([]),
  mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
  createdBy: uuid("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const blocklist = pgTable("blocklist", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  value: text("value").notNull(),
  reason: text("reason"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const consentEvents = pgTable("consent_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id"),
  channel: text("channel").notNull(),
  action: text("action").$type<"granted" | "revoked">().notNull(),
  legalBasis: text("legal_basis"),
  source: text("source").notNull(),
  actor: text("actor").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const automations = pgTable("automations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  triggerStatus: text("trigger_status").$type<"at_risk" | "inactive" | "highly_inactive">().notNull(),
  channel: text("channel").$type<Channel>().notNull(),
  tone: text("tone").notNull().default("acolhedor"),
  offer: text("offer"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: ts("last_run_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  provider: text("provider").$type<Provider>().notNull(),
  config: jsonb("config").$type<Record<string, string>>().notNull().default({}),
  secretEncrypted: text("secret_encrypted"),
  status: text("status").notNull().default("configured"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull(),
  keyHash: text("key_hash").notNull(),
  lastUsedAt: ts("last_used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  revokedAt: ts("revoked_at"),
});

export const agentMessages = pgTable("agent_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  userId: uuid("user_id"),
  role: text("role").$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id"),
  actorType: text("actor_type").$type<"user" | "agent" | "system" | "api">().notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  summary: text("summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const usageCounters = pgTable("usage_counters", {
  orgId: uuid("org_id").notNull(),
  period: text("period").notNull(),
  aiRequests: integer("ai_requests").notNull().default(0),
  messagesSent: integer("messages_sent").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.orgId, t.period] })]);

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  customerId: uuid("customer_id"),
  scheduledFor: ts("scheduled_for").notNull(),
  service: text("service"),
  staff: text("staff"),
  status: text("status").$type<AppointmentStatus>().notNull().default("requested"),
  amountCents: money("amount_cents"),
  notes: text("notes"),
  source: text("source").notNull(),
  externalId: text("external_id"),
  visitId: uuid("visit_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const dataSources = pgTable("data_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  kind: text("kind").$type<SourceKind>().notNull(),
  status: text("status").notNull().default("active"),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  secretEncrypted: text("secret_encrypted"),
  lastSyncAt: ts("last_sync_at"),
  lastResult: jsonb("last_result").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ───────── Tipos de domínio ─────────
export type AppointmentStatus = "requested" | "confirmed" | "done" | "no_show" | "cancelled";
export type SourceKind = "google_calendar" | "ics_url" | "whatsapp_capture" | "booking_page" | "partner_request";
export type Role = "owner" | "admin" | "manager" | "viewer";
export type CustomerStatus = "active" | "at_risk" | "inactive" | "highly_inactive" | "recovered" | "unknown";
export type LegalBasis = "consent" | "legitimate_interest" | "none";
export type Channel = "whatsapp" | "email" | "sms";
export type CampaignStatus = "draft" | "pending_approval" | "approved" | "sending" | "completed" | "cancelled";
export type MessageStatus = "queued" | "skipped" | "sent" | "delivered" | "read" | "failed" | "replied";
export type Provider = "whatsapp_cloud" | "resend" | "twilio";
export interface Audience {
  statuses?: CustomerStatus[];
  minDaysInactive?: number;
  maxDaysInactive?: number;
  minAvgTicketCents?: number;
  minPriority?: number;
  limit?: number;
  customerIds?: string[];
}

export type Customer = typeof customers.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type CampaignMessage = typeof campaignMessages.$inferSelect;

export type SubscriptionStatus = "trialing" | "pending" | "active" | "past_due" | "canceled" | "expired";

export const subscriptions = pgTable("subscriptions", {
  orgId: uuid("org_id").primaryKey(),
  status: text("status").$type<SubscriptionStatus>().notNull().default("trialing"),
  planId: text("plan_id").notNull(),
  pendingPlanId: text("pending_plan_id"),
  trialEndsAt: ts("trial_ends_at"),
  currentPeriodEnd: ts("current_period_end"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  provider: text("provider").notNull().default("asaas"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  billingName: text("billing_name"),
  billingEmail: text("billing_email"),
  billingDocument: text("billing_document"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const billingPayments = pgTable("billing_payments", {
  id: text("id").primaryKey(),
  orgId: uuid("org_id").notNull(),
  subscriptionId: text("subscription_id"),
  planId: text("plan_id"),
  status: text("status").notNull(),
  valueCents: integer("value_cents").notNull(),
  billingType: text("billing_type"),
  dueDate: date("due_date", { mode: "string" }),
  paidAt: ts("paid_at"),
  invoiceUrl: text("invoice_url"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  orgId: uuid("org_id"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const authTokens = pgTable("auth_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull(),
  purpose: text("purpose").$type<"password_reset" | "email_verify">().notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
