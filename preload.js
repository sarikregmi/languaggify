const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  run: (lang, code, opts) => ipcRenderer.invoke("run-code", { lang, code, opts }),
  runExe: (exe) => ipcRenderer.invoke("run-exe", exe),

  terminalStart: () => ipcRenderer.invoke("terminal-start"),
  terminalWrite: data => ipcRenderer.send("terminal-write", data),
  onTerminalData: cb => {
    const listener = (_, d) => cb(d);
    ipcRenderer.on("terminal-data", listener);
    return () => ipcRenderer.removeListener("terminal-data", listener);
  },
  terminalStop: () => ipcRenderer.invoke("terminal-stop"),
  terminalSave: name => ipcRenderer.invoke("terminal-save", { name }),
  terminalSaveSilent: name => ipcRenderer.invoke("terminal-save-silent", { name }),

  saveFile: (name, content) =>
    ipcRenderer.invoke("save-file", { name, content }),
  saveFileSilent: (name, content) =>
    ipcRenderer.invoke("save-file-silent", { name, content }),
  openFile: file => ipcRenderer.invoke("open-file", file)
});
  