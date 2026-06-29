import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import occtimportjs from 'occt-import-js'
// Vite resolves the wasm binary to a served URL
import wasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'

let _occt = null
async function getOcct() {
  if (!_occt) _occt = await occtimportjs({ locateFile: () => wasmUrl })
  return _occt
}

// Signed volume of a mesh: negative = triangle winding inverted.
function signedVolume(g) {
  const p = g.attributes.position
  if (!p) return 1
  const idx = g.index ? g.index.array : null
  const n = idx ? idx.length : p.count
  let v = 0
  for (let i = 0; i < n; i += 3) {
    const a = idx ? idx[i] : i, b = idx ? idx[i + 1] : i + 1, c = idx ? idx[i + 2] : i + 2
    const x1 = p.getX(a), y1 = p.getY(a), z1 = p.getZ(a)
    const x2 = p.getX(b), y2 = p.getY(b), z2 = p.getZ(b)
    const x3 = p.getX(c), y3 = p.getY(c), z3 = p.getZ(c)
    v += x1 * (y2 * z3 - y3 * z2) - y1 * (x2 * z3 - x3 * z2) + z1 * (x2 * y3 - x3 * y2)
  }
  return v
}

// Detect + repair inverted normals: flip winding when signed volume is
// negative, recompute vertex normals, force DoubleSide as safety net.
export function fixNormals(root) {
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const g = o.geometry
    if (signedVolume(g) < 0) {
      if (g.index) {
        const idx = g.index.array
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t
        }
        g.index.needsUpdate = true
      } else {
        const pos = g.attributes.position.array
        for (let i = 0; i < pos.length; i += 9) {
          for (let k = 0; k < 3; k++) {
            const a = i + 3 + k, b = i + 6 + k
            const t = pos[a]; pos[a] = pos[b]; pos[b] = t
          }
        }
        g.attributes.position.needsUpdate = true
      }
      g.computeVertexNormals()
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    mats.forEach((m) => { if (m) m.side = THREE.DoubleSide })
  })
}

const defaultMaterial = () =>
  new THREE.MeshStandardMaterial({
    color: 0x9a9aa2, metalness: 0.15, roughness: 0.6
  })

// Build a THREE.Group from occt-import-js result meshes.
function occtToGroup(result) {
  const group = new THREE.Group()
  for (const m of result.meshes) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3))
    if (m.attributes.normal) {
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3))
    } else {
      geo.computeVertexNormals()
    }
    if (m.index) geo.setIndex(new THREE.Uint32BufferAttribute(m.index.array, 1))

    const mat = defaultMaterial()
    if (m.color) mat.color = new THREE.Color(m.color[0], m.color[1], m.color[2])
    const mesh = new THREE.Mesh(geo, mat)
    mesh.name = m.name || 'Solid'
    group.add(mesh)
  }
  return group
}

// Dispatch on extension. `data` is an ArrayBuffer.
// Returns { object: THREE.Object3D, format: string }.
export async function loadModel({ name, ext, data }) {
  let out
  switch (ext) {
    case 'obj': {
      const text = new TextDecoder().decode(data)
      const obj = new OBJLoader().parse(text)
      obj.traverse((o) => { if (o.isMesh && !o.material) o.material = defaultMaterial() })
      out = { object: obj, format: 'OBJ' }
      break
    }
    case 'fbx': {
      out = { object: new FBXLoader().parse(data, ''), format: 'FBX' }
      break
    }
    case 'step':
    case 'stp': {
      const occt = await getOcct()
      const result = occt.ReadStepFile(new Uint8Array(data), null)
      if (!result || !result.success) throw new Error('STEP parse failed')
      out = { object: occtToGroup(result), format: 'STEP' }
      break
    }
    default:
      throw new Error(`Unsupported format: .${ext}`)
  }
  fixNormals(out.object)
  return out
}

export const SUPPORTED = ['obj', 'fbx', 'step', 'stp']
