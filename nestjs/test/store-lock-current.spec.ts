import { MysqlStore } from "../src/persistence/mysql.store";
it("行锁返回当前已提交的数据，不再通过一致性读取返回事务旧快照", async () => {
  const columns = [
    { propertyName: "id", databaseName: "id", type: "bigint" },
    { propertyName: "score", databaseName: "score", type: "double" },
  ];
  const metadata = {
    tableName: "quiz_attempts",
    columns,
    findColumnWithPropertyName: (key: string) => columns.find((c) => c.propertyName === key),
  };
  const manager: any = {
    queryRunner: {
      isTransactionActive: true,
      query: async (sql: string) =>
        sql.startsWith("SET ")
          ? []
          : sql.includes("FOR UPDATE")
            ? [{ id: "1", score: 100 }]
            : [{ id: "1", score: 0 }],
    },
    connection: { options: { timezone: "+08:00" }, getMetadata: () => metadata },
  };
  const row = await new MysqlStore(manager).lock("quizAttempts", 1);
  expect(row?.score).toBe(100);
  expect(row?.id).toBe(1);
});

it("清理检索记录按主键分批，删除前再次核对数据库时区的过期时间", async () => {
  const statements: { sql: string; values: unknown[] }[] = [];
  const store = new MysqlStore({
    connection: {
      options: { timezone: "+08:00" },
      getMetadata: () => ({
        tableName: "retrieval_runs",
        findColumnWithPropertyName: () => ({ databaseName: "created_at" }),
      }),
    },
    queryRunner: {
      query: async (sql: string, values: unknown[]) => {
        if (sql.startsWith("SET ")) return [];
        statements.push({ sql, values });
        if (sql.includes("DESC")) return [{ id: "4" }];
        if (sql.startsWith("SELECT"))
          return [
            { id: "2", expired: 1 },
            { id: "4", expired: 0 },
          ];
        return [];
      },
    },
  } as any);
  const cutoff = "2026-11-09T08:00:00.000";
  await store.deleteExpiredRetrievalRuns(new Date("2026-11-09T00:00:00Z"), "+08:00");
  expect(statements).toHaveLength(3);
  expect(statements[1].sql).toContain("WHERE id > ? AND id <= ? ORDER BY id LIMIT ?");
  expect(statements[1].values).toEqual([cutoff, 0, "4", 500]);
  expect(statements[2].sql).toContain("WHERE id IN (?) AND `created_at` < ?");
  expect(statements[2].values).toEqual(["2", cutoff]);
});
