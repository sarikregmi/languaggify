const path = require('path');

module.exports = {
  filename: "main.py",
  run: file => {
    // Use local Python launcher (py.exe) from the bundled `py` folder.
    const exe = path.join(__dirname, '..', 'py', 'py.exe');
    return `& "${exe}" "${file}"`;
  }
};
