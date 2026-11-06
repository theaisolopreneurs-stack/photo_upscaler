import assert from "node:assert/strict";
import { test } from "node:test";
import { tileStarts } from "../src/upscale.mjs";

test("a small image uses one tile", () => {
  assert.deepEqual(tileStarts(100), [0]);
  assert.deepEqual(tileStarts(128), [0]);
});

test("tiles cover the whole image with room to blend", () => {
  for (const size of [129, 200, 683, 1024, 1536, 4000]) {
    const starts = tileStarts(size);
    assert.equal(starts[0], 0);
    assert.equal(starts.at(-1), size - 128);
    for (let i = 1; i < starts.length; i++) {
      const overlap = starts[i - 1] + 128 - starts[i];
      assert.ok(overlap >= 32, `size ${size}: overlap ${overlap}`);
      assert.ok(starts[i] > starts[i - 1], `size ${size}: tiles must advance`);
    }
  }
});
