const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// Store the current working directory
let currentWorkingDirectory = process.cwd();

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
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

  // Handle command execution
  ipcMain.handle("execute-command", (event, command) => {
    return new Promise((resolve) => {
      let shell;
      let shellArgs = [];

      // Determine the shell based on the platform
      if (process.platform === "win32") {
        shell = "cmd.exe";
        shellArgs = ["/c", command];
      } else {
        shell = "/bin/bash";
        shellArgs = ["-c", command];
      }

      const cmdProcess = spawn(shell, shellArgs, {
        cwd: currentWorkingDirectory,
        shell: true,
      });

      let output = "";
      let errorOutput = "";

      cmdProcess.stdout.on("data", (data) => {
        output += data.toString();
        event.sender.send("command-output", data.toString());
      });

      cmdProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
        event.sender.send("command-output", data.toString());
      });

      cmdProcess.on("close", (code) => {
        resolve({ output, errorOutput, code });
      });
    });
  });

  // Handle 'get-cwd' IPC call
  ipcMain.handle("get-cwd", () => {
    return currentWorkingDirectory;
  });

  // Handle 'change-directory' IPC call
  ipcMain.handle("change-directory", (event, directory) => {
    try {
      currentWorkingDirectory = path.resolve(
        currentWorkingDirectory,
        directory
      );
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
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
