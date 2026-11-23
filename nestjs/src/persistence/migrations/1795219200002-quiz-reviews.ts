import type { MigrationInterface, QueryRunner } from "typeorm";

export class QuizReviews1795219200002 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    if (!(await runner.hasColumn("quizzes", "review_topic_key")))
      await runner.query("ALTER TABLE quizzes ADD COLUMN review_topic_key VARCHAR(100) NULL");
    if (!(await runner.hasColumn("quizzes", "review_topic_label")))
      await runner.query("ALTER TABLE quizzes ADD COLUMN review_topic_label VARCHAR(80) NULL");
    await runner.query(`CREATE TABLE IF NOT EXISTS quiz_wrong_items (
      id BIGINT NOT NULL AUTO_INCREMENT, user_id BIGINT NOT NULL, knowledge_base_id BIGINT NOT NULL,
      document_id BIGINT NOT NULL, quiz_id BIGINT NOT NULL, question_id VARCHAR(10) NOT NULL,
      topic_key VARCHAR(100) NULL, topic_label VARCHAR(80) NULL, status VARCHAR(20) NOT NULL,
      wrong_count INT NOT NULL, last_wrong_selection JSON NOT NULL,
      last_wrong_at DATETIME(6) NOT NULL, created_at DATETIME(6) NOT NULL,
      PRIMARY KEY(id), UNIQUE KEY uq_quiz_wrong_question(quiz_id,question_id),
      KEY ix_quiz_wrong_scope(user_id,knowledge_base_id,status),
      CONSTRAINT fk_quiz_wrong_quiz FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await runner.query(`CREATE TABLE IF NOT EXISTS quiz_review_practices (
      id BIGINT NOT NULL AUTO_INCREMENT, user_id BIGINT NOT NULL, knowledge_base_id BIGINT NOT NULL,
      request_id VARCHAR(100) NOT NULL, mode VARCHAR(20) NOT NULL, topic_key VARCHAR(100) NULL,
      topic_label VARCHAR(80) NULL, document_id BIGINT NULL, question_refs JSON NOT NULL,
      status VARCHAR(20) NOT NULL, current_index INT NOT NULL, answers JSON NOT NULL, score DOUBLE NOT NULL,
      correct_count INT NOT NULL, answered_count INT NOT NULL, total_count INT NOT NULL,
      created_at DATETIME(6) NOT NULL, completed_at DATETIME(6) NULL,
      PRIMARY KEY(id), UNIQUE KEY uq_quiz_review_request(user_id,request_id),
      KEY ix_quiz_review_scope(user_id,knowledge_base_id),
      CONSTRAINT fk_quiz_review_library FOREIGN KEY(knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // Previously imported entries may include newer review activity, so never replace them.
    await runner.query(`INSERT INTO quiz_wrong_items
      (user_id,knowledge_base_id,document_id,quiz_id,question_id,status,wrong_count,last_wrong_selection,last_wrong_at,created_at)
      WITH expanded AS (
        SELECT q.user_id,q.knowledge_base_id,q.document_id,q.id AS quiz_id,j.question_id,
          a.id AS attempt_id,a.created_at,JSON_EXTRACT(a.answers,CONCAT('$."',j.question_id,'"')) AS answer
        FROM quizzes q JOIN quiz_attempts a ON a.quiz_id = q.id AND a.user_id = q.user_id
        JOIN document_files d ON d.id = q.document_id AND d.deleted_at IS NULL AND d.user_id = q.user_id AND d.knowledge_base_id = q.knowledge_base_id
        JOIN knowledge_bases b ON b.id = q.knowledge_base_id AND b.deleted_at IS NULL AND b.user_id = q.user_id
        CROSS JOIN JSON_TABLE(q.questions, '$[*]' COLUMNS(question_id VARCHAR(10) PATH '$.id')) j
      ), submitted AS (
        SELECT *,COALESCE(REPLACE(JSON_UNQUOTE(JSON_EXTRACT(answer,'$.submittedAt')),'T',' '),created_at) AS submitted_at,
          JSON_UNQUOTE(JSON_EXTRACT(answer,'$.isCorrect')) AS correctness
        FROM expanded WHERE JSON_UNQUOTE(JSON_EXTRACT(answer,'$.submitted')) = 'true'
          AND JSON_UNQUOTE(JSON_EXTRACT(answer,'$.isCorrect')) IN ('true','false')
      ), ordered AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY quiz_id,question_id ORDER BY submitted_at DESC,attempt_id DESC) AS newest
        FROM submitted
      ), wrong AS (
        SELECT *,ROW_NUMBER() OVER(PARTITION BY quiz_id,question_id ORDER BY submitted_at DESC,attempt_id DESC) AS latest_wrong,
          COUNT(*) OVER(PARTITION BY quiz_id,question_id) AS wrong_count,
          MIN(submitted_at) OVER(PARTITION BY quiz_id,question_id) AS first_wrong
        FROM submitted WHERE correctness = 'false'
      )
      SELECT w.user_id,w.knowledge_base_id,w.document_id,w.quiz_id,w.question_id,
        IF(o.correctness = 'true','mastered','pending'),w.wrong_count,
        COALESCE(JSON_EXTRACT(w.answer,'$.selectedOptionIds'),JSON_ARRAY()),w.submitted_at,w.first_wrong
      FROM wrong w
      JOIN ordered o ON o.quiz_id = w.quiz_id AND o.question_id = w.question_id AND o.newest = 1
      WHERE w.latest_wrong = 1
      ON DUPLICATE KEY UPDATE quiz_wrong_items.id = quiz_wrong_items.id`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query("DROP TABLE IF EXISTS quiz_review_practices");
    await runner.query("DROP TABLE IF EXISTS quiz_wrong_items");
    await runner.query(
      "ALTER TABLE quizzes DROP COLUMN review_topic_key, DROP COLUMN review_topic_label",
    );
  }
}
