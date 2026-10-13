import test from 'node:test';
import assert from 'node:assert/strict';
import { API, BRIDGE, OLD, ORIGINAL, e2e, noTokenInLogs, probe, run, simulate } from './helpers/jev-cloudflare-sim.mjs';

/* The whole rotation — snapshot, prepare, stage, switch, finalize and, on failure, rollback — run by the real tool
   against a simulated Cloudflare account (tests/helpers/jev-cloudflare-sim.mjs). Every fault at every production write
   is covered in tests/jev-bridge-rollback-proof.test.js. */

const rollbackAnswers = (sim) => sim.samples.filter((x) => x.write.phase === 'rollback').map((x) => `${x.write.name} ${x.write.method} ${x.write.key}: ${x.answers[API]}`);

test('happy path: bridge on the secret, consumers on the same new token, old token dead, nothing printed', async () => {
  const sim = simulate(); const r = await run(sim);
  assert.equal(r.failed, null, r.out.join('\n'));
  const b = sim.cur(BRIDGE);
  assert.ok(!b.code.includes(OLD) && /jev-bridge-migrate: wrapped/.test(b.code));
  assert.equal(b.secrets.ACCESS_TOKEN, r.newToken); assert.equal('LEGACY_ACCESS_TOKEN' in b.secrets, false);
  assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, r.newToken, 'consumer uses the same token');
  assert.equal(await probe(sim, OLD), false); assert.equal(await probe(sim, r.newToken), true); assert.equal(await e2e(sim), true);
  const root = await (await sim.fetch(`https://${BRIDGE}.sim.workers.dev/`)).text();
  assert.ok(!root.includes(r.newToken) && !root.includes(OLD) && !/\/mcp\/(?!\[redacted\])/.test(root));
  assert.ok(r.masks.includes(OLD) && r.masks.includes(r.newToken), 'both values are masked');
  assert.ok(noTokenInLogs(r), 'no token outside ::add-mask:: lines');
  assert.ok(sim.samples.every((x) => x.answers[API]), 'the consumer answers after every production write');
});

for (const restores of [false, true]) {
  const how = restores ? 'rollback restores secrets' : 'rollback keeps current secrets (worst case)';
  test(`switch fails → explicit rollback; ${how}`, async () => {
    const sim = simulate({ rollbackRestoresSecrets: restores, consumerBroken: ({ secrets }) => secrets.JEV_BRIDGE_TOKEN !== OLD });
    const r = await run(sim);
    assert.equal(r.failed, 'switch');
    assert.match(r.rollbackError, /rolled back/);
    assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
    assert.equal(sim.cur(BRIDGE).code, ORIGINAL, 'bridge runs its original code again');
    assert.deepEqual(sim.cur(BRIDGE).secrets, {}, 'the secrets rotation added to the bridge are gone');
    assert.ok(r.out.some((l) => l.includes(`${API} bindings and secret names match the snapshot`)));
    assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, OLD, 'consumer token written back explicitly');
    assert.equal(await probe(sim, OLD), true); assert.equal(await e2e(sim), true);
    assert.ok(noTokenInLogs(r));
  });
  test(`finalize fails → the old token is accepted again, consumers go back, then the bridge; ${how}`, async () => {
    const sim = simulate({ rollbackRestoresSecrets: restores, consumerBroken: ({ bridge }) => /jev-bridge-migrate/.test(bridge.code || '') && !('LEGACY_ACCESS_TOKEN' in bridge.secrets) });
    const r = await run(sim);
    assert.equal(r.failed, 'finalize');
    assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
    const order = r.out.filter((l) => l.startsWith('↩'));
    const at = (re) => order.findIndex((l) => re.test(l));
    const consumerBack = at(new RegExp(`^↩ ${API}:`)), uploaded = at(/original source re-uploaded/);
    assert.equal(at(/LEGACY_ACCESS_TOKEN written back/), 0, order.join(' | '));
    assert.ok(consumerBack > 0 && consumerBack < uploaded, order.join(' | '));
    assert.ok(uploaded < at(/secret ACCESS_TOKEN deleted/), 'the original code is back before any secret is deleted');
    /* the first rollback write makes the bridge accept the old token again, so the consumer answers after every write */
    const answers = rollbackAnswers(sim);
    assert.ok(answers.length > 3 && answers.every((l) => l.endsWith('true')), answers.join('\n'));
    assert.equal(sim.cur(BRIDGE).code, ORIGINAL); assert.equal(sim.cur(API).secrets.JEV_BRIDGE_TOKEN, OLD);
    assert.deepEqual(sim.cur(BRIDGE).secrets, {});
    assert.equal(await probe(sim, OLD), true); assert.equal(await e2e(sim), true);
    assert.ok(noTokenInLogs(r));
  });
}

