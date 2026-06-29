const EYE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`
const EYE_OFF = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" opacity=".35"/><line x1="4" y1="20" x2="20" y2="4"/></svg>`
const ICON_BOX = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>`
const ICON_MESH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 18 12 4l8 14H4z"/></svg>`

// Object tree, DA layout: parent row on top, children indented below with a
// vertical separator line. Eye toggles visibility (always visible, DA style).
// Hover + selection glow handled in CSS.
export class Tree {
  constructor(rootEl, { onSelect } = {}) {
    this.root = rootEl
    this.onSelect = onSelect || (() => {})
    this.selected = null
  }

  clear() {
    this.root.innerHTML = '<div class="tree__empty">No object</div>'
  }

  build(object3D, modelName = 'Model') {
    this.root.replaceChildren()

    const title = document.createElement('div')
    title.className = 'tree__section'
    title.textContent = 'OBJECTS'
    this.root.appendChild(title)

    // parent row
    const parentRow = this._row(object3D, modelName, ICON_BOX)
    this.root.appendChild(parentRow)

    // children container with vertical separator line
    const kids = document.createElement('div')
    kids.className = 'tree__children'
    let count = 0
    object3D.traverse((o) => {
      if (o === object3D || count >= 60) return
      if (o.isMesh || (o.isGroup && o.children.length)) {
        count++
        kids.appendChild(this._row(o, o.name || `Part ${count}`, ICON_MESH))
      }
    })
    if (count) this.root.appendChild(kids)
    parentRow.classList.add('is-active')
    this.selected = object3D
  }

  _row(obj, name, icon) {
    const row = document.createElement('div')
    row.className = 'tree__item'
    row.innerHTML = `
      <span class="ic">${icon}</span>
      <span class="nm">${name}</span>
      <button class="vis" title="Toggle visibility">${EYE}</button>`
    const vis = row.querySelector('.vis')

    vis.addEventListener('click', (e) => {
      e.stopPropagation()
      obj.visible = !obj.visible
      vis.innerHTML = obj.visible ? EYE : EYE_OFF
      vis.classList.toggle('off', !obj.visible)
    })

    row.addEventListener('click', () => {
      this.root.querySelectorAll('.tree__item').forEach((n) => n.classList.remove('is-active'))
      row.classList.add('is-active')
      this.selected = obj
      this.onSelect(obj)
    })
    return row
  }
}
