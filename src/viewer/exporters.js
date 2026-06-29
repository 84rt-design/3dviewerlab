import * as THREE from 'three'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'

// ---- OBJ (official three.js exporter; bakes world transforms) ----
export function toOBJ(object3D) {
  const text = new OBJExporter().parse(object3D)
  return new TextEncoder().encode(text)
}

// ---- FBX 7.4 ASCII (geometry + per-vertex normals, one mesh) ----
// No official three.js FBX exporter exists, so we emit a minimal but valid
// ASCII FBX importable by Blender / Cinema 4D / Maya. All meshes are baked
// into one geometry in world space.
export function toFBX(object3D) {
  const positions = []   // flat xyz per control point
  const normals = []     // flat xyz, ByVertex/Direct
  const polyIdx = []     // polygon vertex indices (last of tri = ~i)
  let cp = 0

  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const nm = new THREE.Matrix3()

  object3D.updateMatrixWorld(true)
  object3D.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    let g = o.geometry
    if (!g.attributes.normal) { g = g.clone(); g.computeVertexNormals() }
    const pos = g.attributes.position
    const nor = g.attributes.normal
    const idx = g.index ? g.index.array : null
    const count = idx ? idx.length : pos.count
    nm.getNormalMatrix(o.matrixWorld)

    for (let i = 0; i < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = idx ? idx[i + k] : i + k
        v.fromBufferAttribute(pos, a).applyMatrix4(o.matrixWorld)
        n.fromBufferAttribute(nor, a).applyMatrix3(nm).normalize()
        positions.push(v.x, v.y, v.z)
        normals.push(n.x, n.y, n.z)
      }
      polyIdx.push(cp, cp + 1, ~(cp + 2))   // ~x encodes polygon end
      cp += 3
    }
  })

  const vCount = positions.length / 3
  const fmt = (arr) => arr.map((x) => (Number.isInteger(x) ? x : +x.toFixed(6))).join(',')

  const fbx = `; FBX 7.4.0 project file
; Exported by 3dviewerLAB
FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreator: "3dviewerLAB"
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UnitScaleFactor", "double", "Number", "", 1
\t}
}
Definitions:  {
\tVersion: 100
\tCount: 2
\tObjectType: "Geometry" {
\t\tCount: 1
\t}
\tObjectType: "Model" {
\t\tCount: 1
\t}
}
Objects:  {
\tGeometry: 1000, "Geometry::3dviewerLAB", "Mesh" {
\t\tVertices: *${positions.length} {
\t\t\ta: ${fmt(positions)}
\t\t}
\t\tPolygonVertexIndex: *${polyIdx.length} {
\t\t\ta: ${polyIdx.join(',')}
\t\t}
\t\tLayerElementNormal: 0 {
\t\t\tVersion: 101
\t\t\tName: ""
\t\t\tMappingInformationType: "ByVertex"
\t\t\tReferenceInformationType: "Direct"
\t\t\tNormals: *${normals.length} {
\t\t\t\ta: ${fmt(normals)}
\t\t\t}
\t\t}
\t\tLayer: 0 {
\t\t\tVersion: 100
\t\t\tLayerElement:  {
\t\t\t\tType: "LayerElementNormal"
\t\t\t\tTypedIndex: 0
\t\t\t}
\t\t}
\t}
\tModel: 2000, "Model::3dviewerLAB", "Mesh" {
\t\tVersion: 232
\t\tProperties70:  {
\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
\t\t}
\t\tShading: T
\t\tCulling: "CullingOff"
\t}
}
Connections:  {
\tC: "OO",2000,0
\tC: "OO",1000,2000
}
`
  void vCount
  return new TextEncoder().encode(fbx)
}
