const path = require('path');

module.exports = {
  filename: "main.cpp",

  compile: file => {
    const binDir = path.dirname(file);

   const compiler = path.join(__dirname, '..', 'c c++', 'bin', 'g++.exe');

    const out = path.join(binDir, 'main++.exe');

    return `"${compiler}" -std=c++17 -O2 "${file}" -o "${out}"`;
  },

  runCommand: file => {
      const binDir = path.dirname(file);
      const out = path.join(binDir, 'main.exe');
      // command to run inside terminal (no cmd wrappers)
      return `powershell -NoProfile -NoExit -Command "& '${out}'; Read-Host 'Press Enter to exit'"`;
    }
    
};
