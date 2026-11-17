// node mod/tests/test_mapmath.mjs  (mapmath.js: the world map's stand-in tiles while zooming)
import * as mm from "../beamng_earth/ui/ui-vue/mods/beamngEarth/mapmath.js"
import assert from "node:assert"
import { readFileSync } from "node:fs"
import test from "node:test"
import { runInNewContext } from "node:vm"
const tiles = mm.visibleTiles(39.28, -76.59, 10.5, 1280, 720)
const z = tiles[0].z
// nothing ready: no stand-ins
assert.deepEqual(mm.fallbackTiles(tiles, new Set()), [])
// every parent at z-1 ready: each missing tile covered by its parent, scaled 2x, placed over it
const ready = new Set(tiles.map(t => `${z - 1}/${Math.floor(t.x / 2)}/${Math.floor(t.y / 2)}`))
const fb = mm.fallbackTiles(tiles, ready)
assert.ok(fb.length > 0 && fb.every(f => f.z === z - 1 && Math.abs(f.size - tiles[0].size * 2) < 1e-9))
for (const t of tiles) {
  const p = fb.find(f => f.x === Math.floor(t.x / 2) && f.y === Math.floor(t.y / 2))
  assert.ok(p && p.left <= t.left + 1e-6 && p.top <= t.top + 1e-6 && p.left + p.size >= t.left + t.size - 1e-6, "covers it")
}
// a tile that is ready itself needs no stand-in
const one = new Set([...ready, `${z}/${tiles[0].x}/${tiles[0].y}`])
assert.ok(mm.fallbackTiles([tiles[0]], one).length === 0)
console.log("mapmath fallback ok:", fb.length, "stand-ins for", tiles.length, "tiles")

