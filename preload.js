// preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Expose APIs to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  windowControl: (action) => ipcRenderer.send("window-control", action),
  executeCommand: (command) => ipcRenderer.invoke("execute-command", command),
  onCommandOutput: (callback) => {
    ipcRenderer.on("command-output", (event, data) => callback(data));
  },
  removeCommandOutputListener: (callback) => {
    ipcRenderer.removeListener("command-output", callback);
  },
  onCommandComplete: (callback) => {
    ipcRenderer.on("command-complete", (event, data) => callback(data));
  },
  removeCommandCompleteListener: (callback) => {
    ipcRenderer.removeListener("command-complete", callback);
  },
  getCwd: () => ipcRenderer.invoke("get-cwd"),
  changeDirectory: (directory) =>
    ipcRenderer.invoke("change-directory", directory),
  getDirectoryContents: (dirPath) =>
    ipcRenderer.invoke("get-directory-contents", dirPath),
  resolvePath: (...paths) => ipcRenderer.invoke("resolve-path", ...paths),
});

contextBridge.exposeInMainWorld("platformAPI", {
  platform: process.platform,
});
