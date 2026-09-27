import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BRIDGE, OLD, ORIGINAL, noTokenInLogs, probe, run, simulate } from './helpers/jev-cloudflare-sim.mjs';

/* Rollback proof. The real tool runs the rotation against the simulated Cloudflare account (two consumers), with a fault
   injected at every production write it makes, in both ways a write can fail:
     refuse   Cloudflare answers with an error and nothing changes;
     applied  the change happens, but the answer is an error (a timeout on the way back looks like this);
   and under each model of how Cloudflare treats secrets. Every run must end with production exactly as the snapshot
   left it, every consumer answering on the previous token, and no token in the logs. After every write that took effect,
   forward or rollback, every consumer is called end to end: none may fail at any point. */

const BOTH = ['aghnam-jev-api', 'jev-public'];
const MODELS = {
  'forced rollback keeps current secrets': {},
  'forced rollback restores secrets': { rollbackRestoresSecrets: true },
  'secret changes release the latest upload': { secretOpsUseLatestUpload: true },
};
const label = (w) => `${w.step}: ${w.method} ${w.name} ${w.key}`;
const outage = (sim) => sim.samples.filter((x) => Object.values(x.answers).some((v) => !v)).map((x) => `${label(x.write)}${x.write.fault ? ` (${x.write.fault})` : ''} → ${JSON.stringify(x.answers)}`);

async function restored(sim, r, where) {
  const b = sim.cur(BRIDGE);
  assert.equal(b.code, ORIGINAL, `${where}: the bridge runs its original code`);
  assert.deepEqual(b.secrets, {}, `${where}: the bridge has exactly the snapshot's secrets`);
  for (const name of BOTH) {
    assert.deepEqual(sim.cur(name).secrets, { JEV_BRIDGE_TOKEN: OLD, SESSION_SECRET: 's' }, `${where}: ${name} has exactly its previous secrets`);
    assert.equal(await sim.answers(name), true, `${where}: ${name} answers end to end`);
  }
  assert.equal(await probe(sim, OLD), true, `${where}: the previous token opens the bridge`);
  if (r.newToken) assert.equal(await probe(sim, r.newToken), false, `${where}: the new token opens nothing`);
  assert.ok(noTokenInLogs(r), `${where}: no token outside ::add-mask:: lines`);
}

/* the production writes of a clean rotation, in order */
const clean = simulate({ consumers: BOTH });
const cleanRun = await run(clean);
const FORWARD = clean.writes.map(label);

/* the production writes of a rollback after finalize started, which makes every kind of rollback write */
const late = simulate({ consumers: BOTH, fault: (w) => (w.phase === 'forward' && w.step === 'finalize' ? 'applied' : null) });
const lateRun = await run(late);
const ROLLBACK = late.writes.filter((w) => w.phase === 'rollback').map(label);

test('a clean rotation makes six production writes, and both consumers answer after each', () => {
  assert.equal(cleanRun.failed, null, cleanRun.out.join('\n'));
  assert.deepEqual(FORWARD, [
    `stage: PUT ${BRIDGE} LEGACY_ACCESS_TOKEN`, `stage: PUT ${BRIDGE} ACCESS_TOKEN`, `stage: PUT ${BRIDGE} wrapped`,
    'switch: PUT aghnam-jev-api JEV_BRIDGE_TOKEN', 'switch: PUT jev-public JEV_BRIDGE_TOKEN', `finalize: DELETE ${BRIDGE} LEGACY_ACCESS_TOKEN`]);
  assert.equal(clean.samples.length, 6);
  assert.deepEqual(outage(clean), []);
});

test('a rollback after finalize started: old token accepted again, consumers back, original code, secrets deleted, snapshot version', async () => {
  assert.equal(lateRun.failed, 'finalize');
  assert.deepEqual(ROLLBACK, [
    `rollback: PUT ${BRIDGE} LEGACY_ACCESS_TOKEN`, 'rollback: PUT aghnam-jev-api JEV_BRIDGE_TOKEN', 'rollback: PUT jev-public JEV_BRIDGE_TOKEN',
    `rollback: PUT ${BRIDGE} original`, `rollback: DELETE ${BRIDGE} ACCESS_TOKEN`, `rollback: DELETE ${BRIDGE} LEGACY_ACCESS_TOKEN`, `rollback: POST ${BRIDGE} b1`]);
  await restored(late, lateRun, 'finalize applied');
  assert.deepEqual(outage(late), []);
});

