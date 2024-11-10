const { contextBridge, ipcRenderer } = require("electron");

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
});

contextBridge.exposeInMainWorld("pathAPI", {
  resolve: (...args) => path.resolve(...args),
  dirname: (p) => path.dirname(p),
  basename: (p) => path.basename(p),
  sep: path.sep,
});
