import * as THREE from 'three'
import { Viewer } from './viewer/Viewer.js'
import { Dimensions } from './viewer/Dimensions.js'
import { loadModel, SUPPORTED } from './viewer/loaders.js'
import { Tree } from './ui/Tree.js'
import { InfoPanel, meshStats } from './ui/InfoPanel.js'
import { computeVolume } from './viewer/volume.js'
import { toOBJ, toFBX } from './viewer/exporters.js'

const $ = (s) => document.querySelector(s)

const canvas = $('#three')
const viewer = new Viewer(canvas)
const dims = new Dimensions(viewer, $('#overlay'))
const infoPanel = new InfoPanel($('#infoPanel'))
const tree = new Tree($('#tree'), { onSelect: highlight })

const ui = {
  modelSelect: $('#modelSelect'),
  modelName: $('#modelName'),
  loading: $('#loading'),
  loadingText: $('#loadingText'),
  dropzone: $('#dropzone'),
  units: $('#units'),
  measureInfo: $('#measureInfo'),
  hud: $('#hud')
}

let _highlighted = null
function highlight(obj) {
  if (_highlighted) _highlighted.traverse?.((o) => o.isMesh && o.material.emissive?.setHex(0x000000))
  _highlighted = obj
  obj.traverse?.((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(0x1c2a08) })
}

function setLoading(on, text = 'Loading…') {
  ui.loading.hidden = !on
  ui.loadingText.textContent = text
}

let lastFile = null      // raw bytes of loaded model, for classic Save As
let loadedObject = null  // parsed three.js object, for re-export

async function open({ name, ext, data }) {
  ext = ext.toLowerCase()
  if (!SUPPORTED.includes(ext)) {
    setLoading(false)
    alert(`Unsupported format: .${ext}\nSupported: ${SUPPORTED.join(', ')}`)
    return
  }
  setLoading(true, `PARSING ${ext.toUpperCase()}…`)
  try {
    const { object, format } = await loadModel({ name, ext, data })
    lastFile = { name, data }
    loadedObject = object
    const metrics = viewer.setModel(object)

    dims.build(metrics.box)
    dims.setVisible(measureOn)            // respect measure-mode toggle
    tree.build(object, name.replace(/\.[^.]+$/, ''))
    const volume = computeVolume(object)
    infoPanel.set({ name, format, box: metrics.box, volume, ...meshStats(object) })

    ui.modelSelect.classList.add('is-loaded')
    ui.modelName.textContent = name
    ui.measureInfo.textContent =
      `Ø ${(metrics.size.x).toFixed(1)} × ${metrics.size.y.toFixed(1)} mm`
    ui.hud.textContent = `${format}  ·  ${meshStats(object).faces.toLocaleString()} faces`
  } catch (err) {
    console.error(err)
    alert(`Failed to load ${name}:\n${err.message}`)
  } finally {
    setLoading(false)
  }
}

// ---- file intake (Electron dialog or browser File) ----
async function openViaDialog() {
  if (window.forma?.openModel) {
    const res = await window.forma.openModel()
    if (res) open({ name: res.name, ext: res.ext, data: res.buffer })
  } else {
    fileInput.click()
  }
}

const fileInput = Object.assign(document.createElement('input'), {
  type: 'file', accept: SUPPORTED.map((e) => '.' + e).join(',')
})
fileInput.addEventListener('change', async () => {
  const f = fileInput.files[0]
  if (f) open({ name: f.name, ext: f.name.split('.').pop(), data: await f.arrayBuffer() })
})

async function handleFile(file) {
  open({ name: file.name, ext: file.name.split('.').pop(), data: await file.arrayBuffer() })
}

// ---- drag & drop (whole window) ----
const dz = ui.dropzone
;['dragenter', 'dragover'].forEach((e) =>
  window.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('is-drag') }))
;['dragleave', 'drop'].forEach((e) =>
  window.addEventListener(e, (ev) => { ev.preventDefault(); if (e !== 'dragleave' || ev.target === document.body) dz.classList.remove('is-drag') }))
window.addEventListener('drop', (ev) => {
  dz.classList.remove('is-drag')
  const f = ev.dataTransfer?.files?.[0]
  if (f) handleFile(f)
})

// ---- controls ----
$('#browseBtn').addEventListener('click', openViaDialog)
ui.modelSelect.addEventListener('click', openViaDialog)
ui.units.addEventListener('change', () => {
  dims.setUnit(ui.units.value)
  infoPanel.setUnit(ui.units.value)
})

// tabs (visual mode switch)
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('is-active'))
    t.classList.add('is-active')
  }))

// measure mode: cotes appear as 3D UI, lines animate center → extremities
let measureOn = false
const measureBtn = $('#measureBtn')
measureBtn.addEventListener('click', () => {
  measureOn = !measureOn
  measureBtn.classList.toggle('is-on', measureOn)
  dims.setVisible(measureOn)
})

// material preview modes
document.querySelectorAll('[data-shade]').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-shade]').forEach((x) => x.classList.remove('is-on'))
    b.classList.add('is-on')
    viewer.setShading(b.dataset.shade)
  }))

// ---- export to OBJ / FBX ----
const exportMenu = $('#exportMenu')
$('#exportBtn').addEventListener('click', (e) => {
  e.stopPropagation()
  if (!loadedObject) return alert('Charge un modèle d\'abord.')
  exportMenu.hidden = !exportMenu.hidden
})
window.addEventListener('click', () => { exportMenu.hidden = true })

async function saveBytes(defaultName, bytes) {
  if (window.forma?.saveModel) {
    const fp = await window.forma.saveModel({ defaultName, buffer: bytes })
    if (fp) ui.hud.textContent = `Exporté → ${fp}`
  } else {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([bytes]))
    a.download = defaultName
    a.click()
    URL.revokeObjectURL(a.href)
  }
}

document.querySelectorAll('[data-export]').forEach((b) =>
  b.addEventListener('click', async (e) => {
    e.stopPropagation()
    exportMenu.hidden = true
    if (!loadedObject) return
    const base = (lastFile?.name || 'model').replace(/\.[^.]+$/, '')
    try {
      if (b.dataset.export === 'obj') await saveBytes(`${base}.obj`, toOBJ(loadedObject))
      else await saveBytes(`${base}.fbx`, toFBX(loadedObject))
    } catch (err) {
      console.error(err)
      alert(`Échec export: ${err.message}`)
    }
  }))

// classic Save As: original bytes, new name, anywhere
$('#saveAsBtn').addEventListener('click', async () => {
  if (!lastFile) return alert('Charge un modèle d\'abord.')
  if (window.forma?.saveModel) {
    const fp = await window.forma.saveModel({ defaultName: lastFile.name, buffer: lastFile.data })
    if (fp) ui.hud.textContent = `Enregistré → ${fp}`
  } else {
    // browser fallback: download
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lastFile.data]))
    a.download = lastFile.name
    a.click()
    URL.revokeObjectURL(a.href)
  }
})

tree.clear()
ui.hud.textContent = 'Drop a model to begin'
