import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";

const TerminalComponent = () => {
  const xtermRef = useRef(null);
  const [terminal, setTerminal] = useState(null);

  const handleWindowControls = (action) => {
    window.electronAPI.windowControl(action);
  };

  useEffect(() => {
    const term = new Terminal({
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        // ... your theme settings ...
      },
      cursorBlink: true,
      cursorStyle: "block",
      allowTransparency: true,
      rendererType: "canvas",
      lineHeight: 1.0,
      letterSpacing: 0,
      scrollback: 1000,
      minimumContrastRatio: 1,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);

    // Open terminal in the container
    term.open(xtermRef.current);
    fitAddon.fit();
    setTerminal(term);

    const asciiArt = `                          .___     .__           .__  .__   \r\n   ____   ____   ____   __| _/_____|  |__   ____ |  | |  |  \r\n  / ___\\ /  _ \\ /  _ \\ / __ |/  ___/  |  \\_/ __ \\|  | |  |  \r\n / /_/  >  <_> |  <_> ) /_/ |\\___ \\|   Y  \\  ___/|  |_|  |__ \r\n \\___  / \\____/ \\____/\\____ /____  >___|  /\\___  >____/____/ \r\n/_____/                    \\/    \\/     \\/     \\/            `;
    term.writeln("\x1b[36m" + asciiArt + "\x1b[0m");
    term.writeln("\r\n Welcome to GoodShell - Your AI-Powered Terminal");
    term.writeln(' Type "help" for available commands\r\n');

    // Initial prompt
    prompt(term);

    let commandBuffer = "";

    term.onData((data) => {
      const code = data.charCodeAt(0);

      // Handle special keys
      if (code === 13) {
        // Enter key
        term.write("\r\n"); // Move to next line
        handleCommand(commandBuffer, term);
        commandBuffer = "";
      } else if (code === 127) {
        // Backspace
        if (commandBuffer.length > 0) {
          commandBuffer = commandBuffer.slice(0, -1);
          term.write("\b \b");
        }
      } else {
        commandBuffer += data;
        term.write(data);
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
      term.dispose();
    };
  }, []);

  // Custom prompt function
  const prompt = async (term) => {
    const cwd = await window.electronAPI.getCwd();
    term.write(`\x1b[32m${cwd}> \x1b[0m`);
  };

  // Handle command execution
  const handleCommand = async (command, term) => {
    if (command.trim() === "") {
      prompt(term);
      return;
    }

    // Handle 'cd' command
    if (command.startsWith("cd ")) {
      const directory = command.slice(3).trim();
      const result = await window.electronAPI.changeDirectory(directory);
      if (result.success) {
        // Directory changed successfully
      } else {
        term.writeln(`cd: ${result.message}`);
      }
      prompt(term);
    } else {
      // Execute other commands
      window.electronAPI.executeCommand(command);
      prompt(term);
    }
  };

  // Listen for command output from main process
  useEffect(() => {
    if (terminal) {
      const handleOutput = (data) => {
        terminal.write(data);
      };
      window.electronAPI.onCommandOutput(handleOutput);

      return () => {
        // Cleanup the listener when component unmounts
        window.electronAPI.removeCommandOutputListener(handleOutput);
      };
    }
  }, [terminal]);

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
      <div ref={xtermRef} className="terminal-content" />
    </div>
  );
};

export default TerminalComponent;
