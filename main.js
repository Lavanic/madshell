// main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

// Store the current working directory and venv path
let currentWorkingDirectory = process.cwd();
let currentVenvPath = null;

function getGitExecutable() {
  return process.platform === "win32" ? "git" : "/usr/bin/git";
}

// Helper function to check if a command should be run in venv
function shouldUseVenv(command) {
  const venvCommands = ["pip", "python", "python3", "pytest", "jupyter"];
  return venvCommands.some((cmd) => command.startsWith(cmd));
}

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

  ipcMain.handle("resolve-path", (event, ...paths) => {
    return path.resolve(...paths);
  });

  // Handle command execution
  ipcMain.handle("execute-command", async (event, command) => {
    // Split the command into individual lines/commands
    const commands = command.split(/\r?\n/).filter((cmd) => cmd.trim() !== "");

    // Iterate through each command sequentially
    for (let cmd of commands) {
      cmd = cmd.trim();
      if (cmd === "") continue; // Skip empty lines

      const args = cmd.split(/\s+/);
      const baseCmd = args[0].toLowerCase();

      // Logging for debugging
      console.log(`Executing command: ${cmd}`);

      // Handle 'cd' command separately
      if (baseCmd === "cd") {
        const directory = args.slice(1).join(" ");
        const result = await ipcMain.handle(
          "change-directory",
          event,
          directory
        );
        if (!result.success) {
          event.sender.send("command-output", `cd: ${result.message}\n`);
        } else {
          event.sender.send(
            "command-output",
            `Changed directory to ${currentWorkingDirectory}\n`
          );
        }
        continue; // Move to the next command
      }

      // Handle built-in commands
      switch (baseCmd) {
        case "mkdir":
          try {
            if (!args[1]) {
              throw new Error("mkdir: missing operand");
            }
            const dirPath = path.join(currentWorkingDirectory, args[1]);
            fs.mkdirSync(dirPath);
            event.sender.send(
              "command-output",
              `Directory created: ${args[1]}\n`
            );
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "ls":
          try {
            const files = fs.readdirSync(currentWorkingDirectory);
            const output = files
              .map((file) => {
                const stats = fs.statSync(
                  path.join(currentWorkingDirectory, file)
                );
                const isDir = stats.isDirectory();
                const colorCode = isDir ? "\x1b[36m" : "\x1b[0m";
                const suffix = isDir ? "/" : "";
                return `${colorCode}${file}${suffix}\x1b[0m`;
              })
              .join("\n");
            event.sender.send("command-output", `${output}\n`);
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "pwd":
          try {
            event.sender.send("command-output", `${currentWorkingDirectory}\n`);
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "clear":
          // Send 'clear-terminal' event to renderer to clear the terminal
          event.sender.send("clear-terminal");
          break;

        case "write":
        case "create":
          try {
            if (!args[1]) {
              throw new Error(`${baseCmd}: missing filename`);
            }
            const filename = args[1];
            let content = "";

            // Check if we have heredoc content (optional, based on AI's output)
            if (cmd.includes("<<EOL")) {
              const parts = cmd.split("<<EOL\n");
              if (parts.length >= 2) {
                content = parts[1].split("\nEOL")[0];
              }
            } else {
              content = args.slice(2).join(" ");
            }

            const filePathCreate = path.join(currentWorkingDirectory, filename);
            fs.writeFileSync(filePathCreate, content + "\n", { flag: "w" });
            event.sender.send(
              "command-output",
              `Created file: ${filename} with content\n`
            );
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "grep":
          try {
            let pattern = "";
            let targetFile = "";
            let isRecursive = false;
            let isCaseInsensitive = false;

            // Parse grep arguments
            for (let i = 1; i < args.length; i++) {
              if (args[i].startsWith("-")) {
                if (args[i].includes("r")) isRecursive = true;
                if (args[i].includes("i")) isCaseInsensitive = true;
                continue;
              }
              if (!pattern) {
                pattern = args[i];
              } else {
                targetFile = args[i];
              }
            }

            const filePathGrep = path.join(currentWorkingDirectory, targetFile);

            if (!fs.existsSync(filePathGrep)) {
              event.sender.send(
                "command-output",
                `File ${targetFile} does not exist\n`
              );
              break;
            }

            const contentGrep = fs.readFileSync(filePathGrep, "utf-8");
            const lines = contentGrep.split("\n");
            let foundMatches = false;

            lines.forEach((line, index) => {
              const testLine = isCaseInsensitive ? line.toLowerCase() : line;
              const testPattern = isCaseInsensitive
                ? pattern.toLowerCase()
                : pattern;

              if (testLine.includes(testPattern)) {
                event.sender.send("command-output", `${index + 1}: ${line}\n`);
                foundMatches = true;
              }
            });

            if (!foundMatches) {
              event.sender.send(
                "command-output",
                `No matches found in ${targetFile}\n`
              );
            }
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "touch":
          try {
            if (!args[1]) {
              throw new Error("touch: missing operand");
            }
            const filePathTouch = path.join(currentWorkingDirectory, args[1]);
            fs.writeFileSync(filePathTouch, "", { flag: "w" });
            event.sender.send("command-output", `Created file: ${args[1]}\n`);
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        case "rm":
          try {
            if (!args[1]) {
              throw new Error("rm: missing operand");
            }
            const isRecursive = args.includes("-rf") || args.includes("-r");
            const targetRm = args[args.length - 1];
            const targetPathRm = path.join(currentWorkingDirectory, targetRm);

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

              deleteRecursive(targetPathRm);
              event.sender.send("command-output", `Removed: ${targetRm}\n`);
            } else {
              if (fs.existsSync(targetPathRm)) {
                if (fs.statSync(targetPathRm).isDirectory()) {
                  fs.rmdirSync(targetPathRm);
                } else {
                  fs.unlinkSync(targetPathRm);
                }
                event.sender.send("command-output", `Removed: ${targetRm}\n`);
              } else {
                throw new Error(
                  `rm: cannot remove '${targetRm}': No such file or directory`
                );
              }
            }
          } catch (err) {
            event.sender.send("command-output", `Error: ${err.message}\n`);
          }
          break;

        default:
          // Execute via shell for non-built-in commands
          if (process.platform === "win32") {
            const shell = "cmd.exe";
            const shellArgs = ["/c", cmd];
            const shellProcess = spawn(shell, shellArgs, {
              cwd: currentWorkingDirectory,
              shell: true,
            });

            shellProcess.stdout.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });
            shellProcess.stderr.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });

            await new Promise((resolveCmd) => {
              shellProcess.on("close", (code) => {
                // Do not send 'command-complete' here to avoid multiple signals
                resolveCmd();
              });
            });
          } else {
            const shell = "/bin/bash";
            const shellArgs = ["-c", cmd];
            const shellProcess = spawn(shell, shellArgs, {
              cwd: currentWorkingDirectory,
              shell: true,
            });

            shellProcess.stdout.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });
            shellProcess.stderr.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });

            await new Promise((resolveCmd) => {
              shellProcess.on("close", (code) => {
                // Do not send 'command-complete' here to avoid multiple signals
                resolveCmd();
              });
            });
          }
          break;
      }
    }

    // After all commands are processed, send 'command-complete'
    event.sender.send("command-complete", { code: 0 });
    return { code: 0 };
  });

  // Handle 'get-cwd' IPC call
  ipcMain.handle("get-cwd", () => {
    return currentWorkingDirectory;
  });

  ipcMain.handle("get-directory-contents", (event, dirPath) => {
    try {
      const fullPath = path.resolve(currentWorkingDirectory, dirPath);
      const items = fs.readdirSync(fullPath);
      return items;
    } catch (err) {
      return [];
    }
  });

  // Handle 'change-directory' IPC call
  ipcMain.handle("change-directory", (event, directory) => {
    try {
      const newPath = path.resolve(currentWorkingDirectory, directory);
      if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
        process.chdir(newPath); // Change process working directory
        currentWorkingDirectory = newPath; // Update our stored path
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
