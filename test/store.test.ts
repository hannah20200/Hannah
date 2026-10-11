import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertId, safeFile } from "../src/lib/store";

describe("store", () => {
  it("게시물 폴더 밖 경로는 막는다", () => {
    assert.throws(() => safeFile("20261011-ab12", "work", "../../.env.local"), /잘못된 경로/);
    assert.throws(() => safeFile("20261011-ab12", "out", "/etc/passwd"), /잘못된 경로/);
    assert.match(safeFile("20261011-ab12", "work", "photos/a.jpg"), /work\/20261011-ab12\/photos\/a\.jpg$/);
  });

  it("id에 경로 문자를 허용하지 않는다", () => {
    assert.throws(() => assertId("../x"), /잘못된 게시물 id/);
    assert.throws(() => assertId("a/b"), /잘못된 게시물 id/);
    assert.equal(assertId("연말취향"), "연말취향");
  });
});
