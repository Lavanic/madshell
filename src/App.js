import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";

const TerminalComponent = () => {
  const xtermRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const commandStartTimeRef = useRef(null);
  const [commandHistory, setCommandHistory] = useState([]);
  const [currentCwd, setCurrentCwd] = useState("");
  const [isProcessingNLQ, setIsProcessingNLQ] = useState(false);
  // Define both state and ref for command history
  const commandHistoryRef = useRef([]);
  // Updated: Command buffer and cursor position
  const commandBufferRef = useRef("");
  const cursorPositionRef = useRef(0); // Track cursor position within the command buffer
  const historyPositionRef = useRef(-1);
  const currentSuggestionRef = useRef("");
  const promptRef = useRef("");

  const handleWindowControls = (action) => {
    window.electronAPI.windowControl(action);
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    return `${seconds}s ${milliseconds}ms`;
  };

  const formatTimestamp = (date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const convertNLQToCommand = async (query) => {
    try {
      const response = await fetch(
        "https://adb-2339467812627777.17.azuredatabricks.net/serving-endpoints/databricks-meta-llama-3-1-70b-instruct/invocations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer dapi9b39fc45ec485600ccff5bb8c089c3a1-3",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: `You are a command line interface expert. Convert natural language queries into shell commands.
For file creation with content, use a series of echo commands with >>

Examples:

"create a python file with two sum solution":
echo "def twoSum(nums, target):" > twosum.py
echo "    if len(nums) <= 1:" >> twosum.py
echo "        return False" >> twosum.py
echo "    buff_dict = {}" >> twosum.py
echo "    for i, num in enumerate(nums):" >> twosum.py
echo "        if num in buff_dict:" >> twosum.py
echo "            return [buff_dict[num], i]" >> twosum.py
echo "        buff_dict[target - num] = i" >> twosum.py
echo "    return []" >> twosum.py

"create a text file with hello world":
echo "Hello, World!" > hello.txt

Current directory: ${currentCwd}

IMPORTANT:
1. Whenever you are tasked with building an application such as a React application, ALWAYS install dependencies first
1. Use echo commands with > for first line and >> for subsequent lines
2. Preserve proper indentation in the echo strings
3. Return only the commands, no explanations or formatting
4. Each echo on its own line`,
              },
              {
                role: "user",
                content: query,
              },
            ],
            max_tokens: 512,
            temperature: 0.3,
          }),
        }
      );

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Error converting NLQ:", error);
      return null;
    }
  };

  const initializeTerminal = useCallback(() => {
    const term = new Terminal({
      fontSize: 14,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "rgba(24, 24, 27, 0.95)",
        foreground: "#ffffff",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selection: "rgba(255, 255, 255, 0.3)",
        black: "#000000",
        brightBlack: "#666666",
        red: "#ff5555",
        brightRed: "#ff6e67",
        green: "#50fa7b",
        brightGreen: "#5af78e",
        yellow: "#f1fa8c",
        brightYellow: "#f4f99d",
        blue: "#6272a4",
        brightBlue: "#6272a4",
        magenta: "#ff79c6",
        brightMagenta: "#ff92d0",
        cyan: "#8be9fd",
        brightCyan: "#9aedfe",
        white: "#bfbfbf",
        brightWhite: "#ffffff",
      },
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: true,
      rendererType: "canvas",
      lineHeight: 1.2,
      letterSpacing: 0.5,
      scrollback: 10000,
      minimumContrastRatio: 1,
      padding: 12,
      convertEol: true,
    });

    return term;
  }, []);

  const prompt = async (term) => {
    const cwd = await window.electronAPI.getCwd();
    setCurrentCwd(cwd);
    const dir = cwd.split(/[\\/]/).pop();
    const promptText = `\x1b[38;2;137;180;250m${dir} ❯\x1b[0m `;
    promptRef.current = promptText;
    term.write(promptText);
  };

  const renderInputLine = (term, suggestion) => {
    // Clear the current line
    term.write("\x1b[2K\r"); // Clear line

    // Write prompt
    term.write(promptRef.current);

    // Write user input up to the cursor position
    const inputBeforeCursor = commandBufferRef.current.slice(
      0,
      cursorPositionRef.current
    );
    term.write(inputBeforeCursor);

    // Set the cursor
    term.write("\x1b[s"); // Save cursor position

    // Write the rest of the input
    const inputAfterCursor = commandBufferRef.current.slice(
      cursorPositionRef.current
    );
    term.write(inputAfterCursor);

    // Write suggestion in gray
    if (suggestion) {
      term.write("\x1b[90m" + suggestion + "\x1b[0m");
    }

    // Restore cursor position
    term.write("\x1b[u"); // Restore cursor position
  };

  const updateSuggestion = async (term) => {
    const currentInput = commandBufferRef.current;
    const tokens = currentInput.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];

    if (!lastToken) {
      currentSuggestionRef.current = "";
      renderInputLine(term, "");
      return;
    }

    let baseDir = currentCwd;
    let partial = lastToken;
    const path = window.pathAPI;

    // Determine if the last token includes a path
    const lastSeparatorIndex = Math.max(
      lastToken.lastIndexOf("/"),
      lastToken.lastIndexOf("\\")
    );

    if (lastSeparatorIndex >= 0) {
      const dirPart = lastToken.slice(0, lastSeparatorIndex + 1);
      baseDir = path.resolve(currentCwd, dirPart);
      partial = lastToken.slice(lastSeparatorIndex + 1);
    } else {
      baseDir = currentCwd;
      partial = lastToken;
    }

    try {
      const items = await window.electronAPI.getDirectoryContents(baseDir);
      const matches = items.filter((item) => item.startsWith(partial));

      let suggestion = "";

      if (matches.length === 1) {
        suggestion = matches[0].slice(partial.length);
      }

      currentSuggestionRef.current = suggestion;
      renderInputLine(term, suggestion);
    } catch (err) {
      console.error("Error during suggestion:", err);
      currentSuggestionRef.current = "";
      renderInputLine(term, "");
    }
  };

  // Update navigateHistory to use commandHistoryRef.current
  const navigateHistory = async (term, direction) => {
    const history = commandHistoryRef.current;
    if (history.length === 0) return;

    if (direction === "up") {
      historyPositionRef.current = Math.min(
        historyPositionRef.current + 1,
        history.length - 1
      );
    } else {
      historyPositionRef.current = Math.max(historyPositionRef.current - 1, -1);
    }

    if (historyPositionRef.current >= 0) {
      const historicalCommand =
        history[history.length - 1 - historyPositionRef.current].command;
      commandBufferRef.current = historicalCommand;
    } else {
      commandBufferRef.current = "";
    }

    // Update the cursor position to the end of the new command
    cursorPositionRef.current = commandBufferRef.current.length;

    // Render the input line with the updated command and cursor position
    renderInputLine(term, currentSuggestionRef.current);
  };

  useEffect(() => {
    const term = initializeTerminal();
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    term.open(xtermRef.current);
    fitAddon.fit();
    setTerminal(term);

    const asciiArt = `                          .___     .__           .__  .__   \r\n   ____   ____   ____   __| _/_____|  |__   ____ |  | |  |  \r\n  / ___\\ /  _ \\ /  _ \\ / __ |/  ___/  |  \\_/ __ \\|  | |  |  \r\n / /_/  >  <_> |  <_> ) /_/ |\\___ \\|   Y  \\  ___/|  |_|  |__ \r\n \\___  / \\____/ \\____/\\____ /____  >___|  /\\___  >____/____/ \r\n/_____/                    \\/    \\/     \\/     \\/            `;
    term.writeln("\x1b[36m" + asciiArt + "\x1b[0m");

    // Initialize CWD
    window.electronAPI.getCwd().then((cwd) => {
      setCurrentCwd(cwd);
    });

    term.write("\r\nWelcome to GoodShell\r\n");
    term.write(
      "Type ! followed by a natural language command to use AI assistance\r\n"
    );
    term.write("Use Tab for auto-completion and ↑↓ for command history\r\n");
    prompt(term);

    term.onKey(async (e) => {
      const { key, domEvent } = e;
      console.log("Key pressed:", domEvent.key);
      const keyName = domEvent.key;
      const printable =
        !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;

      if (keyName === "Enter") {
        // Enter
        term.write("\r\n");
        const command = commandBufferRef.current.trim();
        handleCommand(command, term);
        commandBufferRef.current = "";
        cursorPositionRef.current = 0;
        historyPositionRef.current = -1;
        currentSuggestionRef.current = "";
      } else if (keyName === "Tab") {
        // Tab
        if (currentSuggestionRef.current) {
          commandBufferRef.current += currentSuggestionRef.current;
          cursorPositionRef.current = commandBufferRef.current.length;
          await updateSuggestion(term);
        }
      } else if (keyName === "Backspace") {
        // Backspace
        if (cursorPositionRef.current > 0) {
          commandBufferRef.current =
            commandBufferRef.current.slice(0, cursorPositionRef.current - 1) +
            commandBufferRef.current.slice(cursorPositionRef.current);
          cursorPositionRef.current--;
          await updateSuggestion(term);
        }
      } else if (keyName === "Delete") {
        // Delete
        if (cursorPositionRef.current < commandBufferRef.current.length) {
          commandBufferRef.current =
            commandBufferRef.current.slice(0, cursorPositionRef.current) +
            commandBufferRef.current.slice(cursorPositionRef.current + 1);
          await updateSuggestion(term);
        }
      } else if (keyName === "ArrowLeft") {
        // Left arrow
        if (cursorPositionRef.current > 0) {
          cursorPositionRef.current--;
          renderInputLine(term, currentSuggestionRef.current);
        }
      } else if (keyName === "ArrowRight") {
        // Right arrow
        if (cursorPositionRef.current < commandBufferRef.current.length) {
          cursorPositionRef.current++;
          renderInputLine(term, currentSuggestionRef.current);
        }
      } else if (keyName === "ArrowUp") {
        // Up arrow
        await navigateHistory(term, "up");
      } else if (keyName === "ArrowDown") {
        // Down arrow
        await navigateHistory(term, "down");
      } else if (printable && key.length === 1) {
        // Regular character input
        commandBufferRef.current =
          commandBufferRef.current.slice(0, cursorPositionRef.current) +
          key +
          commandBufferRef.current.slice(cursorPositionRef.current);
        cursorPositionRef.current++;
        await updateSuggestion(term);
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      term.dispose();
    };
  }, []);

  const handleOutput = useCallback(
    (data) => {
      if (typeof data === "string" && terminal) {
        terminal.write(data);
      }
    },
    [terminal]
  );

  const handleCommandComplete = useCallback(() => {
    const duration = Date.now() - commandStartTimeRef.current;
    writeCommandResult(terminal, duration);
    prompt(terminal);
  }, [terminal]);

  useEffect(() => {
    if (terminal) {
      window.electronAPI.onCommandOutput(handleOutput);
      window.electronAPI.onCommandComplete(handleCommandComplete);

      return () => {
        window.electronAPI.removeCommandOutputListener(handleOutput);
        window.electronAPI.removeCommandCompleteListener(handleCommandComplete);
      };
    }
  }, [terminal, handleOutput, handleCommandComplete]);

  const writeCommandHeader = async (term) => {
    const cwd = await window.electronAPI.getCwd();
    const timestamp = formatTimestamp(new Date());
    const header = `\x1b[90m${timestamp} in ${cwd}\x1b[0m\r\n`;
    term.write(header);
  };

  const writeCommandResult = (term, duration) => {
    if (duration) {
      term.write(`\x1b[90mCompleted in ${formatDuration(duration)}\x1b[0m\r\n`);
    }
  };

  const handleCommand = async (command, term) => {
    if (command === "") {
      prompt(term);
      return;
    }

    const newEntry = {
      command,
      timestamp: new Date(),
      cwd: currentCwd,
    };

    setCommandHistory((prev) => {
      const newHistory = [...prev, newEntry];
      commandHistoryRef.current = newHistory;
      return newHistory;
    });

    if (command.startsWith("!")) {
      const query = command.slice(1).trim();

      const newEntry = {
        command: `!${query}`,
        convertedCommand: shellCommand,
        timestamp: new Date(),
        cwd: currentCwd,
      };

      setCommandHistory((prev) => {
        const newHistory = [...prev, newEntry];
        commandHistoryRef.current = newHistory;
        return newHistory;
      });

      setIsProcessingNLQ(true);
      term.write("\r\n\x1b[36mConverting natural language query...\x1b[0m");

      const shellCommand = await convertNLQToCommand(query);
      setIsProcessingNLQ(false);

      if (!shellCommand) {
        term.write("\r\n\x1b[31mFailed to convert query to command\x1b[0m\r\n");
        prompt(term);
        return;
      }

      term.write(`\r\n\x1b[32mExecuting: ${shellCommand}\x1b[0m\r\n`);

      setCommandHistory((prev) => [
        ...prev,
        {
          command: `!${query}`,
          convertedCommand: shellCommand,
          timestamp: new Date(),
          cwd: currentCwd,
        },
      ]);

      await writeCommandHeader(term);
      commandStartTimeRef.current = Date.now();
      window.electronAPI.executeCommand(shellCommand);
      return;
    }

    setCommandHistory((prev) => [
      ...prev,
      {
        command,
        timestamp: new Date(),
        cwd: currentCwd,
      },
    ]);

    if (command === "clear") {
      term.clear();
      prompt(term);
      return;
    }

    if (command === "history") {
      commandHistory.forEach((entry, index) => {
        const timestamp = formatTimestamp(entry.timestamp);
        if (entry.convertedCommand) {
          term.write(
            `${index + 1}  ${timestamp}  \x1b[36m${entry.command}\x1b[0m\r\n`
          );
          term.write(`   └─ \x1b[32m${entry.convertedCommand}\x1b[0m\r\n`);
        } else {
          term.write(`${index + 1}  ${timestamp}  ${entry.command}\r\n`);
        }
      });
      prompt(term);
      return;
    }

    await writeCommandHeader(term);

    if (command.startsWith("cd ")) {
      const directory = command.slice(3).trim();
      const result = await window.electronAPI.changeDirectory(directory);
      if (!result.success) {
        term.writeln(`cd: ${result.message}`);
      }
      const duration = Date.now() - commandStartTimeRef.current;
      writeCommandResult(term, duration);
      prompt(term);
    } else {
      commandStartTimeRef.current = Date.now();
      window.electronAPI.executeCommand(command);
    }
  };

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="window-controls">
          <span
            className="control close"
            onClick={() => handleWindowControls("close")}
          />
          <span
            className="control minimize"
            onClick={() => handleWindowControls("minimize")}
          />
          <span
            className="control maximize"
            onClick={() => handleWindowControls("maximize")}
          />
        </div>
        <div className="terminal-title">
          {isProcessingNLQ ? "Converting query..." : "goodshell"}
        </div>
      </div>
      <div className="terminal-content">
        <div ref={xtermRef} className="terminal-wrapper" />
      </div>
    </div>
  );
};

export default TerminalComponent;