test('the deployments API refusing the snapshot version is reported; the re-uploaded original serves', async () => {
  const sim = simulate({ deploymentsFail: true, consumerBroken: ({ secrets }) => secrets.JEV_BRIDGE_TOKEN !== OLD });
  const r = await run(sim);
  assert.equal(r.failed, 'switch');
  assert.ok(r.out.some((l) => l.includes('original source re-uploaded')), r.out.join('\n'));
  assert.ok(r.out.some((l) => l.includes('snapshot version could not be redeployed')), r.out.join('\n'));
  assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
  assert.equal(sim.cur(BRIDGE).code, ORIGINAL); assert.deepEqual(sim.cur(BRIDGE).secrets, {}); assert.equal(await e2e(sim), true);
  assert.ok(noTokenInLogs(r));
});

test('a failure before production changes rolls nothing back', async () => {
  const sim = simulate();
  /* a working bridge whose token is not a plain literal: the transform cannot migrate it, so prepare refuses */
  sim.scripts[BRIDGE].versions.b1.code = ORIGINAL.replace(`const ACCESS_TOKEN = "${OLD}";`, `const ACCESS_TOKEN = ["${OLD.slice(0, 10)}", "${OLD.slice(10)}"].join("");`);
  const r = await run(sim);
  assert.equal(r.failed, 'prepare');
  assert.ok(r.out.some((l) => l.includes('production was not changed')));
  assert.equal(sim.scripts[BRIDGE].deployed, 'b1'); assert.equal(sim.scripts[API].deployed, 'a1');
  assert.deepEqual(sim.writes, [], 'no production write at all');
});

test('secret changes that release the most recent upload still release the original: it is uploaded before any delete', async () => {
  const sim = simulate({ secretOpsUseLatestUpload: true, consumerBroken: ({ secrets }) => secrets.JEV_BRIDGE_TOKEN !== OLD });
  const r = await run(sim);
  assert.equal(r.failed, 'switch');
  assert.ok(r.out.some((l) => l.includes('rollback verified')), r.out.join('\n'));
  assert.ok(!r.out.some((l) => l.includes('wrapped code still answers')), 'the wrapped code never comes back');
  const answers = rollbackAnswers(sim);
  assert.ok(answers.every((l) => l.endsWith('true')), answers.join('\n'));
  assert.equal(sim.cur(BRIDGE).code, ORIGINAL); assert.deepEqual(sim.cur(BRIDGE).secrets, {});
  assert.equal(await probe(sim, OLD), true); assert.equal(await e2e(sim), true);
  assert.ok(noTokenInLogs(r));
});

test('snapshot refuses when the bridge already has a secret rollback would delete', async () => {
  const sim = simulate();
  sim.scripts[BRIDGE].versions.b1.secrets = { LEGACY_ACCESS_TOKEN: 'pre-existing' };
  const r = await run(sim);
  assert.equal(r.failed, 'snapshot');
  assert.ok(r.out.some((l) => l.includes('already has secret(s) LEGACY_ACCESS_TOKEN')));
  assert.equal(sim.scripts[BRIDGE].deployed, 'b1');
});

test('snapshot refuses when a consumer does not work before any change', async () => {
  const sim = simulate({ consumerBroken: () => true });
  const r = await run(sim);
  assert.equal(r.failed, 'snapshot');
  assert.ok(r.out.some((l) => l.includes('baseline: aghnam-jev-api')));
  assert.equal(sim.scripts[BRIDGE].deployed, 'b1'); assert.equal(sim.scripts[API].deployed, 'a1');
});
