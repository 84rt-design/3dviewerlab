import * as THREE from 'three'

const UNIT = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4 }

// Right-hand panel: object info, dimensions, export formats.
export class InfoPanel {
  constructor(rootEl) {
    this.root = rootEl
    this.data = null
    this.unit = 'mm'
    this.empty()
  }

  empty() {
    this.root.innerHTML = `
      <div class="section">
        <div class="section__title">Object Information</div>
        <div class="kv"><span>Status</span><b>No model loaded</b></div>
      </div>`
  }

  setUnit(u) { this.unit = u; if (this.data) this.render() }

  // metrics: { name, format, box, vertices, faces }
  set(metrics) { this.data = metrics; this.render() }

  _dims() {
    const s = this.data.box.getSize(new THREE.Vector3())
    const k = UNIT[this.unit]
    const u = this.unit
    return {
      x: `${(s.x * k).toFixed(1)} ${u}`,
      y: `${(s.y * k).toFixed(1)} ${u}`,
      z: `${(s.z * k).toFixed(1)} ${u}`
    }
  }

  render() {
    const d = this.data
    const dim = this._dims()
    const v = d.volume
    const cap = v
      ? `
      <div class="section">
        <div class="section__title">Capacité (contenance)
          ${v.simulated ? `<span class="badge" title="Mesh ouvert : contenant simulé en bouchant ${v.holes} ouverture(s)">SIMULÉE · ${v.holes} trou${v.holes > 1 ? 's' : ''}</span>` : '<span class="badge badge--ok">FERMÉ</span>'}
        </div>
        <div class="kv"><span>Volume</span><b>${v.mlRounded} ml</b></div>
        <div class="kv"><span></span><b class="muted">exact ${v.ml.toFixed(1)} ml · ${v.liters.toFixed(3)} L</b></div>
      </div>`
      : ''
    this.root.innerHTML = `
      <div class="section">
        <div class="section__title">Object Information</div>
        <div class="kv"><span>Name</span><b>${d.name}</b></div>
        <div class="kv"><span>Format</span><b>${d.format}</b></div>
        <div class="kv"><span>Vertices</span><b>${d.vertices.toLocaleString()}</b></div>
        <div class="kv"><span>Faces</span><b>${d.faces.toLocaleString()}</b></div>
      </div>
      <div class="section">
        <div class="section__title">Dimensions</div>
        <div class="kv"><span>Width (X)</span><b>${dim.x}</b></div>
        <div class="kv"><span>Height (Y)</span><b>${dim.y}</b></div>
        <div class="kv"><span>Depth (Z)</span><b>${dim.z}</b></div>
      </div>
      ${cap}
      <div class="section">
        <div class="section__title">Source File</div>
        <div class="kv"><span>File</span><b>${d.name}</b></div>
      </div>`
  }
}

// Count vertices/faces across a hierarchy.
export function meshStats(object3D) {
  let vertices = 0, faces = 0
  object3D.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    const g = o.geometry
    const pos = g.attributes.position
    if (pos) vertices += pos.count
    if (g.index) faces += g.index.count / 3
    else if (pos) faces += pos.count / 3
  })
  return { vertices, faces: Math.round(faces) }
}
