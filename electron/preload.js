import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('forma', {
  openModel: () => ipcRenderer.invoke('dialog:openModel'),
  saveModel: (payload) => ipcRenderer.invoke('dialog:saveModel', payload),
  platform: process.platform
})
