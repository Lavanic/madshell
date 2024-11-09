const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // Enable context isolation
      nodeIntegration: false, // Disable node integration
    },
    backgroundColor: "#00000000",
    vibrancy: "dark",
    visualEffectState: "active",
    roundedCorners: true,
  });

  win.loadFile(path.join(__dirname, "build", "index.html"));

  // Handle window control actions
  ipcMain.on("window-control", (event, action) => {
    switch (action) {
      case "close":
        win.close();
        break;
      case "minimize":
        win.minimize();
        break;
      case "maximize":
        win.isMaximized() ? win.unmaximize() : win.maximize();
        break;
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
