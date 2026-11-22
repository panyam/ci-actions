// The trap itself, started detached by main.js so it outlives the step:
//
//   node proxy.js <host> <port> <log> <port-file>
//
// Every request it gets is a host the caller didn't mean to reach. It appends one line per request
// to <log>, "<host>\t<request line>", and answers 502. It writes the port it bound to <port-file>
// once it listens, so port 0 works.

const fs = require('fs');
const http = require('http');

const [host, port, log, portFile] = process.argv.slice(2);

function record(target, line) {
  fs.appendFileSync(log, `${target}\t${line}\n`);
}

function hostOf(req) {
  try {
    return new URL(req.url).host;
  } catch {
    return req.headers.host || '(no host)';
  }
}

const server = http.createServer((req, res) => {
  record(hostOf(req), `${req.method} ${req.url} HTTP/${req.httpVersion}`);
  res.writeHead(502, { 'Content-Type': 'text/plain', Connection: 'close' });
  res.end('egress-trap: this host is not allowed\n');
});

server.on('connect', (req, socket) => {
  record(req.url, `CONNECT ${req.url} HTTP/${req.httpVersion}`);
  socket.on('error', () => {});
  socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
});

server.on('clientError', (_err, socket) => socket.destroy());

fs.writeFileSync(log, '');
server.listen(Number(port), host, () => {
  fs.writeFileSync(portFile, String(server.address().port));
});
