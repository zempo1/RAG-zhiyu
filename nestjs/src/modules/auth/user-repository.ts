import type { DeepPartial, FindOptionsWhere, Repository } from "typeorm";
import type { User } from "./entities/user.entity";
import { MemoryStore } from "../../persistence/memory.store";

/** The authentication module only needs these standard Repository operations. */
export interface UserRepository {
  findOneBy(where: FindOptionsWhere<User>): Promise<User | null>;
  save(user: DeepPartial<User>): Promise<User>;
  update(
    id: number,
    changes: Partial<Pick<User, "username" | "password" | "avatar">>,
  ): Promise<unknown>;
  findAvatar(id: number): Promise<Buffer | null>;
}

export function databaseUserRepository(repo: Repository<User>): UserRepository {
  return {
    findOneBy: (where) => repo.findOneBy(where),
    save: (user) => repo.save(user),
    update: (id, changes) => repo.update(id, changes),
    async findAvatar(id) {
      const row = await repo.findOne({ where: { id }, select: { avatar: true } });
      return row?.avatar ?? null;
    },
  };
}

/** Explicit memory-mode adapter; production uses TypeORM's actual Repository<User>. */
export function memoryUserRepository(store: MemoryStore): UserRepository {
  const hydrate = (row: any): User | null =>
    row
      ? {
          id: row.id,
          username: row.username,
          password: row.password,
          createdAt: row.createdAt ? new Date(row.createdAt) : null,
        }
      : null;
  return {
    async findOneBy(where) {
      return hydrate((await store.list("users", where))[0]);
    },
    async save(user) {
      const row = await store.save("users", {
        ...user,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : undefined,
      });
      return hydrate(row)!;
    },
    async update(id, changes) {
      await store.transaction(async (tx) => {
        if (await tx.get("users", id)) await tx.save("users", { id, ...changes });
      });
    },
    async findAvatar(id) {
      const row = await store.get("users", id);
      return row?.avatar ? Buffer.from(row.avatar) : null;
    },
  };
}
