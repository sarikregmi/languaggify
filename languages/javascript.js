const path = require('path');

module.exports = {
  filename: "main.js",
  run: file => {
    // Use local QuickJS binary to run JS files. Return a PowerShell-safe invocation.
    const exe = path.join(__dirname, '..', 'quickjs', 'qjs.exe');
    return `& "${exe}" "${file}"`;
  }
};
