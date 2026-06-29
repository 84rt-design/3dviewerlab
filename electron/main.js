import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Vite injects this in dev; undefined in production build
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 860,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0d0d0f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (DEV_URL) {
    win.loadURL(DEV_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Open-file dialog → returns { name, ext, buffer } or null
ipcMain.handle('dialog:openModel', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Open 3D model',
    properties: ['openFile'],
    filters: [
      { name: '3D Models', extensions: ['obj', 'fbx', 'step', 'stp'] },
      { name: 'OBJ', extensions: ['obj'] },
      { name: 'FBX', extensions: ['fbx'] },
      { name: 'STEP', extensions: ['step', 'stp'] }
    ]
  })
  if (canceled || !filePaths.length) return null
  const fp = filePaths[0]
  const buffer = await readFile(fp)
  return {
    name: path.basename(fp),
    ext: path.extname(fp).slice(1).toLowerCase(),
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }
})

// Classic "Save As": write the loaded file's bytes wherever the user picks.
ipcMain.handle('dialog:saveModel', async (_e, { defaultName, buffer }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Enregistrer sous',
    defaultPath: defaultName,
    buttonLabel: 'Enregistrer'
  })
  if (canceled || !filePath) return null
  await writeFile(filePath, Buffer.from(buffer))
  return filePath
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
