import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../repositories/db";
import {
  oauthClients,
  oauthTokens,
  sidekickAuditLogs,
  sidekickBriefingJobs,
  sidekickBusinessProfiles,
  sidekickConnections,
  sidekickEmployeeStates,
  sidekickMcpTokens,
  sidekickPolicies,
  sidekickSchedules,
} from "../../../db/schema";
import type { ActionName, PermissionLevel, ProviderKey } from "../providers/types";

/** Narrow data-access surface for Sidekick dashboard routes (real or fake in tests). */
export interface SidekickStore {
  listConnections(orgId: string): Promise<ConnectionPublic[]>;
  getConnection(id: string, orgId: string): Promise<ConnectionRow | null>;
  saveConnection(input: ConnectionInput): Promise<ConnectionPublic>;
  deleteConnection(id: string, orgId: string): Promise<boolean>;
  listTokens(orgId: string): Promise<TokenPublic[]>;
  createToken(input: TokenInput): Promise<void>;
  revokeToken(id: string, orgId: string): Promise<boolean>;
  getPolicy(orgId: string): Promise<PolicyPublic>;
  savePolicy(orgId: string, input: { writePermission: PermissionLevel; allowedActions: ActionName[] }): Promise<PolicyPublic>;
  listSchedules(orgId: string): Promise<SchedulePublic[]>;
  createSchedule(input: ScheduleInput): Promise<SchedulePublic>;
  updateSchedule(id: string, orgId: string, patch: Partial<SchedulePatch>): Promise<SchedulePublic | null>;
  deleteSchedule(id: string, orgId: string): Promise<boolean>;
  listBriefings(orgId: string, limit: number, offset?: number): Promise<BriefingPublic[]>;
  latestBriefing(orgId: string): Promise<BriefingPublic | null>;
  deleteBriefing(id: string, orgId: string): Promise<boolean>;
  listAudit(orgId: string, limit: number): Promise<AuditPublic[]>;
  logAudit(entry: AuditInput): Promise<void>;
  getBusinessProfile(orgId: string): Promise<BusinessProfile | null>;
  saveBusinessProfile(orgId: string, input: BusinessProfileInput): Promise<BusinessProfile>;
  listEmployeeStates(orgId: string): Promise<EmployeeStatePublic[]>;
  saveEmployeeState(orgId: string, employee: string, active: boolean): Promise<EmployeeStatePublic>;
  /** True when the org holds any live OAuth grant (unrevoked, unexpired). Boolean only — never token material. */
  hasActiveOAuthGrant(orgId: string, nowSec: number): Promise<boolean>;
  listOAuthGrants(orgId: string, nowSec: number): Promise<OAuthGrantPublic[]>;
  revokeOAuthGrants(orgId: string, clientId: string, nowSec: number): Promise<number>;
}

export interface OAuthGrantPublic {
  clientId: string;
  name: string;
  /** Earliest live token creation (ms epoch) — when the app was connected. */
  connectedAt: number | null;
  activeTokens: number;
}

export interface EmployeeStatePublic {
  organizationId: string;
  employee: string;
  active: boolean;
}

export interface BusinessProfile {
  organizationId: string;
  businessName: string | null;
  trade: string | null;
  serviceArea: string | null;
  ownerName: string | null;
  teamSize: string | null;
  servicesMain: string | null;
  servicesHighValue: string | null;
  servicesRecurring: string | null;
}

export type BusinessProfileInput = Omit<BusinessProfile, "organizationId">;

/** Render a profile as the markdown section injected into served instructions. Null when entirely empty. */
export function formatBusinessProfileText(profile: BusinessProfile | null): string | null {
  if (!profile) return null;
  const lines: Array<[string, string | null]> = [
    ["Business name", profile.businessName],
    ["Trade", profile.trade],
    ["Primary service area", profile.serviceArea],
    ["Owner", profile.ownerName],
    ["Team size", profile.teamSize],
    ["Main services", profile.servicesMain],
    ["Highest-value services", profile.servicesHighValue],
    ["Recurring services", profile.servicesRecurring],
  ];
  const filled = lines.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  if (filled.length === 0) return null;
  return `## ACTIVE BUSINESS PROFILE\n${filled.map(([k, v]) => `${k}: ${String(v).trim()}`).join("\n")}`;
}

export interface ConnectionRow {
  id: string;
  organizationId: string;
  provider: string;
  encryptedCredentials: string;
  status: string;
  capabilitiesJson: string | null;
  externalAccountId: string | null;
  updatedAt: Date;
}

export type ConnectionPublic = Omit<ConnectionRow, "encryptedCredentials">;

export interface ConnectionInput {
  id: string;
  organizationId: string;
  provider: ProviderKey;
  encryptedCredentials: string;
  status?: string;
  capabilitiesJson?: string | null;
  externalAccountId?: string | null;
}

