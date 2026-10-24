import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ALL_TEAMS } from "../dist/src/resonators/teams.js";
import { PORTRAITS } from "../dist/src/page/portrait-assets.js";
import { PORTRAIT_CACHE, portrait, portraitSource } from "../dist/src/page/portraits.js";

const imageResponse = () => new Response("portrait bytes", { headers: { "Content-Type": "image/webp" } });

function mockCache(t, cache) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: cache });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "caches", previous);
    else delete globalThis.caches;
  });
}

test("every available team portrait is a valid content-hashed local WebP", async () => {
  for (const name of new Set(ALL_TEAMS.flatMap((team) => team.loadouts.map((l) => l.resonator.name)))) {
    // Lily is present upstream before Encore publishes her portrait.
    if (name === "Lily") {
      assert.equal(portrait(name), "");
      continue;
    }
    assert.ok(PORTRAITS[name], `Missing portrait: ${name}`);
  }
  for (const filename of new Set(Object.values(PORTRAITS))) {
    const bytes = await readFile(new URL(`../assets/portraits/${filename}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.equal(filename, `${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}.webp`);
  }
  assert.notEqual(PORTRAITS.Xuanling, PORTRAITS["Aero Rover"]);
  assert.equal(PORTRAITS["Havoc Rover"], PORTRAITS["Aero Rover"]);
  assert.equal(portrait("Enemy"), "");
  assert.equal(portrait("constructor"), "");
  assert.match(portrait("Verina"), /alt="" width="24" height="24"/);
});

test("a saved portrait is reused without fetching", async (t) => {
  mockCache(t, {
    async open(name) {
      assert.equal(name, PORTRAIT_CACHE);
      return { match: async () => imageResponse() };
    },
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Cache hit must not fetch");
  });
  t.mock.method(URL, "createObjectURL", () => "blob:cached");
  assert.equal(await portraitSource("https://example.test/cached.webp"), "blob:cached");
});

test("a new portrait downloads once, persists, and shares its URL across rows", async (t) => {
  const stored = new Map();
  mockCache(t, {
    async open() {
      return {
        match: async (source) => stored.get(source),
        put: async (source, response) => {
          stored.set(source, response);
        },
      };
    },
  });
  const fetched = t.mock.method(globalThis, "fetch", async (_source, options) => {
    assert.equal(options.cache, "force-cache");
    return imageResponse();
  });
  const created = t.mock.method(URL, "createObjectURL", () => "blob:new");
  const source = "https://example.test/new.webp";
  assert.deepEqual(await Promise.all([portraitSource(source), portraitSource(source)]), ["blob:new", "blob:new"]);
  assert.equal(await portraitSource(source), "blob:new");
  assert.equal(fetched.mock.callCount(), 1);
  assert.equal(created.mock.callCount(), 1);
  assert.equal(await stored.get(source).text(), "portrait bytes");
});

test("blocked storage and a full cache still display portraits", async (t) => {
  let blocked = true;
  mockCache(t, {
    async open() {
      if (blocked) throw new Error("Storage denied");
      return {
        match: async () => undefined,
        put: async () => {
          throw new Error("Quota exceeded");
        },
      };
    },
  });
  t.mock.method(globalThis, "fetch", async () => imageResponse());
  t.mock.method(URL, "createObjectURL", () => "blob:fallback");
  assert.equal(await portraitSource("https://example.test/blocked.webp"), "blob:fallback");
  blocked = false;
  assert.equal(await portraitSource("https://example.test/full.webp"), "blob:fallback");
});

test("failed image requests are not cached and can retry", async (t) => {
  let puts = 0;
  mockCache(t, {
    async open() {
      return {
        match: async () => undefined,
        put: async () => {
          puts++;
        },
      };
    },
  });
  const fetched = t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  t.mock.method(URL, "createObjectURL", () => "blob:retry");
  const source = "https://example.test/retry.webp";
  await assert.rejects(portraitSource(source), /Portrait request failed: 404/);
  assert.equal(puts, 0);
  fetched.mock.mockImplementation(async () => new Response("error page", { headers: { "Content-Type": "text/html" } }));
  await assert.rejects(portraitSource(source), /Portrait request failed/);
  assert.equal(puts, 0);
  fetched.mock.mockImplementation(async () => imageResponse());
  assert.equal(await portraitSource(source), "blob:retry");
  assert.equal(puts, 1);
});
