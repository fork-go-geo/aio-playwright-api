const assert = require('assert');
const http = require('node:http');

// This fixture tests only Node's documented transport primitive on a local
// ephemeral server. It does not alter the production helper's policy: that
// helper continues to reject loopback before a socket is opened.
(async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('fixture');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const port = server.address().port;
    const observed = await new Promise((resolve, reject) => {
      const req = http.request({
        protocol: 'http:', hostname: 'fixture.invalid', port, path: '/', method: 'GET', agent: false,
        lookup: (hostname, options, callback) => {
          try {
            assert.strictEqual(hostname, 'fixture.invalid');
            if (options && options.all === true) callback(null, [{ address: '127.0.0.1', family: 4 }]);
            else callback(null, '127.0.0.1', 4);
          }
          catch (error) { callback(error); }
        }
      }, response => {
        const peer = response.socket.remoteAddress;
        response.resume();
        response.once('end', () => resolve({ status: response.statusCode, peer }));
      });
      req.once('error', reject);
      req.end();
    });
    assert.strictEqual(observed.status, 200);
    assert.ok(observed.peer === '127.0.0.1' || observed.peer === '::ffff:127.0.0.1', observed.peer);
    console.log(JSON.stringify({ pass: true, fixture: 'node_custom_lookup_loopback_contract_v1', peer: observed.peer }));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