export interface TokenPublic {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface TokenInput {
  id: string;
  organizationId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
}

export interface PolicyPublic {
  organizationId: string;
  writePermission: PermissionLevel;
  allowedActions: ActionName[];
}

export interface SchedulePublic {
  id: string;
  organizationId: string;
  type: string;
  timezone: string;
  localTime: string;
  ruleJson: string;
  deliveryJson: string;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

export interface ScheduleInput {
  id: string;
  organizationId: string;
  type: string;
  timezone: string;
  localTime: string;
  ruleJson: string;
  deliveryJson: string;
  nextRunAt: Date;
}

export interface SchedulePatch {
  type: string;
  timezone: string;
  localTime: string;
  ruleJson: string;
  deliveryJson: string;
  enabled: boolean;
  /** Recomputed by the route when the timing changes; absent on simple toggles. */
  nextRunAt?: Date;
}

export interface BriefingPublic {
  id: string;
  scheduleId: string;
  periodKey: string;
  status: string;
  briefingText: string | null;
  errorText: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface AuditPublic {
  id: string;
  principalType: string;
  principalId: string;
  provider: string;
  tool: string;
  targetType: string | null;
  targetId: string | null;
  status: string;
  correlationId: string;
  createdAt: Date;
}

export interface AuditInput {
  id: string;
  organizationId: string;
  principalType: string;
  principalId: string;
  provider: string;
  tool: string;
  targetType?: string | null;
  targetId?: string | null;
  requestJson?: string | null;
  beforeJson?: string | null;
  resultJson?: string | null;
  status: string;
  correlationId: string;
}

function toConnectionPublic(row: typeof sidekickConnections.$inferSelect): ConnectionPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    status: row.status ?? "connected",
    capabilitiesJson: row.capabilitiesJson,
    externalAccountId: row.externalAccountId,
    updatedAt: row.updatedAt,
  };
}

/** Live SidekickStore backed by D1/Drizzle. Every read is org-scoped. */
export function drizzleSidekickStore(db: Db): SidekickStore {
  return {
    async listConnections(orgId) {
      const rows = await db
        .select()
        .from(sidekickConnections)
        .where(eq(sidekickConnections.organizationId, orgId));
      return rows.map(toConnectionPublic);
    },
    async getConnection(id, orgId) {
      const rows = await db
        .select()
        .from(sidekickConnections)
        .where(and(eq(sidekickConnections.id, id), eq(sidekickConnections.organizationId, orgId)))
        .limit(1);
      return rows[0] ?? null;
    },
    async saveConnection(input) {
      const now = new Date();
      await db
        .insert(sidekickConnections)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          provider: input.provider,
          encryptedCredentials: input.encryptedCredentials,
          status: input.status ?? "connected",
          capabilitiesJson: input.capabilitiesJson ?? null,
          externalAccountId: input.externalAccountId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [sidekickConnections.organizationId, sidekickConnections.provider],
          set: {
            encryptedCredentials: input.encryptedCredentials,
            status: input.status ?? "connected",
            capabilitiesJson: input.capabilitiesJson ?? null,
            externalAccountId: input.externalAccountId ?? null,
            updatedAt: now,
          },
        });
      const rows = await db
        .select()
        .from(sidekickConnections)
        .where(
          and(
            eq(sidekickConnections.organizationId, input.organizationId),
            eq(sidekickConnections.provider, input.provider),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new Error("Could not save provider connection");
      return toConnectionPublic(rows[0]);
    },
    async deleteConnection(id, orgId) {
      const existing = await db
        .select({ id: sidekickConnections.id })
        .from(sidekickConnections)
        .where(and(eq(sidekickConnections.id, id), eq(sidekickConnections.organizationId, orgId)))
        .limit(1);
      if (!existing[0]) return false;
      await db.delete(sidekickConnections).where(eq(sidekickConnections.id, id));
      return true;
    },
    async listTokens(orgId) {
      return db
        .select({
          id: sidekickMcpTokens.id,
          name: sidekickMcpTokens.name,
          tokenPrefix: sidekickMcpTokens.tokenPrefix,
          lastUsedAt: sidekickMcpTokens.lastUsedAt,
          revokedAt: sidekickMcpTokens.revokedAt,
          createdAt: sidekickMcpTokens.createdAt,
        })
        .from(sidekickMcpTokens)
        .where(eq(sidekickMcpTokens.organizationId, orgId));
    },
    async createToken(input) {
      await db.insert(sidekickMcpTokens).values({ ...input, createdAt: new Date() });
    },
    async revokeToken(id, orgId) {
      const existing = await db
        .select({ id: sidekickMcpTokens.id })
        .from(sidekickMcpTokens)
        .where(and(eq(sidekickMcpTokens.id, id), eq(sidekickMcpTokens.organizationId, orgId)))
        .limit(1);
      if (!existing[0]) return false;
      await db.update(sidekickMcpTokens).set({ revokedAt: new Date() }).where(eq(sidekickMcpTokens.id, id));
      return true;
    },
    async getPolicy(orgId) {
      const rows = await db
        .select()
        .from(sidekickPolicies)
        .where(eq(sidekickPolicies.organizationId, orgId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return { organizationId: orgId, writePermission: "READ", allowedActions: [] };
      }
      return {
        organizationId: orgId,
        writePermission: row.writePermission as PermissionLevel,
        allowedActions: JSON.parse(row.allowedActionsJson ?? "[]") as ActionName[],
      };
    },
    async savePolicy(orgId, input) {
      const now = new Date();
      await db
        .insert(sidekickPolicies)
        .values({
          organizationId: orgId,
          writePermission: input.writePermission,
          allowedActionsJson: JSON.stringify(input.allowedActions),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: sidekickPolicies.organizationId,
          set: {
            writePermission: input.writePermission,
            allowedActionsJson: JSON.stringify(input.allowedActions),
            updatedAt: now,
          },
        });
      return { organizationId: orgId, ...input };
    },
    async listSchedules(orgId) {
      return db
        .select()
        .from(sidekickSchedules)
        .where(eq(sidekickSchedules.organizationId, orgId));
    },
    async createSchedule(input) {
      const now = new Date();
      await db.insert(sidekickSchedules).values({ ...input, enabled: true, createdAt: now, updatedAt: now });
      const rows = await db
        .select()
        .from(sidekickSchedules)
        .where(eq(sidekickSchedules.id, input.id))
        .limit(1);
      if (!rows[0]) throw new Error("Could not create schedule");
      return rows[0] as SchedulePublic;
    },
    async updateSchedule(id, orgId, patch) {
      await db
        .update(sidekickSchedules)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(sidekickSchedules.id, id), eq(sidekickSchedules.organizationId, orgId)));
      const rows = await db
        .select()
        .from(sidekickSchedules)
        .where(and(eq(sidekickSchedules.id, id), eq(sidekickSchedules.organizationId, orgId)))
        .limit(1);
      return (rows[0] as SchedulePublic | undefined) ?? null;
    },
    async deleteSchedule(id, orgId) {
      const existing = await db
        .select({ id: sidekickSchedules.id })
        .from(sidekickSchedules)
        .where(and(eq(sidekickSchedules.id, id), eq(sidekickSchedules.organizationId, orgId)))
        .limit(1);
      if (!existing[0]) return false;
      await db.delete(sidekickSchedules).where(eq(sidekickSchedules.id, id));
      return true;
    },
    async listBriefings(orgId, limit, offset = 0) {
      return db
        .select({
          id: sidekickBriefingJobs.id,
          scheduleId: sidekickBriefingJobs.scheduleId,
          periodKey: sidekickBriefingJobs.periodKey,
          status: sidekickBriefingJobs.status,
          briefingText: sidekickBriefingJobs.briefingText,
          errorText: sidekickBriefingJobs.errorText,
          createdAt: sidekickBriefingJobs.createdAt,
          completedAt: sidekickBriefingJobs.completedAt,
        })
        .from(sidekickBriefingJobs)
        .where(eq(sidekickBriefingJobs.organizationId, orgId))
        .orderBy(desc(sidekickBriefingJobs.createdAt))
        .limit(limit)
        .offset(offset);
    },
    async deleteBriefing(id, orgId) {
      const rows = await db
        .select({ id: sidekickBriefingJobs.id })
        .from(sidekickBriefingJobs)
        .where(and(eq(sidekickBriefingJobs.id, id), eq(sidekickBriefingJobs.organizationId, orgId)))
        .limit(1);
      if (!rows[0]) return false;
      await db.delete(sidekickBriefingJobs).where(eq(sidekickBriefingJobs.id, id));
      return true;
    },
    async latestBriefing(orgId) {
      const rows = await db
        .select({
          id: sidekickBriefingJobs.id,
          scheduleId: sidekickBriefingJobs.scheduleId,
          periodKey: sidekickBriefingJobs.periodKey,
          status: sidekickBriefingJobs.status,
          briefingText: sidekickBriefingJobs.briefingText,
          errorText: sidekickBriefingJobs.errorText,
          createdAt: sidekickBriefingJobs.createdAt,
          completedAt: sidekickBriefingJobs.completedAt,
        })
        .from(sidekickBriefingJobs)
        .where(eq(sidekickBriefingJobs.organizationId, orgId))
        .orderBy(desc(sidekickBriefingJobs.createdAt))
        .limit(1);
      return rows[0] ?? null;
    },
    async listAudit(orgId, limit) {
      return db
        .select({
          id: sidekickAuditLogs.id,
          principalType: sidekickAuditLogs.principalType,
          principalId: sidekickAuditLogs.principalId,
          provider: sidekickAuditLogs.provider,
          tool: sidekickAuditLogs.tool,
          targetType: sidekickAuditLogs.targetType,
          targetId: sidekickAuditLogs.targetId,
          status: sidekickAuditLogs.status,
          correlationId: sidekickAuditLogs.correlationId,
          createdAt: sidekickAuditLogs.createdAt,
        })
        .from(sidekickAuditLogs)
        .where(eq(sidekickAuditLogs.organizationId, orgId))
        .orderBy(desc(sidekickAuditLogs.createdAt))
        .limit(limit);
    },
    async logAudit(entry) {
      await db.insert(sidekickAuditLogs).values({ ...entry, createdAt: new Date() });
    },
    async getBusinessProfile(orgId) {
      const rows = await db
        .select()
        .from(sidekickBusinessProfiles)
        .where(eq(sidekickBusinessProfiles.organizationId, orgId))
        .limit(1);
      return rows[0] ?? null;
    },
    async saveBusinessProfile(orgId, input) {
      const now = new Date();
      await db
        .insert(sidekickBusinessProfiles)
        .values({ organizationId: orgId, ...input, updatedAt: now })
        .onConflictDoUpdate({
          target: sidekickBusinessProfiles.organizationId,
          set: { ...input, updatedAt: now },
        });
      const rows = await db
        .select()
        .from(sidekickBusinessProfiles)
        .where(eq(sidekickBusinessProfiles.organizationId, orgId))
        .limit(1);
      if (!rows[0]) throw new Error("Could not save business profile");
      return rows[0];
    },
    async listEmployeeStates(orgId) {
      const rows = await db
        .select()
        .from(sidekickEmployeeStates)
        .where(eq(sidekickEmployeeStates.organizationId, orgId));
      return rows.map((r) => ({
        organizationId: r.organizationId,
        employee: r.employee,
        active: r.active ?? true,
      }));
    },
    async saveEmployeeState(orgId, employee, active) {
      const now = new Date();
      await db
        .insert(sidekickEmployeeStates)
        .values({ organizationId: orgId, employee, active, updatedAt: now })
        .onConflictDoUpdate({
          target: [sidekickEmployeeStates.organizationId, sidekickEmployeeStates.employee],
          set: { active, updatedAt: now },
        });
      return { organizationId: orgId, employee, active };
    },
    async hasActiveOAuthGrant(orgId, nowSec) {
      const rows = await db
        .select({ tokenHash: oauthTokens.tokenHash })
        .from(oauthTokens)
        .where(
          and(
            eq(oauthTokens.orgId, orgId),
            isNull(oauthTokens.revokedAt),
            gt(oauthTokens.expiresAt, nowSec),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async listOAuthGrants(orgId, nowSec) {
      const rows = await db
        .select({
          clientId: oauthTokens.clientId,
          createdAt: oauthTokens.createdAt,
        })
        .from(oauthTokens)
        .where(
          and(
            eq(oauthTokens.orgId, orgId),
            isNull(oauthTokens.revokedAt),
            gt(oauthTokens.expiresAt, nowSec),
          ),
        );
      const byClient = new Map<string, { connectedAt: number | null; activeTokens: number }>();
      for (const r of rows) {
        const entry = byClient.get(r.clientId) ?? { connectedAt: null, activeTokens: 0 };
        entry.activeTokens += 1;
        if (entry.connectedAt === null || r.createdAt < entry.connectedAt) entry.connectedAt = r.createdAt;
        byClient.set(r.clientId, entry);
      }
      const grants: OAuthGrantPublic[] = [];
      for (const [clientId, entry] of byClient) {
        const clientRows = await db
          .select({ name: oauthClients.name })
          .from(oauthClients)
          .where(eq(oauthClients.id, clientId))
          .limit(1);
        grants.push({ clientId, name: clientRows[0]?.name ?? "MCP client", ...entry });
      }
      return grants;
    },
    async revokeOAuthGrants(orgId, clientId, nowSec) {
      const live = await db
        .select({ tokenHash: oauthTokens.tokenHash })
        .from(oauthTokens)
        .where(
          and(
            eq(oauthTokens.orgId, orgId),
            eq(oauthTokens.clientId, clientId),
            isNull(oauthTokens.revokedAt),
          ),
        );
      if (live.length === 0) return 0;
      await db
        .update(oauthTokens)
        .set({ revokedAt: nowSec })
        .where(
          and(
            eq(oauthTokens.orgId, orgId),
            eq(oauthTokens.clientId, clientId),
            isNull(oauthTokens.revokedAt),
          ),
        );
      return live.length;
    },
  };
}
