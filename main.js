const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn, exec } = require("child_process");
const fs = require("fs");
const record = require("node-record-lpcm16");
const speech = require("@google-cloud/speech");

// Store the current working directory and venv path
let currentWorkingDirectory = process.cwd();
let currentVenvPath = null;

const client = new speech.SpeechClient();

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
    resizable: true,
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

  ipcMain.handle("execute-command", async (event, command) => {
    return new Promise((resolve) => {
      // Function to send output without extra spacing
      const sendOutput = (text) => {
        // Remove any existing trailing newlines and add just one
        const cleanOutput = text.replace(/\r?\n$/, "") + "\n";
        event.sender.send("command-output", cleanOutput);
      };

      // Check if command is multi-line or contains shell operators
      const isMultiCommand = command.includes("\n");
      const containsShellOperators = ["&&", "||", ";", "|", ">", "<"].some(
        (op) => command.includes(op)
      );

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

      // If it's a multi-line command or contains shell operators, execute directly
      if (isMultiCommand || containsShellOperators) {
        // Handle multi-line commands
        if (isMultiCommand) {
          const commands = command.split("\n").filter((cmd) => cmd.trim());
          command = commands.join(" && ");
        }

        // Use exec to execute the command
        exec(
          command,
          { cwd: currentWorkingDirectory },
          (error, stdout, stderr) => {
            if (stdout) {
              event.sender.send("command-output", stdout);
            }
            if (stderr) {
              event.sender.send("command-output", stderr);
            }
            if (error) {
              event.sender.send("command-complete", { code: error.code || 1 });
              resolve({ code: error.code || 1 });
            } else {
              event.sender.send("command-complete", { code: 0 });
              resolve({ code: 0 });
            }
          }
        );
        return;
      }

      // For regular commands that should use venv
      if (currentVenvPath && shouldUseVenv(command)) {
        const args = command.trim().split(/\s+/);
        const cmd = args[0];
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
      const args = command.trim().split(/\s+/);
      const cmd = args[0];

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
            resolve({ output: "", errorOutput: "", code: 0 });
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

        // ... Include other built-in commands like 'pwd', 'touch', 'rm', etc.

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
          } else {
            // For other commands, use exec
            exec(
              command,
              { cwd: currentWorkingDirectory },
              (error, stdout, stderr) => {
                if (stdout) {
                  event.sender.send("command-output", stdout);
                }
                if (stderr) {
                  event.sender.send("command-output", stderr);
                }
                if (error) {
                  event.sender.send("command-output", error.message);
                  event.sender.send("command-complete", {
                    code: error.code || 1,
                  });
                  resolve({ code: error.code || 1 });
                } else {
                  event.sender.send("command-complete", { code: 0 });
                  resolve({ code: 0 });
                }
              }
            );
          }
      }
    });
  });

  // Add the start-voice-recognition handler
  ipcMain.handle("start-voice-recognition", async () => {
    return new Promise((resolve, reject) => {
      const request = {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: "en-US",
        },
        interimResults: false,
      };

      const recognizeStream = client
        .streamingRecognize(request)
        .on("error", (error) => {
          console.error("Error during speech recognition:", error);
          reject(error);
        })
        .on("data", (data) => {
          if (data.results[0] && data.results[0].alternatives[0]) {
            const transcript = data.results[0].alternatives[0].transcript;
            resolve(transcript);
          }
        });

      const recording = record.record({
        sampleRateHertz: 16000,
        threshold: 0,
        verbose: false,
        recordProgram: "rec", // Use 'sox' or 'rec' for macOS, 'arecord' for Linux
        silence: "1.0",
      });

      const recordingStream = recording.stream();

      recordingStream
        .on("error", (error) => {
          console.error("Error during recording:", error);
          reject(error);
        })
        .pipe(recognizeStream);

      // Stop recording after silence is detected
      // The 'end' event is emitted when recording stops
      recordingStream.on("end", () => {
        console.log("Recording ended");
      });
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

app.whenReady().then(() => {
  createWindow();

  app.on("web-contents-created", (event, contents) => {
    contents.session.setPermissionRequestHandler(
      (webContents, permission, callback) => {
        if (permission === "media") {
          callback(true); // Approve microphone access
        } else {
          callback(false);
        }
      }
    );
  });
});

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
