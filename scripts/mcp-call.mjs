const [toolName, rawArgs = '{}'] = process.argv.slice(2);
if (!toolName) throw new Error('Informe o nome da ferramenta');
const endpoint = process.env.MCP_INTERNAL_URL || 'http://127.0.0.1:8000/mcp';
const headers = {
  authorization: `Bearer ${process.env.MCP_API_TOKEN}`,
  accept: 'application/json, text/event-stream',
  'content-type': 'application/json'
};
function parseBody(text) {
  const data = text.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).filter(Boolean);
  return JSON.parse(data.at(-1) || text);
}
async function post(body, sessionId) {
  const response = await fetch(endpoint, { method: 'POST', headers: { ...headers, ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
  return { value: text ? parseBody(text) : null, sessionId: response.headers.get('mcp-session-id') || sessionId };
}
const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'validation-runner', version: '1.0' } } });
await post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }, init.sessionId);
const result = await post({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: toolName, arguments: JSON.parse(rawArgs) } }, init.sessionId);
process.stdout.write(JSON.stringify(result.value));
