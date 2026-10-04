'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual planner and runtime with independently controlled native
// input, loaded terrain and clock. Only the reusable fixture is evaluated.
const fixtureSource = fs.readFileSync(path.join(__dirname, 'baritone-expansion.test.cjs'), 'utf8');
const fixtureBoundary = fixtureSource.search(/\r?\ntest\(/);
assert.ok(fixtureBoundary > 0, 'the expansion fixture must be available');
const { harness, stone } = vm.runInNewContext(fixtureSource.slice(0, fixtureBoundary) + '\n({ harness, stone });',
  { require, __dirname, console });

function finishJob(h, index = 0) {
  for (let tick = 0; tick < 120 && !h.jobs[index]?.job.done; tick++) h.advance(50);
  assert.equal(h.jobs[index]?.job.done, true, JSON.stringify(h.api.debug()));
  return h.jobs[index];
}

function walkSegment(h, segment) {
  for (const point of segment.job.result.path.slice(1)) {
    h.moveTo(point); h.advance(50);
    assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
  }
}

function instrument(h, hold = () => false) {
  const factory = h.context.__MF_BARITONE_PLANNER__;
  h.context.__MF_BARITONE_PLANNER__ = { ...factory, create(...args) {
    const planner = factory.create(...args), search = planner.search;
    return { ...planner, search(...searchArgs) {
      const job = search(...searchArgs), index = h.jobs.length - 1;
      const step = job.step, cancel = job.cancel;
      job.testSteps = []; job.testCancellations = 0;
      job.step = budget => {
        job.testSteps.push({ ...budget });
        return hold(index) ? null : step(budget);
      };
      job.cancel = () => { job.testCancellations++; return cancel(); };
      return job;
    } };
  } };
}

function waitAtFrontier(h) {
  const first = finishJob(h);
  assert.equal(first.job.result.complete, false);
  assert.equal(first.job.result.reason, 'unloaded_frontier');
  walkSegment(h, first);
  for (let tick = 0; tick < 120 && h.api.status !== 'waiting'; tick++) h.advance(50);
  assert.equal(h.api.status, 'waiting', JSON.stringify(h.api.debug()));
  return first;
}

test('verified cheap long-range routes grow from 32 to 64 to 128 without resetting their horizon on progress', () => {
  const h = harness({ maxX: 1024 });
  assert.equal(h.api.goto(600, 1, 0), true);
  const first = finishJob(h);
  assert.equal(first.goal.x - first.start.x, 32, 'the first section remains bounded for initially loaded terrain');
  assert.equal(first.job.result.complete, true);
  assert.ok(h.api.debug().lookahead >= 64, 'a verified cheap walking section earns a larger next horizon');
  for (let tick = 0; tick < 20 && !h.jobs[1]; tick++) h.advance(50);
  const second = finishJob(h, 1);
  assert.equal(second.start.x, 32);
  assert.equal(second.goal.x - second.start.x, 64);
  walkSegment(h, first);
  assert.equal(h.api.debug().routeGoal.x, second.goal.x);
  assert.equal(h.api.debug().lookahead, 128);
  h.moveTo(second.job.result.path[5]); h.advance(50);
  assert.equal(h.api.debug().lookahead, 128, 'real safe progress must not restore the historical 32-block ceiling');
  assert.equal(h.api.goal.x, 600);
  for (const point of second.job.result.path.slice(6)) {
    h.moveTo(point); h.advance(50);
    if (h.jobs[2]) break;
  }
  const third = finishJob(h, 2);
  assert.equal(third.start.x, second.goal.x);
  assert.equal(third.goal.x - third.start.x, 128);
  assert.equal(third.job.result.complete, true);
  assert.equal(h.api.debug().lookahead, 128);
  h.api.destroy();
});

test('background continuation begins with more than eight nodes remaining and retains a bounded cancellable slice', () => {
  const h = harness({ maxX: 1024 });
  instrument(h, index => index > 0);
  assert.equal(h.api.goto(600, 1, 0), true);
  finishJob(h);
  for (let tick = 0; tick < 20 && !h.jobs[1]; tick++) h.advance(50);
  const next = h.jobs[1]?.job;
  assert.ok(next, 'precalculation should start before approaching the last eight points');
  const debug = h.api.debug();
  assert.ok(debug.path - debug.pathIndex > 8, JSON.stringify(debug));
  assert.equal(debug.precalculating, true);
  assert.equal(h.api.status, 'moving');
  assert.ok(next.testSteps.length > 0);
  assert.ok(next.testSteps.every(budget => budget.maxMs <= 2 && budget.maxNodes <= 256), 'background planning keeps its per-tick time and node budget');
  h.api.stop();
  assert.equal(next.testCancellations, 1);
  assert.equal(next.result.reason, 'cancelled');
  const steps = next.testSteps.length, jobs = h.jobs.length, inputs = h.controls.length;
  h.advance(4000);
  assert.equal(next.testSteps.length, steps);
  assert.equal(h.jobs.length, jobs);
  assert.equal(h.controls.length, inputs);
  h.api.destroy();
});

test('an unloaded large-horizon endpoint backs off its actual projection without discarding a proven 128-block horizon', () => {
  const h = harness({ maxX: 1024 });
  assert.equal(h.api.goto(600, 1, 0), true);
  const first = finishJob(h), second = finishJob(h, 1);
  walkSegment(h, first);
  assert.equal(h.api.debug().lookahead, 128);
  assert.equal(h.api.debug().routeGoal.x, 96);
  h.config.unknown = x => x > 128;
  for (const point of second.job.result.path.slice(1)) {
    h.moveTo(point); h.advance(50);
    if (h.jobs[2]) break;
  }
  const projected = finishJob(h, 2);
  assert.equal(projected.start.x, 96);
  assert.ok(projected.goal.x - projected.start.x <= 32, JSON.stringify(projected.goal));
  assert.equal(projected.goal.x, 128, '224 and 160 are unknown, but the 32-block endpoint is loaded');
  assert.ok(h.readCell(projected.goal.x, projected.goal.y, projected.goal.z)?.known);
  assert.equal(projected.job.result.complete, true);
  assert.equal(h.api.debug().lookahead, 128, 'availability backoff is local, not a reset of proven planning ability');
  assert.equal(h.api.goal.x, 600);
  assert.ok(h.jobs.every(entry => entry.goal.x <= 128), 'do not launch a full search at a knowingly unloaded large projection');
  h.api.destroy();
});

test('an unchanged unloaded frontier waits with neutral input instead of repeating a full search every second', () => {
  let frontier = 8;
  const h = harness({ maxX: 128, unknown: x => x > frontier });
  assert.equal(h.api.goto(80, 1, 0), true);
  waitAtFrontier(h);
  assert.equal(h.api.debug().waitingForChunks, true);
  const jobs = h.jobs.length, inputs = h.controls.length;
  const position = { ...h.player.pos };
  h.advance(4000);
  assert.equal(h.api.status, 'waiting', JSON.stringify(h.api.debug()));
  assert.equal(h.jobs.length, jobs, 'the loaded frontier has not changed, so rebuilding A* cannot provide new information');
  assert.deepEqual({ ...h.player.pos }, position);
  assert.ok(h.controls.slice(inputs).every(control => !control.forward && !control.strafe && !control.jump), 'waiting never sends exploratory movement into an unknown chunk');
  assert.equal(h.api.goal.x, 80);
  frontier = 16;
  h.advance(1000);
  assert.ok(h.jobs.length > jobs, 'nearby newly known blocks trigger the next search within one bounded wait interval');
  assert.notEqual(h.api.status, 'failed', JSON.stringify(h.api.debug()));
  const resumed = finishJob(h, jobs);
  assert.ok(resumed.job.result.path.at(-1)?.x > Math.floor(position.x));
  assert.equal(h.api.goal.x, 80, 'loading a checkpoint must not replace the global destination');
  h.api.destroy();
});

test('unchanged frontier waiting preserves the bounded retry limit without rebuilding its search tree', () => {
  const h = harness({ maxX: 128, unknown: x => x > 8 });
  assert.equal(h.api.goto(80, 1, 0), true);
  waitAtFrontier(h);
  const jobs = h.jobs.length, began = h.time(), retries = [h.api.debug().retries];
  for (let interval = 0; interval < 8 && h.api.status !== 'failed'; interval++) {
    h.advance(1000);
    if (h.api.status !== 'failed') retries.push(h.api.debug().retries);
  }
  assert.equal(h.api.status, 'failed');
  assert.equal(h.jobs.length, jobs, 'the retry limit applies to cheap readiness checks, not repeated A* rebuilds');
  assert.equal(Math.max(...retries), 6, 'six bounded readiness retries precede failure');
  assert.ok(h.time() - began <= 7000, 'unchanged terrain cannot leave an eternal active command');
  assert.equal(h.controls.at(-1).released, true);
  h.api.destroy();
});

test('a known obstacle at the larger endpoint is left to pathfinding rather than mistaken for an unloaded chunk', () => {
  const h = harness({ maxX: 1024 });
  assert.equal(h.api.goto(600, 1, 0), true);
  const first = finishJob(h), second = finishJob(h, 1);
  walkSegment(h, first);
  assert.equal(h.api.debug().lookahead, 128);
  const bedrock = { ...stone, name: 'bedrock', breakable: false };
  h.set(224, 1, 0, bedrock); h.set(224, 2, 0, bedrock);
  for (const point of second.job.result.path.slice(1)) {
    h.moveTo(point); h.advance(50);
    if (h.jobs[2]) break;
  }
  const next = h.jobs[2];
  assert.ok(next);
  assert.equal(next.goal.x, 224, 'known solid terrain is a routing problem, not an availability backoff');
  assert.equal(h.api.goal.x, 600);
  h.api.destroy();
});

test('loading a watched route endpoint resumes search without authorizing movement across still-unknown intermediate cells', () => {
  const loaded = new Set();
  const h = harness({ maxX: 128, unknown: x => x > 8 && !loaded.has(x) });
  assert.equal(h.api.goto(80, 1, 0), true);
  waitAtFrontier(h);
  const routeGoal = h.api.debug().routeGoal, position = { ...h.player.pos };
  const jobs = h.jobs.length, inputs = h.controls.length;
  assert.ok(routeGoal.x > position.x);
  loaded.add(routeGoal.x);
  assert.equal(h.readCell(9, 1, 0), null, 'the neighboring corridor is still unknown');
  h.advance(1000);
  assert.ok(h.jobs.length > jobs, 'the readiness watch includes the requested route endpoint as well as nearby cells');
  assert.deepEqual({ ...h.player.pos }, position);
  assert.ok(h.controls.slice(inputs).every(control => !control.forward && !control.strafe && !control.jump));
  const resumed = finishJob(h, jobs);
  assert.equal(resumed.job.result.complete, false, 'a loaded endpoint cannot make unknown intermediate terrain traversable');
  assert.ok(resumed.job.result.path.every(point => point.x <= 8));
  h.api.destroy();
});
