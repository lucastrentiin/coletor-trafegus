const fs = require('fs'),
    path = require('path');
const { isEnabledSync } = require('./log-config');
const dir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(dir, {
    recursive: true
});

// `event` e a chave do catalogo (backend/log-events.js). Quando informada,
// a linha so e gravada se o gestor deixou aquele evento ligado na tela
// Logs -> Configurar. Chamadas sem `event` continuam gravando sempre,
// para nao perder mensagens de codigo antigo.
function log(msg, level = 'INFO', event = null) {
    if (event && !isEnabledSync(event)) return;
    const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
    console.log(line);
    fs.appendFileSync(path.join(dir, `coleta-${new Date().toISOString().slice(0,10)}.log`), line + '\n');
}
module.exports = {
    log
};
