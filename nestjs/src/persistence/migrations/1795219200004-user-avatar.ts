import type { MigrationInterface, QueryRunner } from "typeorm";

export class UserAvatar1795219200004 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn("app_user", "avatar"))) {
      await runner.query("ALTER TABLE app_user ADD COLUMN avatar MEDIUMBLOB NULL");
    }
  }

  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn("app_user", "avatar")) {
      await runner.query("ALTER TABLE app_user DROP COLUMN avatar");
    }
  }
}
