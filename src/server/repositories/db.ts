import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../../../db/schema";

export type Db = DrizzleD1Database<typeof schema>;

export const schemaRef = schema;

export function createDb(db: D1Database): Db {
  return drizzle(db, { schema });
}
