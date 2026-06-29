import * as THREE from 'three'

// Capacity of a 3D model, in millilitres (model units assumed = mm).
//
// Closed mesh  -> signed-volume sum (divergence theorem), exact.
// Open mesh    -> "version vide": we SIMULATE the container by capping every
//                 open boundary loop (the rim/openings) with a fan to its
//                 centroid, then take the enclosed volume. For single-surface
//                 shells (typical product/cosmetic models) this equals the
//                 true internal capacity.
//
// Returns { closed, holes, mm3, ml, liters, mlRounded, simulated }.
export function computeVolume(object3D) {
  object3D.updateMatrixWorld(true)

  // ---- gather welded triangles in world space ----
  const verts = []                 // unique positions [Vector3]
  const tris = []                  // [i0,i1,i2] welded indices
  const map = new Map()            // quantized pos -> index

  // weld tolerance from overall size
  const bbox = new THREE.Box3().setFromObject(object3D)
  const diag = bbox.getSize(new THREE.Vector3()).length() || 1
  const q = diag / 1e6
  const key = (x, y, z) => `${Math.round(x / q)}_${Math.round(y / q)}_${Math.round(z / q)}`

  const tmp = new THREE.Vector3()
  const weld = (x, y, z) => {
    const k = key(x, y, z)
    let i = map.get(k)
    if (i === undefined) { i = verts.length; verts.push(new THREE.Vector3(x, y, z)); map.set(k, i) }
    return i
  }

  object3D.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes.position) return
    const pos = o.geometry.attributes.position
    const idx = o.geometry.index ? o.geometry.index.array : null
    const count = idx ? idx.length : pos.count
    const m = o.matrixWorld
    for (let i = 0; i < count; i += 3) {
      const t = []
      for (let k = 0; k < 3; k++) {
        const a = idx ? idx[i + k] : i + k
        tmp.fromBufferAttribute(pos, a).applyMatrix4(m)
        t.push(weld(tmp.x, tmp.y, tmp.z))
      }
      if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) tris.push(t)
    }
  })

  // ---- find boundary (open) edges: undirected edge used by only 1 triangle ----
  const edgeCount = new Map()      // "min_max" -> count
  const dirEdges = new Map()       // "min_max" -> directed [a,b] as first seen
  const ek = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`)
  for (const [a, b, c] of tris) {
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const k = ek(x, y)
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1)
      if (!dirEdges.has(k)) dirEdges.set(k, [x, y])
    }
  }
  const boundary = []              // directed boundary edges [a,b]
  for (const [k, n] of edgeCount) if (n === 1) boundary.push(dirEdges.get(k))

  // ---- chain boundary edges into loops, cap each with a centroid fan ----
  const capTris = []
  if (boundary.length) {
    const fromStart = new Map()    // start vertex -> [a,b]
    for (const e of boundary) {
      if (!fromStart.has(e[0])) fromStart.set(e[0], [])
      fromStart.get(e[0]).push(e)
    }
    const used = new Set()
    for (const seed of boundary) {
      if (used.has(seed)) continue
      // walk the loop
      const loop = []
      let cur = seed
      let guard = 0
      while (cur && !used.has(cur) && guard++ < boundary.length + 2) {
        used.add(cur)
        loop.push(cur)
        const nexts = fromStart.get(cur[1])
        cur = nexts ? nexts.find((e) => !used.has(e)) : null
      }
      if (loop.length < 3) continue
      // centroid of loop
      const cen = new THREE.Vector3()
      for (const [a] of loop) cen.add(verts[a])
      cen.multiplyScalar(1 / loop.length)
      const ci = verts.length; verts.push(cen)
      // cap fan: (centroid, b, a) closes the hole consistently with the shell
      for (const [a, b] of loop) capTris.push([ci, b, a])
    }
  }

  // ---- signed volume of (shell + caps) ----
  const all = capTris.length ? tris.concat(capTris) : tris
  let vol6 = 0
  const cross = new THREE.Vector3()
  for (const [i0, i1, i2] of all) {
    const a = verts[i0], b = verts[i1], c = verts[i2]
    cross.crossVectors(b, c)
    vol6 += a.dot(cross)
  }

  const mm3 = Math.abs(vol6) / 6
  const ml = mm3 / 1000            // 1 ml = 1 cm³ = 1000 mm³
  return {
    closed: boundary.length === 0,
    holes: capTris.length ? new Set(capTris.map((t) => t[0])).size : 0,
    simulated: boundary.length > 0,
    mm3,
    ml,
    liters: ml / 1000,
    // rounded to nearest 10 ml (153 -> 150, 46 -> 50)
    mlRounded: Math.round(ml / 10) * 10
  }
}
