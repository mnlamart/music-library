declare module "better-sqlite3" {
  interface Statement {
    all(): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): unknown;
  }

  class Database {
    constructor(path: string);
    prepare(sql: string): Statement;
    exec(sql: string): void;
    close(): void;
  }

  export default Database;
}
