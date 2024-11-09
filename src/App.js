import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";

const TerminalComponent = () => {
  const xtermRef = useRef(null);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCommand, setCurrentCommand] = useState("");

  const handleWindowControls = (action) => {
    window.electronAPI.windowControl(action);
  };

  useEffect(() => {
    /* Update terminal configuration in App.js */
    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
      cursorStyle: "block",
      allowTransparency: true,
      rendererType: "canvas",
      fontSize: 12,
      lineHeight: 0.1,
      letterSpacing: 0,
      rows: 24,
      cols: 80,
      scrollback: 1000,
      minimumContrastRatio: 1,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);

    // Open terminal in the container
    terminal.open(xtermRef.current);
    fitAddon.fit();
    const asciiArt = `                          .___     .__           .__  .__   \r\n   ____   ____   ____   __| _/_____|  |__   ____ |  | |  |  \r\n  / ___\\ /  _ \\ /  _ \\ / __ |/  ___/  |  \\_/ __ \\|  | |  |  \r\n / /_/  >  <_> |  <_> ) /_/ |\\___ \\|   Y  \\  ___/|  |_|  |__ \r\n \\___  / \\____/ \\____/\\____ /____  >___|  /\\___  >____/____/ \r\n/_____/                    \\/    \\/     \\/     \\/            `;

    terminal.writeln("\x1b[36m" + asciiArt + "\x1b[0m");

    terminal.writeln("\r\n Welcome to GoodShell - Your AI-Powered Terminal");
    terminal.writeln(' Type "help" for available commands\r\n');

    // Custom prompt
    const writePrompt = () => {
      terminal.write("\r\n\x1b[32m❯\x1b[0m ");
    };

    writePrompt();

    let currentLine = "";
    let cursorPosition = 0;

    terminal.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle special keys
      if (code === 13) {
        // Enter
        if (currentLine.trim()) {
          setCommandHistory((prev) => [...prev, currentLine.trim()]);
          // Here you would typically process the command
          terminal.writeln(`\r\nExecuting: ${currentLine}`);
          currentLine = "";
          cursorPosition = 0;
        }
        writePrompt();
      } else if (code === 127) {
        // Backspace
        if (cursorPosition > 0) {
          currentLine = currentLine.slice(0, -1);
          cursorPosition--;
          terminal.write("\b \b");
        }
      } else if (code === 27) {
        // ESC sequence
        // Handle arrow keys, etc.
      } else {
        currentLine += data;
        cursorPosition++;
        terminal.write(data);
      }
    });

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      terminal.dispose();
    };
  }, []);

  return (
    <div className="terminal-container">
      <div className="terminal-header">
        <div className="window-controls">
          <span
            className="control close"
            onClick={() => handleWindowControls("close")}
            style={{ pointerEvents: "auto" }}
          />
          <span
            className="control minimize"
            onClick={() => handleWindowControls("minimize")}
            style={{ pointerEvents: "auto" }}
          />
          <span
            className="control maximize"
            onClick={() => handleWindowControls("maximize")}
            style={{ pointerEvents: "auto" }}
          />
        </div>
        <div className="terminal-title">goodshell</div>
      </div>
      <div ref={xtermRef} className="terminal-content" />
    </div>
  );
};

export default TerminalComponent;
