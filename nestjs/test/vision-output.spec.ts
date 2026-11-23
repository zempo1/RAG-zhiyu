import { parseVisualBlocks } from "../src/modules/documents/parsers/pdf/vision/vision-output";

it("accepts empty optional OCR rows without discarding valid content", () => {
  expect(
    parseVisualBlocks({
      blocks: [
        { type: "ocr", text: "" },
        { type: "figure", text: "A → B" },
      ],
    }),
  ).toEqual([{ type: "figure", text: "A → B" }]);
});
it("keeps rejecting unknown types and missing structures with useful schema details", () => {
  expect(() => parseVisualBlocks({ blocks: [{ type: "bogus", text: "A" }] })).toThrow(/blocks\[0\]/);
  expect(() => parseVisualBlocks({ unexpected: [] })).toThrow(/blocks/);
});
