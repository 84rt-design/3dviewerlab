import * as THREE from 'three'

const SVGNS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVGNS, tag)
  for (const k in attrs) n.setAttribute(k, attrs[k])
  return n
}

// Unit conversion from internal millimeters.
const UNIT = { mm: 1, cm: 0.1, m: 0.001, in: 1 / 25.4 }
const UNIT_LABEL = { mm: 'mm', cm: 'cm', m: 'm', in: 'in' }

// Animated dimension overlay (measure mode). Each cote grows from its
// CENTER toward both extremities, value counting up, ticks landing at the
// ends. Re-projects every frame so annotations track orbit/zoom.
// Fully model-adaptive: spans + offsets derive from the model bounding box.
export class Dimensions {
  constructor(viewer, svg) {
    this.viewer = viewer
    this.svg = svg
    this.specs = []
    this.unit = 'mm'
    this.t0 = 0
    this.visible = true
    viewer.onFrame.push(() => this._render())
  }

  setUnit(u) { this.unit = u }
  setVisible(v) {
    this.visible = v
    if (v) this.restart()          // re-play center-out animation each time
    else this.svg.replaceChildren()
  }

  // Build dimension specs from a fresh bounding box. Restarts the draw-on anim.
  build(box) {
    const size = box.getSize(new THREE.Vector3())
    const min = box.min, max = box.max
    const cx = (min.x + max.x) / 2
    const cz = (min.z + max.z) / 2
    const off = Math.max(size.x, size.y, size.z) * 0.14 || 0.2

    // each spec: measured span p1→p2, world offset dir, raw length (mm-internal)
    this.specs = [
      { // WIDTH  — along X, dropped below front edge
        key: 'WIDTH',
        p1: new THREE.Vector3(min.x, min.y, max.z),
        p2: new THREE.Vector3(max.x, min.y, max.z),
        dir: new THREE.Vector3(0, -1, 0),
        len: size.x
      },
      { // HEIGHT — along Y, on left side
        key: 'HEIGHT',
        p1: new THREE.Vector3(min.x, min.y, max.z),
        p2: new THREE.Vector3(min.x, max.y, max.z),
        dir: new THREE.Vector3(-1, 0, 0),
        len: size.y
      },
      { // DIAMETER/DEPTH — along Z, top
        key: size.x.toFixed(2) === size.z.toFixed(2) ? 'DIAMETER' : 'DEPTH',
        p1: new THREE.Vector3(max.x, max.y, min.z),
        p2: new THREE.Vector3(max.x, max.y, max.z),
        dir: new THREE.Vector3(0, 1, 0),
        len: size.z
      }
    ].map((s, i) => {
      const a1 = s.p1.clone().addScaledVector(s.dir, off)
      const a2 = s.p2.clone().addScaledVector(s.dir, off)
      return {
        ...s,
        off,
        delay: i * 0.22,                                   // staggered start (s)
        a1, a2,
        mid: a1.clone().add(a2).multiplyScalar(0.5)        // grow origin
      }
    })

    this.t0 = performance.now()
  }

  restart() { this.t0 = performance.now() }

  _fmt(lenMm) {
    const v = lenMm * UNIT[this.unit]
    return `${v.toFixed(1)} ${UNIT_LABEL[this.unit]}`
  }

  _render() {
    if (!this.visible || !this.specs.length) return
    const now = (performance.now() - this.t0) / 1000
    const DUR = 0.7
    const frag = document.createDocumentFragment()

    for (const s of this.specs) {
      // eased 0→1 draw-on progress with per-cote stagger
      let t = (now - s.delay) / DUR
      t = Math.max(0, Math.min(1, t))
      t = t < 1 ? 1 - Math.pow(1 - t, 3) : 1   // easeOutCubic

      if (t <= 0) continue

      // grow from center: world heads move mid → a1 and mid → a2
      const h1w = s.mid.clone().lerp(s.a1, t)
      const h2w = s.mid.clone().lerp(s.a2, t)
      const H1 = this.viewer.project(h1w)
      const H2 = this.viewer.project(h2w)
      const A1 = this.viewer.project(s.a1)
      const A2 = this.viewer.project(s.a2)
      const E1 = this.viewer.project(s.p1)
      const E2 = this.viewer.project(s.p2)
      if (A1.behind || A2.behind) continue

      // main dimension bar, symmetric from center
      frag.append(el('line', {
        class: 'cote-line', x1: H1.x, y1: H1.y, x2: H2.x, y2: H2.y, opacity: Math.min(1, t * 2)
      }))

      // once fully extended: extension lines + end ticks
      if (t >= 1) {
        frag.append(el('line', { class: 'cote-dim', x1: E1.x, y1: E1.y, x2: A1.x, y2: A1.y }))
        frag.append(el('line', { class: 'cote-dim', x1: E2.x, y1: E2.y, x2: A2.x, y2: A2.y }))
        for (const [P, Q] of [[A1, A2], [A2, A1]]) {
          // perpendicular end tick (CAD style)
          const dx = P.x - Q.x, dy = P.y - Q.y
          const L = Math.hypot(dx, dy) || 1
          const nx = -dy / L * 5, ny = dx / L * 5
          frag.append(el('line', {
            class: 'cote-tick', x1: P.x - nx, y1: P.y - ny, x2: P.x + nx, y2: P.y + ny
          }))
        }
      }

      // label at center, value counts up with the spread
      const M = this.viewer.project(s.mid)
      const label = el('text', {
        class: 'cote-label', x: M.x, y: M.y - 9, 'text-anchor': 'middle',
        opacity: Math.min(1, t * 1.5)
      })
      label.textContent = this._fmt(s.len * t)
      const tag = el('text', {
        class: 'cote-key', x: M.x, y: M.y - 24, 'text-anchor': 'middle',
        opacity: t >= 1 ? 1 : 0
      })
      tag.textContent = s.key
      frag.append(label, tag)
    }
    this.svg.replaceChildren(frag)
  }
}
