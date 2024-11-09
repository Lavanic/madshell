const { app, BrowserWindow } = require("electron");
const path = require("path");
require("@electron/remote/main").initialize();

function createWindow() {
  const win = new BrowserWindow({
    width: 800, // Made it slightly smaller
    height: 600,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
    backgroundColor: "#00000000", // Transparent background
  });

  win.loadFile(path.join(__dirname, "build", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
