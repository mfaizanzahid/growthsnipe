---
description: Implements provider adapters and canonical data mapping for the unified Sidekick app
mode: subagent
steps: 14
---
Read provider documentation first. Work inside provider adapter boundaries and canonical contracts (`src/server/providers/`). Use fixtures. Never invent a provider capability. Adapters never know about dashboard users, billing, or MCP sessions — they translate vendor APIs into canonical business data.
