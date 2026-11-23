import { MigrationInterface, QueryRunner } from "typeorm";

/** Run after backing up old outlines and stopping any old OUTLINE writers. */
export class RemoveOutlines1795219200001 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query("DELETE FROM document_analyses WHERE type = ?", ["OUTLINE"]);
  }

  async down(): Promise<void> {
    // The pre-upgrade backup is the only source from which these records can be restored.
  }
}
