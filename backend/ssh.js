const {
    Client
} = require('ssh2');
const net = require('net');
const fs = require('fs');

function createTunnel(o) {
    return new Promise((resolve, reject) => {
        const ssh = new Client();
        let server;
        let done = false;
        const fail = e => {
            if (done) return;
            done = true;
            try {
                server?.close()
            } catch (_) {}
            try {
                ssh.end()
            } catch (_) {}
            reject(e)
        };
        ssh.on('ready', () => {
            server = net.createServer(sock => ssh.forwardOut('127.0.0.1', 0, o.dbHost, o.dbPort, (err, stream) => {
                if (err) {
                    sock.destroy(err);
                    return
                }
                sock.pipe(stream).pipe(sock)
            }));
            server.on('error', fail);
            server.listen(0, '127.0.0.1', () => {
                if (done) return;
                done = true;
                resolve({
                    localPort: server.address().port,
                    close: () => new Promise(r => {
                        try {
                            server.close(() => {
                                try {
                                    ssh.end()
                                } catch (_) {}
                                r()
                            })
                        } catch (_) {
                            try {
                                ssh.end()
                            } catch (_) {}
                            r()
                        }
                    })
                })
            });
        }).on('error', fail);
        const opt = {
            host: o.host,
            port: o.port,
            username: o.user,
            readyTimeout: 15000
        };
        if (o.privateKey) opt.privateKey = o.privateKey;
        else if (o.privateKeyPath) opt.privateKey = fs.readFileSync(o.privateKeyPath);
        else opt.password = o.password;
        ssh.connect(opt);
    });
}
module.exports = {
    createTunnel
};