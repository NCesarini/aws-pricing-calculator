const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { createAwsCalculatorServer, createEstimateStoreRegistry } = require('../mcp-server');

async function connectClient(estimates) {
  const server = createAwsCalculatorServer({ estimates });
  const client = new Client({ name: 'state-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return client;
}

function textContent(result) {
  assert.equal(result.content?.[0]?.type, 'text');
  return result.content[0].text;
}

describe('MCP estimate state', () => {
  it('reuses estimates across server instances with the same session store', async () => {
    const registry = createEstimateStoreRegistry();
    const estimates = registry.getStore('darcy-session-1');
    const firstClient = await connectClient(estimates);

    const createResult = await firstClient.callTool({
      name: 'create_estimate',
      arguments: { name: 'Cross-session estimate' },
    });
    const estimateId = JSON.parse(textContent(createResult)).estimate_id;
    await firstClient.close();

    const secondClient = await connectClient(registry.getStore('darcy-session-1'));
    const addResult = await secondClient.callTool({
      name: 'add_service',
      arguments: {
        estimate_id: estimateId,
        services: JSON.stringify([{
          service: 'aWSLambda',
          config: {
            region: 'us-east-1',
            description: 'API handler',
          },
        }]),
      },
    });

    assert.equal(addResult.isError, undefined);
    assert.deepEqual(JSON.parse(textContent(addResult)), [{
      success: true,
      service: 'aWSLambda',
      group: '(ungrouped)',
    }]);
    await secondClient.close();
  });

  it('isolates estimates between different session stores', async () => {
    const registry = createEstimateStoreRegistry();
    const firstClient = await connectClient(registry.getStore('darcy-session-1'));

    const createResult = await firstClient.callTool({
      name: 'create_estimate',
      arguments: { name: 'Isolated estimate' },
    });
    const estimateId = JSON.parse(textContent(createResult)).estimate_id;
    await firstClient.close();

    const secondClient = await connectClient(registry.getStore('darcy-session-2'));
    const addResult = await secondClient.callTool({
      name: 'add_service',
      arguments: {
        estimate_id: estimateId,
        services: JSON.stringify([{
          service: 'aWSLambda',
          config: {
            region: 'us-east-1',
            description: 'API handler',
          },
        }]),
      },
    });

    assert.equal(addResult.isError, true);
    assert.match(textContent(addResult), new RegExp(`Estimate "${estimateId}" not found\\.`));
    await secondClient.close();
  });
});
