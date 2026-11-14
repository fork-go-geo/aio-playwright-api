'use strict';
const deny = () => { process.stderr.write('OFFLINE_FIXTURE_NETWORK_FORBIDDEN\n'); process.exit(97); };
global.fetch = deny;
require('node:net').Socket.prototype.connect = deny;
require('node:net').Server.prototype.listen = deny;
for (const name of ['node:http', 'node:https']) {
  require(name).request = deny; require(name).get = deny;
}
const dns = require('node:dns');
for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
  dns[key] = deny; dns.promises[key] = deny;
}
