import { AnalysisService } from "../src/modules/analysis/analysis.service";
import { AnalysisTypeDto } from "../src/modules/analysis/dto/analysis-type.dto";
import { GenerateAnalysisDto } from "../src/modules/analysis/dto/generate-analysis.dto";
import { MemoryStore } from "../src/persistence/memory.store";
import { validate } from "class-validator";

it("rejects the removed OUTLINE type at both API and service boundaries", async () => {
  const list = Object.assign(new AnalysisTypeDto(), { type: "OUTLINE" });
  const generate = Object.assign(new GenerateAnalysisDto(), { documentId: 11, type: "OUTLINE" });
  expect((await validate(list)).map((error) => error.property)).toContain("type");
  expect((await validate(generate)).map((error) => error.property)).toContain("type");
  const store = new MemoryStore();
  await store.save("analyses", { id: 1, userId: 1, type: "OUTLINE" });
  const service = new AnalysisService(null as any, null as any, store);
  await expect(service.list("OUTLINE", 1)).rejects.toThrow("不支持的分析类型");
  await expect(service.generate(11, "OUTLINE", 1)).rejects.toThrow("不支持的分析类型");
  await expect(service.delete(1, 1)).rejects.toThrow();
});

it.each(["SUMMARY", "FLASHCARD"])("isolates %s by authorized live source library", async (type) => {
  const store = new MemoryStore();
  await store.save("knowledgeBases", { id: 1, userId: 1 });
  await store.save("knowledgeBases", { id: 2, userId: 1 });
  await store.save("knowledgeBases", { id: 3, userId: 2 });
  for (const [id, kb] of [
    [11, 1],
    [12, 2],
    [13, 3],
    [14, 1],
  ]) {
    await store.save("documents", {
      id,
      knowledgeBaseId: kb,
      userId: kb === 3 ? 2 : 1,
      deletedAt: id === 14 ? "deleted" : null,
    });
    await store.save("analyses", {
      id,
      documentId: id,
      userId: 1,
      type,
      createdAt: "2026-11-16",
    });
  }
  const service = new AnalysisService(null as any, null as any, store);
  expect((await service.list(type, 1, 1)).map((r) => r.id)).toEqual([11]);
  expect((await service.list(type, 1, 2)).map((r) => r.id)).toEqual([12]);
  await expect(service.list(type, 1, 3)).rejects.toThrow();
});
