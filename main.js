const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

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
  ipcMain.handle("execute-command", async (event, command) => {
    return new Promise((resolve) => {
      const args = command.trim().split(/\s+/);
      const cmd = args[0];

      // Function to send output without extra spacing
      const sendOutput = (text) => {
        // Remove any existing trailing newlines and add just one
        const cleanOutput = text.replace(/\r?\n$/, '') + '\n';
        event.sender.send("command-output", cleanOutput);
      };

      // Handle built-in commands
      switch (cmd) {
        case "clear":
          // Send special clear command to terminal
          event.sender.send("clear-terminal");
          resolve({ output: "", errorOutput: "", code: 0 });
          return;

        case "ls":
          try {
            const files = fs.readdirSync(currentWorkingDirectory);
            const output = files.map(file => {
              const stats = fs.statSync(path.join(currentWorkingDirectory, file));
              const isDir = stats.isDirectory();
              const colorCode = isDir ? "\x1b[36m" : "\x1b[0m";
              const suffix = isDir ? "/" : "";
              return `${colorCode}${file}${suffix}\x1b[0m`;
            }).join(" ");
            
            sendOutput(output);
            resolve({ output, errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "mkdir":
          try {
            const dirPath = path.join(currentWorkingDirectory, args[1]);
            fs.mkdirSync(dirPath);
            sendOutput(`Directory created: ${args[1]}`);
            resolve({ output: "", errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "pwd":
          try {
            sendOutput(currentWorkingDirectory);
            resolve({ output: currentWorkingDirectory, errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "rm":
          try {
            const isRecursive = args.includes("-rf") || args.includes("-r");
            const target = args[args.length - 1];
            const targetPath = path.join(currentWorkingDirectory, target);

            if (isRecursive) {
              const deleteRecursive = (itemPath) => {
                if (fs.existsSync(itemPath)) {
                  if (fs.statSync(itemPath).isDirectory()) {
                    fs.readdirSync(itemPath).forEach((file) => {
                      const curPath = path.join(itemPath, file);
                      deleteRecursive(curPath);
                    });
                    fs.rmdirSync(itemPath);
                  } else {
                    fs.unlinkSync(itemPath);
                  }
                }
              };
              
              deleteRecursive(targetPath);
              sendOutput(`Removed: ${target}`);
              resolve({ output: "", errorOutput: "", code: 0 });
              return;
            } else {
              if (fs.existsSync(targetPath)) {
                if (fs.statSync(targetPath).isDirectory()) {
                  fs.rmdirSync(targetPath);
                } else {
                  fs.unlinkSync(targetPath);
                }
                sendOutput(`Removed: ${target}`);
                resolve({ output: "", errorOutput: "", code: 0 });
                return;
              }
            }
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        default:
          // For other commands, use the shell
          let shell;
          let shellArgs;

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
            const str = data.toString();
            output += str;
            sendOutput(str);
          });

          cmdProcess.stderr.on("data", (data) => {
            const str = data.toString();
            errorOutput += str;
            sendOutput(str);
          });

          cmdProcess.on("close", (code) => {
            resolve({ output, errorOutput, code });
          });
      }
    });
  });

  // Handle 'get-cwd' IPC call
  ipcMain.handle("get-cwd", () => {
    return currentWorkingDirectory;
  });

  // Handle 'change-directory' IPC call
  ipcMain.handle("change-directory", (event, directory) => {
    try {
      const newPath = path.resolve(currentWorkingDirectory, directory);
      if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
        currentWorkingDirectory = newPath;
        return { success: true };
      } else {
        return { success: false, message: "Directory does not exist" };
      }
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