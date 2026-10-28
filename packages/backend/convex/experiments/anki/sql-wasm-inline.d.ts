declare module "sql.js/dist/sql-wasm-inline.js" {
  import type { SqlJsStatic } from "sql.js";
  const initSqlJs: (config?: Record<string, unknown>) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
