import type { Env } from '../lib/env';
import type { ProviderKey, BusinessProviderAdapter } from './types';
import { SpectoraAdapter } from './spectora/adapter';
import { IsnAdapter } from './isn/adapter';
import { ServicetitanAdapter } from './servicetitan/adapter';
import { HousecallproAdapter } from './housecallpro/adapter';
import { JobberAdapter } from './jobber/adapter';

export interface ProviderConnectionConfig {
  provider: ProviderKey;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export function createProviderAdapter(env: Env, connection: ProviderConnectionConfig): BusinessProviderAdapter {
  switch (connection.provider) {
    case 'spectora':
      return new SpectoraAdapter(env, { ...connection, provider: 'spectora' });
    case 'isn':
      return new IsnAdapter(env, { ...connection, provider: 'isn' });
    case 'servicetitan':
      return new ServicetitanAdapter(env, { ...connection, provider: 'servicetitan' });
    case 'housecallpro':
      return new HousecallproAdapter(env, { ...connection, provider: 'housecallpro' });
    case 'jobber':
      return new JobberAdapter(env, { ...connection, provider: 'jobber' });
    default: {
      const exhaustive: never = connection.provider;
      throw new Error(`Unsupported provider: ${exhaustive}`);
    }
  }
}
