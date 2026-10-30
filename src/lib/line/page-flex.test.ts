import { describe, expect, it } from "vitest";
import { buildOpenPageCard, PAGE_INFO, type PageKey } from "./page-flex";

describe("open-page card", () => {
  it.each(Object.keys(PAGE_INFO) as PageKey[])(
    "%s has a title, a hint and a button to the page",
    (page) => {
      const json = JSON.stringify(buildOpenPageCard(page, `https://liff.line.me/x/${page}`));
      expect(json).toContain(PAGE_INFO[page].title);
      expect(json).toContain(PAGE_INFO[page].hint);
      expect(json).toContain(`"uri":"https://liff.line.me/x/${page}"`);
      expect(json).toContain(`เปิดหน้า${PAGE_INFO[page].title}`);
    },
  );
});
