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

  // Handle command execution
  ipcMain.handle("execute-command", async (event, command) => {
    return new Promise((resolve) => {
      const args = command.trim().split(/\s+/);
      const cmd = args[0];

      // Function to send output without extra spacing
      const sendOutput = (text) => {
        // Remove any existing trailing newlines and add just one
        const cleanOutput = text.replace(/\r?\n$/, "") + "\n";
        event.sender.send("command-output", cleanOutput);
      };

      // Special handling for Python venv creation and activation
      if (command.includes("python") && command.includes("venv")) {
        const commands = command.split("\n");
        let venvName = "myenv";

        // Extract venv name if specified
        const venvCommand = commands.find((cmd) => cmd.includes("-m venv"));
        if (venvCommand) {
          const parts = venvCommand.split(" ");
          venvName = parts[parts.length - 1];
        }

        // Create venv
        const createVenvProcess = spawn("python3", ["-m", "venv", venvName], {
          cwd: currentWorkingDirectory,
        });

        createVenvProcess.on("close", (code) => {
          if (code === 0) {
            // Store the venv path for future use
            currentVenvPath = path.join(currentWorkingDirectory, venvName);
            sendOutput(`Created virtual environment: ${venvName}\n`);
            sendOutput(`Virtual environment activated: ${venvName}\n`);

            // Execute any additional commands in the venv context
            const remainingCommands = commands.slice(2); // Skip venv creation and activation
            if (remainingCommands.length > 0) {
              const binPath = process.platform === "win32" ? "Scripts" : "bin";
              const pipPath = path.join(currentVenvPath, binPath, "pip");

              remainingCommands.forEach((cmd) => {
                if (cmd.startsWith("pip")) {
                  const pipProcess = spawn(pipPath, cmd.split(" ").slice(1), {
                    cwd: currentWorkingDirectory,
                  });

                  pipProcess.stdout.on("data", (data) =>
                    sendOutput(data.toString())
                  );
                  pipProcess.stderr.on("data", (data) =>
                    sendOutput(data.toString())
                  );

                  pipProcess.on("close", (code) => {
                    event.sender.send("command-complete", { code });
                    resolve({ code });
                  });
                }
              });
            } else {
              event.sender.send("command-complete", { code: 0 });
              resolve({ code: 0 });
            }
          } else {
            sendOutput("Failed to create virtual environment\n");
            event.sender.send("command-complete", { code: 1 });
            resolve({ code: 1 });
          }
        });

        return;
      }

      // For regular commands that should use venv
      if (currentVenvPath && shouldUseVenv(command)) {
        const binPath = process.platform === "win32" ? "Scripts" : "bin";
        const commandPath = path.join(currentVenvPath, binPath, cmd);

        if (fs.existsSync(commandPath)) {
          const venvProcess = spawn(commandPath, args.slice(1), {
            cwd: currentWorkingDirectory,
          });

          venvProcess.stdout.on("data", (data) => sendOutput(data.toString()));
          venvProcess.stderr.on("data", (data) => sendOutput(data.toString()));

          venvProcess.on("close", (code) => {
            event.sender.send("command-complete", { code });
            resolve({ code });
          });

          return;
        }
      }

      // Handle built-in commands
      switch (cmd) {
        case "clear":
          // Send special clear command to terminal
          event.sender.send("clear-terminal");
          event.sender.send("command-complete", { code: 0 });
          resolve({ output: "", errorOutput: "", code: 0 });
          return;

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

            sendOutput(output);
            event.sender.send("command-complete", { code: 0 });
            resolve({ output, errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "mkdir":
          try {
            if (!args[1]) {
              throw new Error("mkdir: missing operand");
            }
            const dirPath = path.join(currentWorkingDirectory, args[1]);
            fs.mkdirSync(dirPath);
            sendOutput(`Directory created: ${args[1]}`);
            event.sender.send("command-complete", { code: 0 });
            resolve({ output: "", errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "pwd":
          try {
            sendOutput(currentWorkingDirectory);
            event.sender.send("command-complete", { code: 0 });
            resolve({
              output: currentWorkingDirectory,
              errorOutput: "",
              code: 0,
            });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "write":
        case "create":
          try {
            if (!args[1]) {
              throw new Error("write: missing filename");
            }

            const filename = args[1];
            let content = "";

            // Check if we have heredoc content
            if (command.includes("<<EOL")) {
              const parts = command.split("<<EOL\n");
              if (parts.length >= 2) {
                content = parts[1].split("\nEOL")[0];
              }
            } else {
              content = args.slice(2).join(" ");
            }

            const filePath = path.join(currentWorkingDirectory, filename);
            fs.writeFileSync(filePath, content + "\n", { flag: "w" });
            sendOutput(`Created file: ${filename} with content`);
            event.sender.send("command-complete", { code: 0 });
            resolve({ output: "", errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

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

            const filePath = path.join(currentWorkingDirectory, targetFile);

            if (!fs.existsSync(filePath)) {
              sendOutput(`File ${targetFile} does not exist`);
              event.sender.send("command-complete", { code: 1 });
              resolve({
                output: "",
                errorOutput: "File does not exist",
                code: 1,
              });
              return;
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n");
            let foundMatches = false;

            lines.forEach((line, index) => {
              const testLine = isCaseInsensitive ? line.toLowerCase() : line;
              const testPattern = isCaseInsensitive
                ? pattern.toLowerCase()
                : pattern;

              if (testLine.includes(testPattern)) {
                sendOutput(`${index + 1}: ${line}`);
                foundMatches = true;
              }
            });

            if (!foundMatches) {
              sendOutput(`No matches found in ${targetFile}`);
            }

            event.sender.send("command-complete", { code: 0 });
            resolve({ output: "", errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "touch":
          try {
            if (!args[1]) {
              throw new Error("touch: missing operand");
            }
            const filePath = path.join(currentWorkingDirectory, args[1]);
            fs.writeFileSync(filePath, "", { flag: "w" });
            sendOutput(`Created file: ${args[1]}`);
            event.sender.send("command-complete", { code: 0 });
            resolve({ output: "", errorOutput: "", code: 0 });
            return;
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        case "rm":
          try {
            if (!args[1]) {
              throw new Error("rm: missing operand");
            }
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
              event.sender.send("command-complete", { code: 0 });
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
                event.sender.send("command-complete", { code: 0 });
                resolve({ output: "", errorOutput: "", code: 0 });
                return;
              } else {
                throw new Error(
                  `rm: cannot remove '${target}': No such file or directory`
                );
              }
            }
          } catch (err) {
            sendOutput(`Error: ${err.message}`);
            event.sender.send("command-complete", { code: 1 });
            resolve({ output: "", errorOutput: err.message, code: 1 });
            return;
          }

        default:
          // Special handling for git commands
          if (command.startsWith("git ")) {
            const gitPath = getGitExecutable();
            const gitArgs = args.slice(1); // Remove 'git' from args

            const cmdProcess = spawn(gitPath, gitArgs, {
              cwd: currentWorkingDirectory,
              env: { ...process.env, PATH: process.env.PATH },
              shell: false,
            });

            cmdProcess.stdout.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });

            cmdProcess.stderr.on("data", (data) => {
              event.sender.send("command-output", data.toString());
            });

            cmdProcess.on("close", (code) => {
              event.sender.send("command-complete", { code });
              resolve({ code });
            });

            return;
          }

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

          cmdProcess.stdout.on("data", (data) => {
            event.sender.send("command-output", data.toString());
          });

          cmdProcess.stderr.on("data", (data) => {
            event.sender.send("command-output", data.toString());
          });

          cmdProcess.on("close", (code) => {
            event.sender.send("command-complete", { code });
            resolve({ code });
          });
          break;
      }
    });
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
