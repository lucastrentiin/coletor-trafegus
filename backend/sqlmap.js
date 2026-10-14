const fs = require('fs'),
    path = require('path');
const text = fs.readFileSync(path.join(__dirname, '..', 'sql', 'queries.sql'), 'utf8');
const blocks = {};
for (const line of text.split('\n')) {
    if (line.startsWith('-- QUERY: ')) {
        const name = line.slice(10).trim();
        blocks[name] = [];
        continue
    }
    if (Object.keys(blocks).length) {
        const last = Object.keys(blocks).at(-1);
        if (line.startsWith('-- ENDQUERY')) continue;
        blocks[last].push(line)
    }
}

function q(name) {
    const s = (blocks[name] || []).join('\n').trim();
    if (!s) throw new Error('QUERY ausente: ' + name);
    return s;
}
module.exports = {
    q,
    blocks
};