'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const wsCompanyDetails = require('../ws/wsCompanyDetails.cjs');
const wsCompanyProfile = require('../ws/wsCompanyProfile.cjs');
const wsCompanyStock = require('../ws/wsCompanyStock.cjs');

function fastifyFor(userId) {
  return {
    mongo: {
      client: {
        db(name) {
          assert.equal(name, String(userId));
          return {
            collection() {
              return {
                async findOne() { return { timestamp: 1, details: { employees: 1 }, company: { name: 'Test' }, stocks: { cash: 1 } }; }
              };
            }
          };
        }
      }
    },
    log: { warn() {} }
  };
}

for (const [name, handler] of [
  ['company details', wsCompanyDetails],
  ['company profile', wsCompanyProfile],
  ['company stock', wsCompanyStock]
]) {
  test(`${name} uses the authenticated userId session field`, async () => {
    const sent = [];
    await handler({ send(message) { sent.push(JSON.parse(message)); } }, {
      session: { userId: 42, TornAPIKey: 'server-side-key' }
    }, fastifyFor(42), {});
    assert.equal(sent.length, 1);
    assert.equal(sent[0].ok, true);
  });
}
