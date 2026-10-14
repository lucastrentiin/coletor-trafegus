const fs = require('fs');
const path = require('path');

const file = fs.readFileSync(path.join(__dirname, '..', 'sql', 'queries.sql'), 'utf8');

function section(name) {
  const re = new RegExp('--- BEGIN ' + name + '[\\s\\S]*?--- END ' + name);
  const m = file.match(re);
  if (!m) throw new Error('Secao SQL nao encontrada: ' + name);
  return m[0].replace(/^--- BEGIN .*\n/, '').replace(/\n--- END .*$/, '').trim();
}

module.exports = { raw: file, section };
