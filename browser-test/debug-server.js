const path = require('path');
const http = require('http');
const handler = require('serve-handler');

const config = {
  public: path.resolve(__dirname, '..'),
};

const server = http.createServer((request, response) =>
  handler(request, response, config));

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  console.log(`http://127.0.0.1:${port}`);
});
