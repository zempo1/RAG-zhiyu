import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { Answers } from "../quiz-data";

export interface QuizReviewQuestionRef {
  quizId: number;
  questionId: string;
}

@Entity("quiz_review_categories")
@Index(["knowledgeBaseId", "topicKey"], { unique: true })
export class QuizReviewCategory {
  @PrimaryGeneratedColumn({ type: "bigint" }) id: number;
  @Column({ type: "bigint", name: "user_id" }) userId: number;
  @Column({ type: "bigint", name: "knowledge_base_id" }) knowledgeBaseId: number;
  @Column({ type: "varchar", length: 100, name: "topic_key" }) topicKey: string;
  @Column({ type: "varchar", length: 80, name: "topic_label" }) topicLabel: string;
  @Column({ type: "datetime", precision: 6, name: "created_at" }) createdAt: string;
}

@Entity("quiz_wrong_items")
@Index(["quizId", "questionId"], { unique: true })
@Index(["userId", "knowledgeBaseId", "status"])
export class QuizWrongItem {
  @PrimaryGeneratedColumn({ type: "bigint" }) id: number;
  @Column({ type: "bigint", name: "user_id" }) userId: number;
  @Column({ type: "bigint", name: "knowledge_base_id" }) knowledgeBaseId: number;
  @Column({ type: "bigint", name: "document_id" }) documentId: number;
  @Column({ type: "bigint", name: "quiz_id" }) quizId: number;
  @Column({ type: "varchar", length: 10, name: "question_id" }) questionId: string;
  @Column({ type: "varchar", length: 100, nullable: true, name: "topic_key" }) topicKey:
    string | null;
  @Column({ type: "varchar", length: 80, nullable: true, name: "topic_label" }) topicLabel:
    string | null;
  @Column({ type: "varchar", length: 20 }) status: "pending" | "mastered";
  @Column({ type: "int", name: "wrong_count" }) wrongCount: number;
  @Column({ type: "json", name: "last_wrong_selection" }) lastWrongSelection: string[];
  @Column({ type: "datetime", precision: 6, name: "last_wrong_at" }) lastWrongAt: string;
  @Column({ type: "datetime", precision: 6, name: "created_at" }) createdAt: string;
}

@Entity("quiz_review_practices")
@Index(["userId", "requestId"], { unique: true })
@Index(["userId", "knowledgeBaseId"])
export class QuizReviewPractice {
  @PrimaryGeneratedColumn({ type: "bigint" }) id: number;
  @Column({ type: "bigint", name: "user_id" }) userId: number;
  @Column({ type: "bigint", name: "knowledge_base_id" }) knowledgeBaseId: number;
  @Column({ type: "varchar", length: 100, name: "request_id" }) requestId: string;
  @Column({ type: "varchar", length: 20 }) mode: "original" | "variant";
  @Column({ type: "varchar", length: 100, nullable: true, name: "topic_key" }) topicKey:
    string | null;
  @Column({ type: "varchar", length: 80, nullable: true, name: "topic_label" }) topicLabel:
    string | null;
  @Column({ type: "bigint", nullable: true, name: "document_id" }) documentId: number | null;
  @Column({ type: "json", name: "question_refs" }) questionRefs: QuizReviewQuestionRef[];
  @Column({ type: "varchar", length: 20 }) status: "in_progress" | "completed" | "invalidated";
  @Column({ type: "int", name: "current_index" }) currentIndex: number;
  @Column({ type: "json" }) answers: Answers;
  @Column({ type: "double" }) score: number;
  @Column({ type: "int", name: "correct_count" }) correctCount: number;
  @Column({ type: "int", name: "answered_count" }) answeredCount: number;
  @Column({ type: "int", name: "total_count" }) totalCount: number;
  @Column({ type: "datetime", precision: 6, name: "created_at" }) createdAt: string;
  @Column({ type: "datetime", precision: 6, nullable: true, name: "completed_at" })
  completedAt: string | null;
}
