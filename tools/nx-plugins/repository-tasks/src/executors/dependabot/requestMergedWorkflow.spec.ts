// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { requestMergedWorkflow } from './requestMergedWorkflow.mjs';

// #endregion

const repository = 'pixel-brewery/resonanz';
const repositoryId = 1440725741;
const repositoryPath = `repos/${repository}`;
const sourceSha = 'a'.repeat(40);
const changedSha = 'b'.repeat(40);
const workflowId = 303;
const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflowId}`;
const mainPath = `${repositoryPath}/branches/main`;
const context = { eventName: 'workflow_run', repository, repositoryId, sourceSha };

function controlled() {
  const identity = { id: repositoryId, full_name: repository };
  const records = {
    repository: { ...identity, default_branch: 'main', private: false, fork: false },
    main: { name: 'main', commit: { sha: sourceSha } },
    workflow: {
      id: workflowId,
      path: '.github/workflows/ci.yml',
      name: 'Desktop quality',
      state: 'active',
    },
    files: [{ filename: 'site/index.html', status: 'modified' }],
    runs: { total_count: 0, workflow_runs: [] },
    run: {
      id: 404,
      run_attempt: 1,
      workflow_id: workflowId,
      path: '.github/workflows/ci.yml',
      head_sha: sourceSha,
      head_branch: 'main',
      event: 'workflow_dispatch',
      repository: identity,
      head_repository: identity,
      status: 'queued',
      conclusion: null,
    },
  };
  let mainReads = 0;
  const request = vi.fn((method, endpoint) => {
    if (records.failure?.method === method && records.failure?.endpoint === endpoint)
      throw new Error('Sensitive request output must not be exposed.');
    if (method === 'GET' && endpoint === `repositories/${repositoryId}`)
      return structuredClone(records.repository);
    if (
      method === 'GET' &&
      endpoint === `${repositoryPath}/commits/${sourceSha}?per_page=100&page=1`
    )
      return { sha: sourceSha, files: records.files };
    if (method === 'GET' && endpoint === mainPath) {
      mainReads++;
      return structuredClone(mainReads > 1 ? (records.nextMain ?? records.main) : records.main);
    }
    if (
      method === 'GET' &&
      endpoint === `${repositoryPath}/actions/workflows/${records.workflow.path.split('/').at(-1)}`
    )
      return structuredClone(records.workflow);
    if (
      method === 'GET' &&
      endpoint === `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`
    )
      return structuredClone(records.runs);
    if (method === 'POST' && endpoint === `${workflowEndpoint}/dispatches`) {
      if (records.acceptThenFail) {
        records.runs = { total_count: 1, workflow_runs: [records.run] };
        throw new Error('Response was lost after the request was accepted.');
      }
      return undefined;
    }
    throw new Error('Unexpected test request.');
  });
  return { records, request };
}

function writes(request) {
  return request.mock.calls.filter(([method]) => method !== 'GET');
}

describe('Merged source verification request', () => {
  it('requests full CI bound to the exact successful merge source', async () => {
    // arrange
    const dependencies = controlled();

    // act
    const result = await requestMergedWorkflow(
      { ...context, repositoryId: String(repositoryId) },
      dependencies,
    );

    // assert
    expect(result).toEqual({ status: 'requested', sourceSha });
    expect(writes(dependencies.request)).toEqual([
      [
        'POST',
        `${workflowEndpoint}/dispatches`,
        { ref: 'main', inputs: { expected_head_sha: sourceSha } },
      ],
    ]);
    expect(dependencies.request.mock.calls.at(-2)).toEqual(['GET', mainPath, undefined]);
  });

  it.each([
    { eventName: 'pull_request' },
    { repository: 'foreign/project' },
    { repositoryId: 1 },
    { sourceSha: '' },
    { sourceSha: 'not-a-revision' },
  ])('rejects unsupported request context before reading or writing: %j', async (override) => {
    // arrange
    const dependencies = controlled();

    // act
    const result = requestMergedWorkflow({ ...context, ...override }, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(dependencies.request).not.toHaveBeenCalled();
  });

  it.each([
    { id: 1 },
    { full_name: 'foreign/project' },
    { private: true },
    { fork: true },
    { default_branch: 'dev' },
  ])('rejects changed immutable repository metadata: %j', async (override) => {
    // arrange
    const dependencies = controlled();
    Object.assign(dependencies.records.repository, override);

    // act
    const result = requestMergedWorkflow(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each([
    { id: 0 },
    { name: 'Other release' },
    { path: '.github/workflows/ci.yml.lookalike' },
    { state: 'disabled_manually' },
  ])('requires the exact active release workflow: %j', async (override) => {
    // arrange
    const dependencies = controlled();
    Object.assign(dependencies.records.workflow, override);

    // act
    const result = requestMergedWorkflow(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each(['before-inspection', 'before-dispatch'])(
    'does not verify a superseded merge source: %s',
    async (phase) => {
      // arrange
      const dependencies = controlled();
      const moved = { name: 'main', commit: { sha: changedSha } };
      if (phase === 'before-inspection') dependencies.records.main = moved;
      else dependencies.records.nextMain = moved;

      // act
      const result = await requestMergedWorkflow(context, dependencies);

      // assert
      expect(result).toEqual({ status: 'superseded', sourceSha });
      expect(writes(dependencies.request)).toEqual([]);
    },
  );

  it.each(['queued', 'success', 'failure', 'cancelled'])(
    'retains an existing verification attempt instead of dispatching again: %s',
    async (outcome) => {
      // arrange
      const dependencies = controlled();
      dependencies.records.run.status = outcome === 'queued' ? 'queued' : 'completed';
      dependencies.records.run.conclusion = outcome === 'queued' ? null : outcome;
      dependencies.records.runs = { total_count: 1, workflow_runs: [dependencies.records.run] };

      // act
      const result = await requestMergedWorkflow(context, dependencies);

      // assert
      expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
      expect(writes(dependencies.request)).toEqual([]);
    },
  );

  it.each([
    { total_count: -1, workflow_runs: [] },
    { total_count: 0, workflow_runs: null },
    { total_count: 1, workflow_runs: [] },
  ])('fails closed for an incomplete workflow-run listing: %j', async (runs) => {
    // arrange
    const dependencies = controlled();
    dependencies.records.runs = runs;

    // act
    const result = requestMergedWorkflow(context, dependencies);

    // assert
    await expect(result).rejects.toThrow('Verification request failed');
    expect(writes(dependencies.request)).toEqual([]);
  });

  it.each([
    { id: 0 },
    { head_sha: changedSha },
    { workflow_id: 304 },
    { event: 'pull_request' },
    { head_branch: 'dev' },
    { repository: {} },
    { head_repository: {} },
  ])(
    'retains malformed records and ignores unrelated valid run identities: %j',
    async (override) => {
      // arrange
      const dependencies = controlled();
      Object.assign(dependencies.records.run, override);
      dependencies.records.runs = { total_count: 1, workflow_runs: [dependencies.records.run] };

      // act
      const result = requestMergedWorkflow(context, dependencies);

      // assert
      if (override.id === 0) {
        await expect(result).rejects.toThrow('Verification request failed');
        expect(writes(dependencies.request)).toEqual([]);
      } else {
        expect((await result).status).toBe('requested');
        expect(writes(dependencies.request)).toHaveLength(1);
      }
    },
  );

  it('recovers an ambiguous dispatch response by finding the original accepted run', async () => {
    // arrange
    const dependencies = controlled();
    dependencies.records.acceptThenFail = true;
    await expect(requestMergedWorkflow(context, dependencies)).rejects.toThrow(
      'Verification request failed',
    );

    // act
    const result = await requestMergedWorkflow(context, dependencies);

    // assert
    expect(result).toEqual({ status: 'already-requested', sourceSha, runId: 404 });
    expect(writes(dependencies.request)).toHaveLength(1);
  });
});

for (const filename of [
  'site/index.html',
  '.github/workflows/publish-pages.yml',
  'resources/icons/png/app/resonanz-192.png',
]) {
  it(`continues the existing Pages push path ${filename}`, async () => {
    // Arrange
    const f = controlled();
    f.records.workflow.path = '.github/workflows/publish-pages.yml';
    f.records.workflow.name = 'Publish GitHub Pages';
    f.records.run.path = f.records.workflow.path;
    f.records.files = [{ filename, status: 'modified' }];
    // Act
    const result = await requestMergedWorkflow({ ...context, workflow: 'documentation' }, f);
    // Assert
    expect(result.status).toBe('requested');
    expect(writes(f.request)).toEqual([
      [
        'POST',
        `${workflowEndpoint}/dispatches`,
        { ref: 'main', inputs: { expected_head_sha: sourceSha } },
      ],
    ]);
  });
}

it('preserves the existing Pages path filter for unrelated dependency changes', async () => {
  // Arrange
  const f = controlled();
  f.records.files = [{ filename: 'package.json', status: 'modified' }];
  // Act
  const result = await requestMergedWorkflow({ ...context, workflow: 'documentation' }, f);
  // Assert
  expect(result).toEqual({ status: 'not-applicable', sourceSha });
  expect(writes(f.request)).toEqual([]);
});

it('includes a removed previous Pages path when a file is renamed', async () => {
  // Arrange
  const f = controlled();
  f.records.workflow.path = '.github/workflows/publish-pages.yml';
  f.records.workflow.name = 'Publish GitHub Pages';
  f.records.run.path = f.records.workflow.path;
  f.records.files = [
    { filename: 'docs/old-site.html', previous_filename: 'site/index.html', status: 'renamed' },
  ];
  // Act
  const result = await requestMergedWorkflow({ ...context, workflow: 'documentation' }, f);
  // Assert
  expect(result.status).toBe('requested');
});

it('retains an existing failed source-bound Pages attempt', async () => {
  // Arrange
  const f = controlled();
  f.records.workflow.path = '.github/workflows/publish-pages.yml';
  f.records.workflow.name = 'Publish GitHub Pages';
  f.records.run.path = f.records.workflow.path;
  f.records.runs = {
    total_count: 1,
    workflow_runs: [{ ...f.records.run, status: 'completed', conclusion: 'failure' }],
  };
  // Act
  const result = await requestMergedWorkflow({ ...context, workflow: 'documentation' }, f);
  // Assert
  expect(result.status).toBe('already-requested');
  expect(writes(f.request)).toEqual([]);
});

it('rejects an arbitrary continuation workflow before contacting GitHub', async () => {
  // Arrange
  const f = controlled();
  // Act and Assert
  await expect(requestMergedWorkflow({ ...context, workflow: 'release' }, f)).rejects.toThrow();
  expect(f.request).not.toHaveBeenCalled();
});

it('retains a malformed existing continuation attempt: missing', async () => {
  // Arrange
  const f = controlled();
  f.records.run.run_attempt = undefined;
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act and Assert
  await expect(requestMergedWorkflow(context, f)).rejects.toThrow();
  expect(writes(f.request)).toEqual([]);
});
it('retains a malformed existing continuation attempt: zero', async () => {
  // Arrange
  const f = controlled();
  f.records.run.run_attempt = 0;
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act and Assert
  await expect(requestMergedWorkflow(context, f)).rejects.toThrow();
  expect(writes(f.request)).toEqual([]);
});
it('retains a malformed existing continuation attempt: negative', async () => {
  // Arrange
  const f = controlled();
  f.records.run.run_attempt = -1;
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act and Assert
  await expect(requestMergedWorkflow(context, f)).rejects.toThrow();
  expect(writes(f.request)).toEqual([]);
});
it('retains an existing actual main push without a duplicate continuation: queued', async () => {
  // Arrange
  const f = controlled();
  Object.assign(f.records.run, { event: 'push', status: 'queued', conclusion: null });
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act
  const result = await requestMergedWorkflow(context, f);
  // Assert
  expect(result.status).toBe('already-requested');
  expect(writes(f.request)).toEqual([]);
});
it('retains an existing actual main push without a duplicate continuation: failure', async () => {
  // Arrange
  const f = controlled();
  Object.assign(f.records.run, { event: 'push', status: 'completed', conclusion: 'failure' });
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act
  const result = await requestMergedWorkflow(context, f);
  // Assert
  expect(result.status).toBe('already-requested');
  expect(writes(f.request)).toEqual([]);
});
it('retains an existing actual main push without a duplicate continuation: cancelled', async () => {
  // Arrange
  const f = controlled();
  Object.assign(f.records.run, { event: 'push', status: 'completed', conclusion: 'cancelled' });
  f.records.runs = { total_count: 1, workflow_runs: [f.records.run] };
  // Act
  const result = await requestMergedWorkflow(context, f);
  // Assert
  expect(result.status).toBe('already-requested');
  expect(writes(f.request)).toEqual([]);
});
