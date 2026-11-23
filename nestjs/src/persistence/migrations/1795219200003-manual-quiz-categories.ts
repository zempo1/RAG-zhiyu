import type { MigrationInterface, QueryRunner } from "typeorm";

export class ManualQuizCategories1795219200003 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE IF NOT EXISTS quiz_review_categories (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id BIGINT NOT NULL, knowledge_base_id BIGINT NOT NULL,
      topic_key VARCHAR(100) COLLATE utf8mb4_bin NOT NULL, topic_label VARCHAR(80) NOT NULL,
      created_at DATETIME(6) NOT NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_quiz_review_category (knowledge_base_id, topic_key),
      CONSTRAINT fk_quiz_review_category_library FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await runner.query(`INSERT INTO quiz_review_categories
      (user_id, knowledge_base_id, topic_key, topic_label, created_at)
      SELECT w.user_id, w.knowledge_base_id, w.topic_key COLLATE utf8mb4_bin,
        MIN(w.topic_label), MIN(w.created_at)
      FROM quiz_wrong_items w
      JOIN knowledge_bases b ON b.id = w.knowledge_base_id AND b.user_id = w.user_id AND b.deleted_at IS NULL
      WHERE w.topic_key IS NOT NULL AND w.topic_key <> '' AND w.topic_label IS NOT NULL AND w.topic_label <> ''
      GROUP BY w.user_id, w.knowledge_base_id, w.topic_key COLLATE utf8mb4_bin
      ON DUPLICATE KEY UPDATE quiz_review_categories.id = quiz_review_categories.id`);
    await runner.query(`UPDATE processing_tasks
      SET status = 'canceled', stage = 'canceled', retryable = 0, execution_token = NULL,
        payload = JSON_REMOVE(payload, '$.credential', '$.modelSnapshot', '$.leaseUntil'),
        updated_at = CURRENT_TIMESTAMP(6)
      WHERE kind = 'quiz_review_classification'
        AND status NOT IN ('completed', 'canceled')`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE IF EXISTS quiz_review_categories");
  }
}
