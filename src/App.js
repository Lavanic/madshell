import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import { SearchAddon } from "xterm-addon-search";
import "xterm/css/xterm.css";

const TerminalComponent = () => {
  const xtermRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const headerContentRef = useRef("");
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
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  useEffect(() => {
    const term = new Terminal({
      fontSize: 14,
      fontFamily: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1E1E2E',
        foreground: '#CDD6F4',
        cursor: '#F5E0DC',
        cursorAccent: '#1E1E2E',
        selection: 'rgba(245, 224, 220, 0.3)',
        black: '#45475A',
        brightBlack: '#585B70',
        red: '#F38BA8',
        brightRed: '#F38BA8',
        green: '#A6E3A1',
        brightGreen: '#A6E3A1',
        yellow: '#F9E2AF',
        brightYellow: '#F9E2AF',
        blue: '#89B4FA',
        brightBlue: '#89B4FA',
        magenta: '#F5C2E7',
        brightMagenta: '#F5C2E7',
        cyan: '#94E2D5',
        brightCyan: '#94E2D5',
        white: '#BAC2DE',
        brightWhite: '#A6ADC8'
      },
      cursorBlink: true,
      cursorStyle: "bar",
      allowTransparency: false,
      rendererType: "canvas",
      lineHeight: 1.2,
      letterSpacing: 0.5,
      scrollback: 10000,
      minimumContrastRatio: 1,
      padding: 12,
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

    // Initial CWD fetch
    window.electronAPI.getCwd().then(cwd => {
      setCurrentCwd(cwd);
    });

    term.write("\r\n Welcome to GoodShell\r\n");
    prompt(term);

    let commandBuffer = "";

    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) {
        term.write("\r\n");
        const command = commandBuffer.trim();
        if (command) {
          commandStartTimeRef.current = Date.now();
        }
        handleCommand(command, term);
        commandBuffer = "";
      } else if (code === 127) {
        if (commandBuffer.length > 0) {
          commandBuffer = commandBuffer.slice(0, -1);
          term.write("\b \b");
        }
      } else if (code === 9) {
        // Future tab completion
      } else if (code >= 32) {
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

  const writeCommandHeader = (term, command) => {
    const timestamp = formatTimestamp(new Date());
    const header = `\x1b[90m${timestamp} in ${currentCwd}\x1b[0m\r\n`;
    term.write(header);
    term.write(`\x1b[94m❯\x1b[0m ${command}\r\n`);
  };

  const writeCommandResult = (term, output, duration) => {
    if (output && output.length > 0) {
      term.write(`${output}\r\n`);
    }
    if (duration) {
      term.write(`\x1b[90mCompleted in ${formatDuration(duration)}\x1b[0m\r\n`);
    }
  };

  const prompt = async (term) => {
    const cwd = await window.electronAPI.getCwd();
    setCurrentCwd(cwd);
    const dir = cwd.split('/').pop();
    term.write(`\x1b[38;2;137;180;250m${dir} ❯\x1b[0m `);
  };

  const handleCommand = async (command, term) => {
    if (command === "") {
      prompt(term);
      return;
    }

    // Update command history
    setCommandHistory(prev => [...prev, {
      command,
      timestamp: new Date(),
      cwd: currentCwd
    }]);

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

    if (command.startsWith("cd ")) {
      writeCommandHeader(term, command);
      const directory = command.slice(3).trim();
      const result = await window.electronAPI.changeDirectory(directory);
      if (!result.success) {
        term.writeln(`cd: ${result.message}`);
      }
      const duration = Date.now() - commandStartTimeRef.current;
      writeCommandResult(term, null, duration);
      prompt(term);
    } else {
      writeCommandHeader(term, command);
      window.electronAPI.executeCommand(command);
    }
  };

  useEffect(() => {
    if (terminal) {
      const handleOutput = async (data) => {
        if (typeof data === 'string') {
          const duration = Date.now() - commandStartTimeRef.current;
          const cleanOutput = data.replace(/\r\n/g, '\n').replace(/\n+$/, '');
          if (cleanOutput.length > 0) {
            writeCommandResult(terminal, cleanOutput, duration);
          }
          prompt(terminal);
        }
      };

      window.electronAPI.onCommandOutput(handleOutput);

      return () => {
        window.electronAPI.removeCommandOutputListener(handleOutput);
      };
    }
  }, [terminal]);

  return (
    <div className="h-screen bg-[#1E1E2E] flex flex-col overflow-hidden">
      <div className="terminal-header bg-[#181825] px-4 py-2 flex items-center justify-between border-b border-[#313244]">
        <div className="flex items-center space-x-4">
          <div className="window-controls flex space-x-2">
            <span
              className="control close h-3 w-3 rounded-full bg-[#F38BA8] hover:opacity-80"
              onClick={() => handleWindowControls("close")}
            />
            <span
              className="control minimize h-3 w-3 rounded-full bg-[#F9E2AF] hover:opacity-80"
              onClick={() => handleWindowControls("minimize")}
            />
            <span
              className="control maximize h-3 w-3 rounded-full bg-[#A6E3A1] hover:opacity-80"
              onClick={() => handleWindowControls("maximize")}
            />
          </div>
          <div className="text-[#CDD6F4] text-sm font-medium">goodshell</div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative bg-[#1E1E2E]">
        <div ref={xtermRef} className="h-full" />
      </div>

      <style jsx global>{`
        .xterm {
          padding: 1rem;
        }
        .xterm-viewport {
          overflow-y: auto !important;
        }
        .xterm-viewport::-webkit-scrollbar {
          width: 8px;
        }
        .xterm-viewport::-webkit-scrollbar-track {
          background: #181825;
        }
        .xterm-viewport::-webkit-scrollbar-thumb {
          background: #45475A;
          border-radius: 4px;
        }
        .xterm-viewport::-webkit-scrollbar-thumb:hover {
          background: #585B70;
        }
      `}</style>
    </div>
  );
};

export default TerminalComponent;