// overlay layers
{
  const lines = [[-10, 50, 10, 50], [100, 10, 110, 12]]
  const boxes = mm.lineBoxes(lines)
  assert.deepStrictEqual(boxes[0], [-10, 50, 10, 50])
  const vis = mm.visibleLines(lines, boxes, 50, 0, 5, 800, 600)
  assert.strictEqual(vis.length, 1, "only the line in view")
  assert.ok(/^[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+$/.test(vis[0]))
  const pts = [["Big", 0, 50, 2], ["Small", 0.4, 50, 9], ["Near", 0.02, 50.0, 2]]
  const lab = mm.visibleLabels(pts, 50, 0, 5, 800, 600)
  assert.deepStrictEqual(lab.map(l => l.name), ["Big"], "small ones wait for their zoom, overlapping ones are left out")
  assert.deepStrictEqual(mm.visibleLabels(pts, 50, 0, 10, 800, 600).map(l => l.name), ["Big", "Small"])
  assert.strictEqual(mm.visibleLabels(pts, 50, 0, 5, 800, 600, { maxZoom: 4 }).length, 0)
  const vb = mm.viewBox(0, 179.9, 6, 800, 600)
  assert.ok(vb[0] > vb[2], "a view over the antimeridian")
  // zoomed far out (the world 512 px wide in a 2000 px view): a line across the copies' seam (180 deg from the view's
  // centre) stays in one piece (no stroke across the map, the user 2026-11-08) and is drawn in every copy on screen
  const seam = [[25, 22, 40, 22]]
  const far = mm.visibleLines(seam, mm.lineBoxes(seam), 30, -148, 1, 2000, 1000)
  assert.ok(far.length >= 3, "the line in each copy of the world on screen: " + far.length)
  for (const f of far) {
    const xs = f.split(" ").map(q => Number(q.split(",")[0]))
    assert.ok(Math.abs(xs[1] - xs[0]) < 40, "a 15 degree line stays ~21 px long, not a stroke across the map: " + f)
  }
  console.log("mapmath layers ok")
}

// the map's credits by area
{
  const imagery = [["Swiss", 5.9, 45.8, 10.5, 47.8], ["Maryland", -79.5, 37.9, -75.0, 39.7], ["EOX"]]
  const paris = mm.viewBox(48.85, 2.35, 10, 800, 600, 0)
  assert.strictEqual(mm.creditsFor(imagery, "Elevation: X", paris), "Map imagery: EOX; Elevation: X")
  const bern = mm.viewBox(46.95, 7.45, 10, 800, 600, 0)
  assert.strictEqual(mm.creditsFor(imagery, "", bern), "Map imagery: Swiss; EOX")
  console.log("mapmath credits ok")
}

// the search box's places (GitHub #601: no saved places): an empty Lua list arrives as {}, and spreading it threw
{
  assert.deepEqual(mm.luaList({}), [])
  assert.deepEqual(mm.luaList(null), [])
  assert.deepEqual(mm.luaList({ 1: { name: "a" } }), [{ name: "a" }])
  assert.deepEqual(mm.searchList({}, {}), [])
  const got = mm.searchList({}, [{ text: "Fells Point", lat: 39.28, lon: -76.59 }])
  assert.equal(got.length, 1)
  assert.equal(got[0].name, "Fells Point")
  assert.deepEqual(mm.searchPlaces(got, "fells").map(p => p.name), ["Fells Point"])
  assert.deepEqual(mm.searchList([{ name: "Home" }], {}).map(p => p.name), ["Home"])
  console.log("mapmath search list ok")
}

// Run the component's script with a stubbed UI bridge and clock. This covers the entry path without BeamNG's Vue bundle.
function openMap(props = { embedded: false }, reducedMotion = false) {
  const vue = readFileSync(new URL("../beamng_earth/ui/ui-vue/mods/beamngEarth/EarthMap.vue", import.meta.url), "utf8")
  const script = vue.split("<script setup>")[1].split("</script>")[0].replace(/^import .+$/gm, "")
  const frames = new Map()
  let time = 0, frameId = 0, refresh, mount
  const player = { lat: 21, lon: 179.99 }
  const ref = value => ({ value })
  const map = runInNewContext(script + "\n;({ view, viewEl, wanted, zoomBy })", {
    mm, ref, shallowRef: ref,
    computed: fn => ({ get value() { return fn() } }),
    defineProps: () => props,
    onMounted: fn => { mount = fn },
    watch() {}, onUnmounted() {}, nextTick() {},
    useEvents: () => ({ on() {} }),
    layerData: { borders: [], states: [], countries: [], places: [] },
    setTimeout() {}, clearTimeout() {},
    setInterval: fn => { refresh = fn },
    performance: { now: () => time },
    window: {
      bngApi: { engineLua: (command, cb) => { if (cb) cb({ player, mapPort: 1 }) } },
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId },
    },
  })
  map.viewEl.value = { addEventListener() {} }
  mount()
  return { ...map, player, refresh, frames, step(ms) {
    time += ms
    const pending = [...frames.values()]
    frames.clear()
    for (const fn of pending) fn(time)
  } }
}

test("2D map opens by zooming out from the car once and yields to manual zoom", () => {
  const map = openMap()
  assert.equal(map.view.value.lat, map.player.lat)
  assert.equal(map.view.value.lon, map.player.lon)
  const initial = map.view.value.z
  assert.ok(initial > 12, "opens close to the car")
  assert.ok(map.wanted.value.length && map.wanted.value.every(t => t.z === 12), "uses the final imagery level")
  map.step(300)
  assert.ok(map.view.value.z < initial && map.view.value.z > 12, "zooms out across frames")
  map.step(700)
  assert.equal(map.view.value.z, 12)
  map.refresh()
  assert.equal(map.frames.size, 0, "polling does not replay the animation")

  const manual = openMap()
  manual.zoomBy(-1)
  const zoom = manual.view.value.z
  manual.step(300)
  assert.equal(manual.view.value.z, zoom, "manual zoom takes over")
  assert.equal(manual.frames.size, 0)

  for (const map of [openMap({ embedded: true }), openMap({ embedded: false }, true)]) {
    assert.equal(map.view.value.z, 12)
    assert.equal(map.frames.size, 0)
  }
})

