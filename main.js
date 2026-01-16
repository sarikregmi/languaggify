const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { exec, execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const pty = require("node-pty");

const languages = require("./languages");

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

let ptyProcess;
let terminalBuffer = "";

function createWindow() {
  const win = new BrowserWindow({
    width: 1300,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });
  win.loadFile("index.html");
}

ipcMain.handle("run-code", async (_, { lang, code, opts }) => {
  const cfg = languages[lang];
  if (!cfg) return "❌ Language not supported";

  const file = path.join(tempDir, cfg.filename);
  fs.writeFileSync(file, code);

  // If renderer requested to run inside integrated terminal, return commands instead of executing
  if (opts && opts.runInTerminal) {
    // C: provide compile/run commands
    if (lang === 'c' || lang === 'cpp') {
      const compileCmd = cfg.compile ? cfg.compile(file) : null;
      const runCmd = cfg.runCommand ? cfg.runCommand(file) : null;
      if (opts.action === 'compile') {
        // perform compile and return compiled info
        if (!compileCmd) return "Error: compile command not available";
        return new Promise(resolve => {
          exec(compileCmd, { timeout: 60_000 }, (e, out, err) => {
            if (e) return resolve(err?.message || err || "Error");
            resolve({ compiled: true, exe: runCmd, out: out || err || '✓ Compiled' });
          });
        });
      }
      if (opts.action === 'compile-run') {
        if (!compileCmd || !runCmd) return "Error: compile/run commands not available";
        return new Promise(resolve => {
          exec(compileCmd, { timeout: 60_000 }, (e, out, err) => {
            if (e) return resolve(err?.message || err || "Error");
            resolve({ compiled: true, exe: runCmd, out: out || err || '✓ Compiled' });
          });
        });
      }
      if (opts.action === 'run') {
        // just return run command; assume exe exists
        return { compiled: true, exe: runCmd, out: 'run' };
      }
    }

    // Interpreted languages: return the command to run in terminal
    const cmd = cfg.run ? cfg.run(file) : null;
    return { runCommand: cmd };
  }

  // Default behavior: execute and return output (legacy behavior)
  // For C/C++ compile-only flow
  if (lang === 'c' || lang === 'cpp') {
    const compileCmd = cfg.compile ? cfg.compile(file) : (cfg.run ? cfg.run(file) : null);
    return new Promise(resolve => {
      if (!compileCmd) return resolve('Error: no compile command');
      exec(compileCmd, { timeout: 60_000 }, (e, out, err) => {
        if (e) return resolve(err?.message || err || "Error");
        const exePath = path.join(tempDir, 'main.exe');
        resolve({ compiled: true, exe: exePath, out: out || err || '✓ Compiled' });
      });
    });
  }

  return new Promise(resolve => {
    exec(cfg.run(file), { timeout: 10000 }, (e, out, err) => {
      if (e) return resolve(err?.message || err || "Error");
      resolve(out || err || "✓ Done");
    });
  });
});

ipcMain.handle('run-exe', async (e, exePath) => {
  try {
    if (!exePath) return 'no exe';

    // If an integrated pty terminal is running, write the invocation there
    if (ptyProcess) {
      try {
        // Use PowerShell call operator to execute a quoted path safely
        ptyProcess.write(`& "${exePath}"\r`);
        return 'started';
      } catch (err) {
        // fallthrough to spawn if writing fails
      }
    }

    // No pty available: spawn the exe and forward stdout/stderr back to renderer
    const child = spawn(exePath, [], { cwd: tempDir, windowsHide: true });
    child.stdout.on('data', d => { try { e.sender.send('terminal-data', d.toString()); } catch(_){} });
    child.stderr.on('data', d => { try { e.sender.send('terminal-data', d.toString()); } catch(_){} });
    child.on('exit', code => { try { e.sender.send('terminal-data', `\n[process exited ${code}]\n`); } catch(_){} });
    return 'started';
  } catch (err) {
    return 'Error: ' + err.message;
  }
});

/* TERMINAL */
ipcMain.handle("terminal-start", (e) => {
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch (er) {}
    ptyProcess = null;
  }
  terminalBuffer = "";
  ptyProcess = pty.spawn(
    process.platform === "win32" ? "powershell.exe" : "bash",
    [],
    { cwd: tempDir }
  );

  ptyProcess.on("data", d => {
    terminalBuffer += d;
    // keep buffer bounded to avoid memory issues
    if (terminalBuffer.length > 200_000) terminalBuffer = terminalBuffer.slice(-100_000);
    e.sender.send("terminal-data", d);
  });

  ptyProcess.on("exit", () => {
    try { e.sender.send("terminal-data", "\n[process exited]\n"); } catch (er) {}
  });

  return "started";
});

ipcMain.on("terminal-write", (_, data) => {
  try { ptyProcess?.write(data); } catch (er) {}
});

ipcMain.handle("terminal-stop", () => {
  if (ptyProcess) {
    try { ptyProcess.kill(); } catch (er) {}
    ptyProcess = null;
  }
  return "stopped";
});

/* FILE SAVE / OPEN */
ipcMain.handle("save-file", async (e, { name, content }) => {
  try {
    let dest = name;
    if (!dest || !path.isAbsolute(dest)) {
        const win = BrowserWindow.fromWebContents(e.sender);
        const docs = app.getPath('documents');
        const defaultPath = dest ? path.join(docs, dest) : path.join(docs, "untitled.txt");
        const res = await dialog.showSaveDialog(win, { defaultPath });
      if (res.canceled) return "cancelled";
      dest = res.filePath;
    }
    fs.writeFileSync(dest, content);
    return dest;
  } catch (e) {
    return "Error: " + e.message;
  }
});

ipcMain.handle("open-file", async (e, file) => {
  try {
    let target = file;
    if (!target) {
      const win = BrowserWindow.fromWebContents(e.sender);
      const res = await dialog.showOpenDialog(win, { properties: ["openFile"], defaultPath: app.getPath('documents') });
      if (res.canceled || !res.filePaths.length) return "cancelled";
      target = res.filePaths[0];
    }
    return { path: target, content: fs.readFileSync(target, "utf8") };
  } catch (e) {
    return "Error: " + e.message;
  }
});

ipcMain.handle("terminal-save", async (e, { name }) => {
  try {
    let dest = name;
    if (!dest || !path.isAbsolute(dest)) {
        const win = BrowserWindow.fromWebContents(e.sender);
        const docs = app.getPath('documents');
        const defaultPath = dest ? path.join(docs, dest) : path.join(docs, "terminal.txt");
        const res = await dialog.showSaveDialog(win, { defaultPath });
      if (res.canceled) return "cancelled";
      dest = res.filePath;
    }
    fs.writeFileSync(dest, terminalBuffer);
    return dest;
  } catch (e) {
    return "Error: " + e.message;
  }
});

// Silent save: do not show dialog or return absolute path; save into app temp folder
ipcMain.handle("save-file-silent", (e, { name, content }) => {
  try {
    const safeName = path.basename(name || "untitled.txt");
    const dest = path.join(tempDir, safeName);
    fs.writeFileSync(dest, content, 'utf8');
    return dest;
  } catch (err) {
    return "Error: " + err.message;
  }
});

ipcMain.handle("terminal-save-silent", (e, { name }) => {
  try {
    const safeName = path.basename(name || "terminal.txt");
    const dest = path.join(tempDir, safeName);
    fs.writeFileSync(dest, terminalBuffer);
    return "Saved";
  } catch (err) {
    return "Error: " + err.message;
  }
});


app.whenReady().then(createWindow);
