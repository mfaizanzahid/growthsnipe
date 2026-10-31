import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { desc } from 'drizzle-orm';
export const sidekickConnections = sqliteTable('sidekick_connections', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), provider: text('provider').notNull(), encryptedCredentials: text('encrypted_credentials').notNull(), status: text('status').notNull().default('connected'), capabilitiesJson: text('capabilities_json'), externalAccountId: text('external_account_id'), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => ({ orgProvider: uniqueIndex('sidekick_connections_org_provider_idx').on(t.organizationId, t.provider), orgIdx: index('sidekick_connections_org_idx').on(t.organizationId) }));
export const sidekickMcpTokens = sqliteTable('sidekick_mcp_tokens', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), name: text('name').notNull(), tokenPrefix: text('token_prefix').notNull(), tokenHash: text('token_hash').notNull(), lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }), revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, t => ({ tokenHashIdx: uniqueIndex('sidekick_mcp_tokens_hash_idx').on(t.tokenHash), orgIdx: index('sidekick_mcp_tokens_org_idx').on(t.organizationId) }));
export const sidekickPolicies = sqliteTable('sidekick_policies', { organizationId: text('organization_id').primaryKey(), writePermission: text('write_permission').notNull().default('READ'), allowedActionsJson: text('allowed_actions_json').notNull().default('[]'), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull() });
export const sidekickSchedules = sqliteTable('sidekick_schedules', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), type: text('type').notNull(), timezone: text('timezone').notNull(), localTime: text('local_time').notNull(), ruleJson: text('rule_json').notNull().default('{}'), deliveryJson: text('delivery_json').notNull().default('{}'), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true), lastRunAt: integer('last_run_at', { mode: 'timestamp_ms' }), nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => ({ orgIdx: index('sidekick_schedules_org_idx').on(t.organizationId), dueIdx: index('sidekick_schedules_due_idx').on(t.enabled, t.nextRunAt) }));
export const sidekickBriefingJobs = sqliteTable('sidekick_briefing_jobs', {
  id: text('id').primaryKey(), scheduleId: text('schedule_id').notNull(), organizationId: text('organization_id').notNull(), periodKey: text('period_key').notNull(), status: text('status').notNull().default('scheduled'), payloadJson: text('payload_json'), briefingText: text('briefing_text'), errorText: text('error_text'), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(), completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
}, t => ({ dedupe: uniqueIndex('sidekick_briefing_jobs_dedupe_idx').on(t.scheduleId, t.periodKey), orgIdx: index('sidekick_briefing_jobs_org_idx').on(t.organizationId) }));
export const sidekickAuditLogs = sqliteTable('sidekick_audit_logs', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), principalType: text('principal_type').notNull(), principalId: text('principal_id').notNull(), provider: text('provider').notNull(), tool: text('tool').notNull(), targetType: text('target_type'), targetId: text('target_id'), requestJson: text('request_json'), beforeJson: text('before_json'), resultJson: text('result_json'), status: text('status').notNull(), correlationId: text('correlation_id').notNull(), createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, t => ({ orgIdx: index('sidekick_audit_logs_org_idx').on(t.organizationId) }));
export const sidekickBusinessProfiles = sqliteTable('sidekick_business_profiles', {
  organizationId: text('organization_id').primaryKey(), businessName: text('business_name'), trade: text('trade'), serviceArea: text('service_area'), ownerName: text('owner_name'), teamSize: text('team_size'), servicesMain: text('services_main'), servicesHighValue: text('services_high_value'), servicesRecurring: text('services_recurring'), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
export const sidekickEmployeeStates = sqliteTable('sidekick_employee_states', {
  organizationId: text('organization_id').notNull(), employee: text('employee').notNull(), active: integer('active', { mode: 'boolean' }).notNull().default(true), updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, t => ({ pk: primaryKey({ columns: [t.organizationId, t.employee] }), orgIdx: index('sidekick_employee_states_org_idx').on(t.organizationId) }));
/* Analytics warehouse: local copy of provider orders for fast dashboards. */
export const orgSyncState = sqliteTable('org_sync_state', {
  organizationId: text('organization_id').primaryKey(), provider: text('provider').notNull(), status: text('status').notNull().default('backfilling'), cursorDate: text('cursor_date'), lastSyncedAt: integer('last_synced_at'), totalFetched: integer('total_fetched').notNull().default(0), errorText: text('error_text'), updatedAt: integer('updated_at').notNull(), seedStartedAt: integer('seed_started_at'), totalEstimate: integer('total_estimate'), ordersTotal: integer('orders_total').notNull().default(0), ordersWithServices: integer('orders_with_services').notNull().default(0),
});
export const orgOrders = sqliteTable('org_orders', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), provider: text('provider').notNull(), providerOrderId: text('provider_order_id').notNull(), status: text('status').notNull().default('scheduled'), scheduledAt: text('scheduled_at'), completedAt: text('completed_at'), totalMinor: integer('total_minor'), currency: text('currency').notNull().default('USD'), inspectorNames: text('inspector_names').notNull().default('[]'), buyerName: text('buyer_name'), buyerEmail: text('buyer_email'), buyerPhone: text('buyer_phone'), buyingAgentName: text('buying_agent_name'), buyingAgentEmail: text('buying_agent_email'), buyingAgentPhone: text('buying_agent_phone'), agentKey: text('agent_key'), sellingAgentName: text('selling_agent_name'), serviceType: text('service_type'), referralSource: text('referral_source'), address: text('address'), providerUpdatedAt: text('provider_updated_at'), syncedAt: integer('synced_at').notNull(),
}, t => ({ orgProviderOrder: uniqueIndex('org_orders_org_provider_order_idx').on(t.organizationId, t.provider, t.providerOrderId), orgSchedId: index('org_orders_org_sched_id_idx').on(t.organizationId, desc(t.scheduledAt), desc(t.id)), orgStatusSched: index('org_orders_org_status_sched_idx').on(t.organizationId, t.status, t.scheduledAt), orgAgentSched: index('org_orders_org_agent_sched_idx').on(t.organizationId, t.agentKey, t.scheduledAt) }));
export const orgOrderInspectors = sqliteTable('org_order_inspectors', {
  organizationId: text('organization_id').notNull(), orderId: text('order_id').notNull(), inspectorName: text('inspector_name').notNull(),
}, t => ({ pk: primaryKey({ columns: [t.organizationId, t.orderId, t.inspectorName] }), orgInsp: index('org_order_inspectors_org_insp_idx').on(t.organizationId, t.inspectorName, t.orderId) }));
export const orgOrderServices = sqliteTable('org_order_services', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull(), orderId: text('order_id').notNull(), name: text('name').notNull(), kind: text('kind').notNull().default('base'), amountMinor: integer('amount_minor'),
}, t => ({ orgOrder: index('org_order_services_org_order_idx').on(t.organizationId, t.orderId), orgName: index('org_order_services_org_name_idx').on(t.organizationId, t.name) }));
export const orgInspectorTargets = sqliteTable('org_inspector_targets', {
  organizationId: text('organization_id').notNull(), inspectorName: text('inspector_name').notNull(), jobsPerDay: integer('jobs_per_day').notNull().default(2), updatedAt: integer('updated_at').notNull(),
}, t => ({ pk: primaryKey({ columns: [t.organizationId, t.inspectorName] }) }));
export const orgDashboardLayouts = sqliteTable('org_dashboard_layouts', {
  organizationId: text('organization_id').primaryKey(), widgetsJson: text('widgets_json').notNull().default('[]'), defaultRange: text('default_range').notNull().default('last_12m'), updatedAt: integer('updated_at').notNull(),
});
/* Per-user dashboard period preference (preset + custom dates per workspace). */
export const userDashboardPrefs = sqliteTable('user_dashboard_prefs', {
  userId: text('user_id').notNull(), organizationId: text('organization_id').notNull(), preset: text('preset').notNull().default('last_12m'), customFrom: text('custom_from'), customTo: text('custom_to'), updatedAt: integer('updated_at').notNull(),
}, t => ({ pk: primaryKey({ columns: [t.userId, t.organizationId] }) }));
