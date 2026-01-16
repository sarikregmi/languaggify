const path = require('path');

module.exports = {
  filename: "main.c",
  compile: file => {
    const binDir = path.dirname(file);
    const compiler = path.join(__dirname, '..', 'c c++', 'bin', 'gcc.exe');
    const out = path.join(binDir, 'main.exe');
    // compile only
    return `"${compiler}" -std=c11 -O2 -o "${out}" "${file}"`;
  },
  runCommand: file => {
    const binDir = path.dirname(file);
    const out = path.join(binDir, 'main.exe');
    // command to run inside terminal (no cmd wrappers)
    return `& "${out}"`;
  }
};
