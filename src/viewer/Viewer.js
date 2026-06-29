import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Core scene wrapper. Owns renderer, camera, controls, lights, grid.
// Model-adaptive: camera/grid/lights rescale to whatever model is loaded.
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas
    this.modelRoot = null
    this.onFrame = []          // per-frame callbacks (overlay sync, etc.)

    this.scene = new THREE.Scene()
    this.scene.background = this._studioBackdrop()

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha: false
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    // soft studio environment for PBR reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1e6)
    this.camera.position.set(3, 2, 4)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.rotateSpeed = 0.85

    this._buildLights()
    this._buildGround()

    this._raf = this._raf.bind(this)
    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()
    this.renderer.setAnimationLoop(this._raf)
  }

  // Radial-gradient studio backdrop (photo-shoot cyclorama look).
  _studioBackdrop() {
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(512, 400, 60, 512, 520, 760)
    grad.addColorStop(0, '#303034')
    grad.addColorStop(0.45, '#19191c')
    grad.addColorStop(1, '#080809')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 1024)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.18))

    // top spot — product-shot pool of light
    const spot = new THREE.SpotLight(0xffffff, 60, 0, Math.PI / 4.5, 0.55, 1.6)
    spot.position.set(0, 8, 2.5)
    spot.castShadow = true
    spot.shadow.mapSize.set(2048, 2048)
    spot.shadow.bias = -0.0002
    this.scene.add(spot, spot.target)
    this.spot = spot

    // soft key from front-left
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(5, 8, 5)
    this.scene.add(key)
    this.keyLight = key

    // cool rim from behind for edge separation
    const rim = new THREE.DirectionalLight(0xaabbdd, 0.9)
    rim.position.set(-6, 4, -5)
    this.scene.add(rim)
  }

  _buildGround() {
    this.grid = new THREE.GridHelper(10, 20, 0x2a2a30, 0x1a1a1e)
    this.grid.material.transparent = true
    this.grid.material.opacity = 0.6
    this.scene.add(this.grid)

    const mat = new THREE.ShadowMaterial({ opacity: 0.35 })
    this.shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
    this.shadowCatcher.rotation.x = -Math.PI / 2
    this.shadowCatcher.receiveShadow = true
    this.scene.add(this.shadowCatcher)
  }

  // Swap in a new model object3D. Returns the bounding metrics.
  setModel(object3D) {
    if (this.modelRoot) {
      this.scene.remove(this.modelRoot)
      this._dispose(this.modelRoot)
    }
    this.modelRoot = object3D
    object3D.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true }
    })
    this.scene.add(object3D)
    const metrics = this.frameModel()
    if (this.shadingMode && this.shadingMode !== 'original') this.setShading(this.shadingMode)
    return metrics
  }

  // ---- preview shading modes: original / gray / metal / glass / wire ----
  setShading(mode) {
    this.shadingMode = mode
    if (!this.modelRoot) return
    const mat = mode === 'original' ? null : this._shadeMaterial(mode)
    this.modelRoot.traverse((o) => {
      if (!o.isMesh) return
      if (!o.userData._origMat) o.userData._origMat = o.material
      o.material = mat || o.userData._origMat
    })
  }

  _shadeMaterial(mode) {
    const r = this.lastRadius || 1
    switch (mode) {
      case 'gray':   // glossy showroom gray
        return new THREE.MeshStandardMaterial({
          color: 0xb4b4ba, metalness: 0.1, roughness: 0.18, side: THREE.DoubleSide
        })
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: 0xdcdcde, metalness: 1, roughness: 0.22, side: THREE.DoubleSide
        })
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: 0xffffff, metalness: 0, roughness: 0.04,
          transmission: 1, thickness: r * 0.4, ior: 1.5,
          transparent: true, side: THREE.DoubleSide
        })
      case 'wire':
        return new THREE.MeshBasicMaterial({
          color: 0x9a9aa2, wireframe: true
        })
    }
  }

  // Adaptive fit: recenter model on ground, rescale grid/shadow/camera/lights.
  frameModel() {
    const box = new THREE.Box3().setFromObject(this.modelRoot)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const radius = size.length() / 2 || 1

    // sit model on the grid (y=0), centered in x/z
    this.modelRoot.position.x -= center.x
    this.modelRoot.position.z -= center.z
    this.modelRoot.position.y -= box.min.y

    // rescale ground helpers to model footprint
    const span = Math.max(size.x, size.z) * 2.4 || 4
    this.scene.remove(this.grid)
    const div = 24
    this.grid = new THREE.GridHelper(span, div, 0x232328, 0x121215)
    this.grid.material.transparent = true
    this.grid.material.opacity = 0.3
    this.scene.add(this.grid)
    this.shadowCatcher.scale.set(span, span, 1)

    // adaptive lights: spot hangs above model, intensity follows falloff
    this.keyLight.position.set(radius * 2, radius * 3, radius * 2)
    this.spot.position.set(0, radius * 4, radius * 1.2)
    this.spot.target.position.set(0, size.y / 2, 0)
    this.spot.intensity = 5.5 * Math.pow(radius * 4, 1.6)
    this.spot.shadow.camera.far = radius * 12
    this.spot.shadow.camera.updateProjectionMatrix()

    // adaptive clipping + frame camera
    this.camera.near = radius / 100
    this.camera.far = radius * 100
    this.camera.updateProjectionMatrix()
    this._frameCamera(radius)
    this.lastRadius = radius

    // recompute box AFTER repositioning — annotations need live coords
    this.modelRoot.updateMatrixWorld(true)
    const liveBox = new THREE.Box3().setFromObject(this.modelRoot)
    return { size, center: liveBox.getCenter(new THREE.Vector3()), radius, box: liveBox }
  }

  _frameCamera(radius) {
    const fit = radius / Math.sin((this.camera.fov * Math.PI) / 180 / 2)
    const dir = new THREE.Vector3(0.7, 0.55, 1).normalize()
    const target = new THREE.Vector3(0, radius * 0.55, 0)
    this.camera.position.copy(target).addScaledVector(dir, fit * 1.15)
    this.controls.target.copy(target)
    this.controls.minDistance = radius * 0.2
    this.controls.maxDistance = fit * 6
    this.controls.update()
  }

  // world point → normalized canvas px (for SVG overlay)
  project(v3) {
    const p = v3.clone().project(this.camera)
    const r = this.canvas.getBoundingClientRect()
    return {
      x: (p.x * 0.5 + 0.5) * r.width,
      y: (-p.y * 0.5 + 0.5) * r.height,
      behind: p.z > 1
    }
  }

  _raf() {
    this.controls.update()
    for (const cb of this.onFrame) cb()
    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const r = this.canvas.getBoundingClientRect()
    this.camera.aspect = r.width / r.height || 1
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(r.width, r.height, false)
  }

  _dispose(root) {
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      for (const m of [o.material, o.userData?._origMat].flat()) {
        if (m && m.dispose) m.dispose()
      }
    })
  }
}