for (const [model, opts] of Object.entries(MODELS)) {
  for (const mode of ['refuse', 'applied']) {
    test(`a fault at each forward write (${mode}), ${model}: back to the snapshot, no consumer ever fails`, async () => {
      for (let i = 0; i < FORWARD.length; i++) {
        const where = `${FORWARD[i]} (${mode})`;
        const sim = simulate({ ...opts, consumers: BOTH, fault: (w) => (w.phase === 'forward' && w.n === i ? mode : null) });
        const r = await run(sim);
        assert.equal(r.failed, FORWARD[i].split(':')[0], where);
        assert.match(r.rollbackError || '', /rolled back/, `${where}\n${r.out.join('\n')}`);
        assert.ok(r.out.some((l) => l.includes('rollback verified')), where);
        await restored(sim, r, where);
        assert.deepEqual(outage(sim), [], where);
      }
    });
  }

  test(`every rollback write fails once, ${model}: retried from the live state, back to the snapshot, no consumer ever fails`, async () => {
    /* switch: the second consumer's write is refused (one consumer switched); finalize: its delete took effect */
    for (const [trigger, cause] of [['switch', (w) => (w.name === 'jev-public' ? 'refuse' : null)], ['finalize', () => 'applied']]) {
      for (const mode of ['refuse', 'applied']) {
        const where = `${trigger} fails, each rollback write ${mode} once`;
        const seen = new Set();
        const sim = simulate({ ...opts, consumers: BOTH, fault: (w) => {
          if (w.phase === 'forward') return w.step === trigger ? cause(w) : null;
          if (seen.has(label(w))) return null;
          seen.add(label(w));
          return mode;
        } });
        const r = await run(sim);
        assert.equal(r.failed, trigger, where);
        assert.ok(r.out.some((l) => l.includes('attempt 1 of 4 failed')), where);
        assert.ok(r.out.some((l) => l.includes('rollback verified')), `${where}\n${r.out.join('\n')}`);
        await restored(sim, r, where);
        assert.deepEqual(outage(sim), [], where);
      }
    }
  });

  test(`a rollback write that keeps failing, ${model}: rollback stops, names it, and no consumer ever fails`, async () => {
    for (const target of ROLLBACK) {
      const where = `${target} keeps failing`;
      const sim = simulate({ ...opts, consumers: BOTH, fault: (w) => (w.phase === 'forward' ? (w.step === 'finalize' ? 'applied' : null) : (label(w) === target ? 'refuse' : null)) });
      const r = await run(sim);
      assert.equal(r.failed, 'finalize', where);
      if (target.includes('POST')) {
        /* the snapshot version is the exact rollback point, but the re-uploaded original already serves the same code */
        assert.ok(r.out.some((l) => l.includes('snapshot version could not be redeployed')), where);
        assert.match(r.rollbackError || '', /rolled back/, where);
        await restored(sim, r, where);
      } else {
        assert.match(r.rollbackError || '', /^rollback stopped: .+ failed 4 times/, `${where}\n${r.out.join('\n')}`);
        assert.ok(!r.out.some((l) => l.includes('rollback verified')), where);
      }
      for (const name of BOTH) assert.equal(await sim.answers(name), true, `${where}: ${name} still answers`);
      assert.deepEqual(outage(sim), [], where);
      assert.ok(noTokenInLogs(r), where);
    }
  });
}

test('the workflow rolls back on failure and on cancellation, and no step can outlast the job', () => {
  const y = readFileSync(new URL('../.github/workflows/jev-bridge-rotate.yml', import.meta.url), 'utf8');
  assert.match(y, /^on:\n {2}workflow_dispatch:/m, 'manual only');
  assert.match(y, /^ {4}environment: jev-bridge-rotation$/m, 'behind the approval environment');
  assert.match(y, /^ {2}cancel-in-progress: false$/m, 'a second run never cancels one in progress');
  assert.ok(y.includes('"$CONFIRM" != "ROTATE jev-claude-bridge"'), 'rotate needs the typed confirmation');
  const job = Number(y.match(/^ {4}timeout-minutes: (\d+)$/m)[1]);
  const steps = y.slice(y.indexOf('\n    steps:\n')).split(/\n {6}- /).slice(1).map((b) => ({
    name: (b.match(/^(?:name|uses): (.+)$/m) || [])[1],
    if: (b.match(/^\s+if: (.+)$/m) || [])[1] || null,
    timeout: Number((b.match(/^\s+timeout-minutes: (\d+)$/m) || [])[1]),
    run: (b.match(/^\s+run: (.+)$/m) || [])[1] || '',
    body: b,
  }));
  for (const s of steps) assert.ok(s.timeout > 0, `step "${s.name}" has its own timeout`);
  const total = steps.reduce((a, s) => a + s.timeout, 0);
  assert.ok(total <= job, `the steps' timeouts (${total} min) fit in the job's (${job} min), so a slow step fails before the job is cut off`);

  const at = (step) => steps.findIndex((s) => s.run === `node tools/jev-bridge-migrate.mjs ${step}`);
  const [tests, snapshot, prepare, stage, sw, finalize, rollback] = [steps.findIndex((s) => s.run.startsWith('node --test ')), ...['snapshot', 'prepare', 'stage', 'switch', 'finalize', 'rollback'].map(at)];
  assert.deepEqual([tests, snapshot, prepare, stage, sw, finalize, rollback].map((i) => i >= 0), Array(7).fill(true));
  assert.ok(tests < snapshot && snapshot < prepare && prepare < stage && stage < sw && sw < finalize && finalize < rollback, 'steps in order');
  for (const f of ['jev-bridge-migrate', 'jev-bridge-rotation-sim', 'jev-bridge-rollback-proof']) assert.ok(steps[tests].run.includes(`tests/${f}.test.js`), `the job runs ${f} before touching production`);
  for (const i of [snapshot, prepare]) assert.equal(steps[i].if, null, `"${steps[i].name}" runs in dry-run too`);
  for (const i of [stage, sw, finalize]) assert.equal(steps[i].if, "env.MODE == 'rotate'", `"${steps[i].name}" changes production only in rotate mode`);
  assert.equal(steps[rollback].if, "(failure() || cancelled()) && env.MODE == 'rotate'", 'rollback runs on failure and on cancellation');
  const last = steps[steps.length - 1];
  assert.ok(rollback === steps.length - 2 && last.if === 'always()' && last.body.includes('rm -rf "$STATE_DIR"'), 'the job secrets are removed last, after rollback');
});
