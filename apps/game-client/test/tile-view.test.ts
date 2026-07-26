import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadTileView() {
  const source = readFileSync(new URL("../utils/tile-view.js", import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports });
  return module.exports;
}

test("tile view maps every tile kind to a local image asset", () => {
  const { tileView } = loadTileView();
  for (let kind = 0; kind < 34; kind += 1) {
    const tile = tileView({ id: kind * 4, kind });
    assert.equal(tile.imagePath, `/assets/tiles/tile-${kind}.png`);
    assert.equal(existsSync(new URL(`../assets/tiles/tile-${kind}.png`, import.meta.url)), true);
  }
  assert.equal(tileView({ id: 44, kind: 11 }).suitClass, "tong");
  assert.equal(tileView({ id: 96, kind: 24 }).suitClass, "tiao");
  assert.equal(tileView({ id: 124, kind: 31 }).suitClass, "honor");
});
