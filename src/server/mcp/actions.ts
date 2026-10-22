import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ActionName, BusinessProviderAdapter, PermissionLevel } from '../providers/types';
export interface WritePolicy{permission:PermissionLevel;allowedActions:ActionName[]}
export interface WriteAudit{organizationId:string;principalType:string;principalId:string;provider:string;log:(entry:{tool:string;targetType?:string;targetId?:string;requestJson?:string;beforeJson?:string;resultJson?:string;status:string;correlationId:string})=>Promise<void>}

const idSchema = z.object({ id: z.string().min(1) });

interface ActionDef {
  action: ActionName;
  description: string;
  schema: z.ZodTypeAny;
  targetType: string;
  run: (adapter: BusinessProviderAdapter, args: any) => Promise<unknown>;
}

const CLIENT_FIELDS = {
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
};

const ORDER_FIELDS = {
  serviceType: z.string().max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  notes: z.string().max(4000).optional(),
  address: z.string().max(500).optional(),
};

const AGENT_FIELDS = {
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
};

const ACTIONS: ActionDef[] = [
  { action: 'create_client', description: 'Create a client/customer when the provider supports it and organization policy allows it.', schema: z.object(CLIENT_FIELDS), targetType: 'client',
    run: (a, args) => a.createClient!(args) },
  { action: 'update_client', description: 'Update a client/customer when the provider supports it and organization policy allows it.', schema: z.object({ id: z.string().min(1), ...CLIENT_FIELDS }), targetType: 'client',
    run: (a, { id, ...rest }) => a.updateClient!(id, rest) },
  { action: 'delete_client', description: 'Delete a client/customer when the provider supports it and organization policy allows it.', schema: idSchema, targetType: 'client',
    run: (a, { id }) => a.deleteClient!(id) },
  { action: 'create_order', description: 'Create a service order/job when the provider supports it and organization policy allows it.', schema: z.object(ORDER_FIELDS), targetType: 'order',
    run: (a, args) => a.createOrder!(args) },
  { action: 'update_order', description: 'Update a service order/job when the provider supports it and organization policy allows it.', schema: z.object({ id: z.string().min(1), ...ORDER_FIELDS }), targetType: 'order',
    run: (a, { id, ...rest }) => a.updateOrder!(id, rest) },
  { action: 'cancel_order', description: 'Cancel a service order/job when the provider supports it and organization policy allows it.', schema: z.object({ id: z.string().min(1), reason: z.string().max(500).optional() }), targetType: 'order',
    run: (a, { id, reason }) => a.cancelOrder!(id, reason) },
  { action: 'delete_order', description: 'Delete a service order/job when the provider supports it and organization policy allows it.', schema: idSchema, targetType: 'order',
    run: (a, { id }) => a.deleteOrder!(id) },
  { action: 'reschedule_order', description: 'Reschedule a service order/job when the provider supports it and organization policy allows it.', schema: z.object({ id: z.string().min(1), scheduledAt: z.string().datetime() }), targetType: 'order',
    run: (a, { id, scheduledAt }) => a.rescheduleOrder!(id, scheduledAt) },
  { action: 'create_agent', description: 'Create an agent/service provider when the provider supports it and organization policy allows it.', schema: z.object(AGENT_FIELDS), targetType: 'agent',
    run: (a, args) => a.createAgent!(args) },
  { action: 'update_agent', description: 'Update an agent/service provider when the provider supports it and organization policy allows it.', schema: z.object({ id: z.string().min(1), ...AGENT_FIELDS }), targetType: 'agent',
    run: (a, { id, ...rest }) => a.updateAgent!(id, rest) },
  { action: 'delete_agent', description: 'Delete an agent/service provider when the provider supports it and organization policy allows it.', schema: idSchema, targetType: 'agent',
    run: (a, { id }) => a.deleteAgent!(id) },
  { action: 'send_message', description: 'Send a message through the provider when it supports it and organization policy allows it.', schema: z.object({ to: z.string().min(1), body: z.string().min(1).max(4000) }), targetType: 'message',
    run: (a, args) => a.sendMessage!(args) },
];

const METHOD_FOR: Record<ActionName, (a: BusinessProviderAdapter) => unknown> = {
  create_client: (a) => a.createClient,
  update_client: (a) => a.updateClient,
  delete_client: (a) => a.deleteClient,
  create_order: (a) => a.createOrder,
  update_order: (a) => a.updateOrder,
  cancel_order: (a) => a.cancelOrder,
  delete_order: (a) => a.deleteOrder,
  reschedule_order: (a) => a.rescheduleOrder,
  create_agent: (a) => a.createAgent,
  update_agent: (a) => a.updateAgent,
  delete_agent: (a) => a.deleteAgent,
  send_message: (a) => a.sendMessage,
};

function notSupported(adapter: BusinessProviderAdapter, def: ActionDef) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          supported: false,
          action: def.action,
          message: `${def.action} is not currently supported by the ${adapter.key} provider.`,
        }),
      },
    ],
  };
}

export function registerWriteTools(server:McpServer,adapter:BusinessProviderAdapter,policy:WritePolicy,audit?:WriteAudit){
  if(policy.permission==='READ')return;
  for (const def of ACTIONS) {
    if (!policy.allowedActions.includes(def.action)) continue;
    server.registerTool(def.action,{description:def.description,inputSchema:def.schema},async(args)=>{
      // Capability first: never propose or claim what the provider can't do.
      if(!METHOD_FOR[def.action](adapter)) return notSupported(adapter, def);
      if(policy.permission==='SUGGEST'){
        return{content:[{type:'text',text:JSON.stringify({proposed:true,action:def.action,...(args as Record<string, unknown>)})}]};
      }
      const correlationId=crypto.randomUUID();
      const targetId = typeof (args as Record<string, unknown>)?.id === 'string' ? (args as Record<string, string>).id : undefined;
      try {
        const result=await def.run(adapter, args);
        await audit?.log({tool:def.action,targetType:def.targetType,targetId,requestJson:JSON.stringify(args),resultJson:JSON.stringify(result),status:'success',correlationId});
        return{content:[{type:'text',text:JSON.stringify({success:true,result})}]};
      } catch (err) {
        await audit?.log({tool:def.action,targetType:def.targetType,targetId,requestJson:JSON.stringify(args),resultJson:JSON.stringify({error:err instanceof Error?err.message:String(err)}),status:'failed',correlationId});
        throw err;
      }
    });
  }
}
