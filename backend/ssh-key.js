// Aceita o conteudo de um arquivo de chave privada SSH em qualquer
// formato comum (PuTTY .ppk ou OpenSSH/PEM ja pronto) e devolve sempre
// no formato OpenSSH, que e o que o ssh2 (biblioteca usada pelo
// tunel) entende. Assim a tela pode simplesmente aceitar o arquivo
// como a pessoa tiver, sem exigir conversao manual antes.
const sshpk = require('sshpk');

function normalizeSshKey(content, passphrase) {
    const text = String(content || '').trim();
    if (!text) return '';

    if (text.startsWith('PuTTY-User-Key-File')) {
        try {
            const key = sshpk.parsePrivateKey(text, 'putty', passphrase ? { passphrase } : {});
            return key.toString('ssh-private');
        } catch (error) {
            if (/passphrase/i.test(error.message) || /decrypt/i.test(error.message)) {
                throw new Error(passphrase
                    ? 'Não foi possível abrir a chave .ppk: senha da chave incorreta.'
                    : 'Essa chave .ppk está protegida por senha. Informe a senha da chave.');
            }
            throw new Error(`Chave .ppk inválida: ${error.message}`);
        }
    }

    // Ja parece OpenSSH/PEM (-----BEGIN ... PRIVATE KEY-----) - usa como esta.
    if (text.includes('PRIVATE KEY')) return text;

    throw new Error('Formato de chave não reconhecido. Envie um arquivo .ppk (PuTTY) ou uma chave OpenSSH/PEM.');
}

module.exports = { normalizeSshKey };
