import React, { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
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

    // Initial CWD fetch
    window.electronAPI.getCwd().then((cwd) => {
      setCurrentCwd(cwd);
    });

    term.write("\r\nWelcome to GoodShell\r\n");
    prompt(term);

    let commandBuffer = "";

    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) {
        // Enter key
        term.write("\r\n");
        const command = commandBuffer.trim();
        handleCommand(command, term);
        commandBuffer = "";
      } else if (code === 127) {
        // Backspace
        if (commandBuffer.length > 0) {
          commandBuffer = commandBuffer.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code === 9) {
        // Tab key (future tab completion)
      } else if (code >= 32) {
        // Printable characters
        commandBuffer += data;
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

  const handleOutput = (data) => {
    if (typeof data === "string") {
      terminal.write(data);
    }
  };

  const handleCommandComplete = () => {
    const duration = Date.now() - commandStartTimeRef.current;
    writeCommandResult(terminal, duration);
    prompt(terminal);
  };

  useEffect(() => {
    if (terminal) {
      window.electronAPI.onCommandOutput(handleOutput);
      window.electronAPI.onCommandComplete(handleCommandComplete);

      return () => {
        window.electronAPI.removeCommandOutputListener(handleOutput);
        window.electronAPI.removeCommandCompleteListener(handleCommandComplete);
      };
    }
  }, [terminal]);

  const handleCommand = async (command, term) => {
    if (command === "") {
      prompt(term);
      return;
    }

    // Update command history
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
        term.write(`${index + 1}  ${timestamp}  ${entry.command}\r\n`);
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
        <div className="terminal-title">goodshell</div>
      </div>
      <div className="terminal-content">
        <div ref={xtermRef} className="terminal-wrapper" />
      </div>
    </div>
  );
};

export default TerminalComponent;
