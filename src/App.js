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
  const [dirStructure, setDirStructure] = useState(null);
  const commandBufferRef = useRef("");
  const historyPositionRef = useRef(-1);

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

  const updateDirectoryStructure = useCallback(async () => {
    try {
      const structure = await window.electronAPI.getDirectoryStructure();
      setDirStructure(structure);
    } catch (error) {
      console.error('Error updating directory structure:', error);
    }
  }, []);

  const convertNLQToCommand = async (query) => {
    try {
      const response = await fetch('https://adb-2339467812627777.17.azuredatabricks.net/serving-endpoints/databricks-meta-llama-3-1-70b-instruct/invocations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dapi9b39fc45ec485600ccff5bb8c089c3a1-3'
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
  1. Use echo commands with > for first line and >> for subsequent lines
  2. Preserve proper indentation in the echo strings
  3. Return only the commands, no explanations or formatting
  4. Each echo on its own line`
            },
            {
              role: "user",
              content: query
            }
          ],
          max_tokens: 512,
          temperature: 0.3
        })
      });
  
      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error converting NLQ:', error);
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

    // Initialize directory structure and CWD
    updateDirectoryStructure();
    window.electronAPI.getCwd().then((cwd) => {
      setCurrentCwd(cwd);
    });

    term.write("\r\nWelcome to GoodShell\r\n");
    term.write("Type ! followed by a natural language command to use AI assistance\r\n");
    term.write("Use Tab for auto-completion and ↑↓ for command history\r\n");
    prompt(term);

    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) { // Enter
        term.write("\r\n");
        const command = commandBufferRef.current.trim();
        handleCommand(command, term);
        commandBufferRef.current = "";
        historyPositionRef.current = -1;
      } else if (code === 127) { // Backspace
        if (commandBufferRef.current.length > 0) {
          commandBufferRef.current = commandBufferRef.current.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code === 9) { // Tab
        handleTabCompletion(term);
      } else if (code === 27) { // ESC sequence
        // Handle arrow keys
        if (data === '\x1b[A') { // Up arrow
          navigateHistory(term, 'up');
        } else if (data === '\x1b[B') { // Down arrow
          navigateHistory(term, 'down');
        }
      } else if (code >= 32) {
        commandBufferRef.current += data;
        term.write(data);
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

  const handleTabCompletion = async (term) => {
    const currentInput = commandBufferRef.current;
    const lastWord = currentInput.split(/\s+/).pop();
    
    if (lastWord && dirStructure) {
      const matches = Object.keys(dirStructure).filter(item => 
        item.startsWith(lastWord)
      );

      if (matches.length === 1) {
        // Complete the word
        const completion = matches[0].slice(lastWord.length);
        term.write(completion);
        commandBufferRef.current += completion;
      } else if (matches.length > 1) {
        // Show possibilities
        term.write('\r\n');
        matches.forEach(match => {
          term.write(`${match}  `);
        });
        term.write('\r\n');
        prompt(term);
        term.write(commandBufferRef.current);
      }
    }
  };

  const navigateHistory = (term, direction) => {
    if (commandHistory.length === 0) return;

    if (direction === 'up') {
      historyPositionRef.current = Math.min(
        historyPositionRef.current + 1,
        commandHistory.length - 1
      );
    } else {
      historyPositionRef.current = Math.max(historyPositionRef.current - 1, -1);
    }

    // Clear current line
    term.write('\r' + ' '.repeat(commandBufferRef.current.length + 3));
    prompt(term);

    if (historyPositionRef.current >= 0) {
      const historicalCommand = commandHistory[commandHistory.length - 1 - historyPositionRef.current].command;
      commandBufferRef.current = historicalCommand;
      term.write(historicalCommand);
    } else {
      commandBufferRef.current = '';
    }
  };

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

  const prompt = async (term) => {
    const cwd = await window.electronAPI.getCwd();
    setCurrentCwd(cwd);
    const dir = cwd.split(/[\\/]/).pop();
    term.write(`\x1b[38;2;137;180;250m${dir} ❯\x1b[0m `);
  };

  const handleOutput = useCallback((data) => {
    if (typeof data === "string" && terminal) {
      terminal.write(data);
    }
  }, [terminal]);

  const handleCommandComplete = useCallback(() => {
    const duration = Date.now() - commandStartTimeRef.current;
    writeCommandResult(terminal, duration);
    updateDirectoryStructure(); // Update directory structure after command completion
    prompt(terminal);
  }, [terminal, updateDirectoryStructure]);

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

  const handleCommand = async (command, term) => {
    if (command === "") {
      prompt(term);
      return;
    }

    if (command.startsWith('!')) {
      const query = command.slice(1).trim();
      setIsProcessingNLQ(true);
      term.write('\r\n\x1b[36mConverting natural language query...\x1b[0m');
      
      const shellCommand = await convertNLQToCommand(query);
      setIsProcessingNLQ(false);
      
      if (!shellCommand) {
        term.write('\r\n\x1b[31mFailed to convert query to command\x1b[0m\r\n');
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
          term.write(`${index + 1}  ${timestamp}  \x1b[36m${entry.command}\x1b[0m\r\n`);
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
      updateDirectoryStructure();
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
        {isProcessingNLQ ? 'Converting query...' : 'goodshell'}
        </div>
      </div>
      <div className="terminal-content">
        <div ref={xtermRef} className="terminal-wrapper" />
      </div>
    </div>
  );
};

export default TerminalComponent;