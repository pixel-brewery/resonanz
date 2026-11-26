// #region Imports

import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';

// #endregion

const repository = 'pixel-brewery/resonanz';
const repositoryId = 1440725741;
const workflows = Object.freeze({
  ci: { file: 'ci.yml', name: 'Desktop quality' },
  documentation: {
    file: 'publish-pages.yml',
    name: 'Publish GitHub Pages',
    paths: [
      '.github/workflows/publish-pages.yml',
      'site/',
      '.github/assets/project-card.webp',
      'resources/icons/png/app/resonanz-192.png',
    ],
  },
});
const repositoryPath = `repos/${repository}`;
const shaPattern = /^[0-9a-f]{40}$/u;
const requestFailure =
  'Verification request failed; inspect the original merge and verification runs before retrying.';

/**
 * Continues the existing CI or relevant documentation workflow for one exact native-token merge.
 *
 * @param context - The trusted workflow event, immutable repository identity, exact source and ci/documentation selection.
 * @param dependencies - An optional request(method, endpoint, body) boundary for offline verification.
 * @returns The requested, already-requested or superseded source result.
 * @throws An Error with a controlled diagnostic for invalid metadata, credentials or failed requests.
 * @remarks Existing successful, failed or cancelled verification attempts are retained instead of dispatched again. It executes no PR code and dispatches only a fixed existing workflow; its normal job permissions and publication conditions remain binding.
 *
 * @internal
 */
export async function requestMergedWorkflow(context, dependencies = {}) {
  if (
    context?.eventName !== 'workflow_run' ||
    context?.repository !== repository ||
    ![repositoryId, String(repositoryId)].includes(context?.repositoryId) ||
    typeof context?.sourceSha !== 'string' ||
    !shaPattern.test(context?.sourceSha ?? '')
  )
    throw new Error(requestFailure);

  const selection = context.workflow ?? 'ci';
  if (!['ci', 'documentation'].includes(selection)) throw new Error(requestFailure);
  const definition = workflows[selection];
  const workflowPath = `.github/workflows/${definition.file}`;
  const workflowName = definition.name;
  const sourceSha = context.sourceSha;
  const boundary = dependencies.request ?? requestDependabotGitHub;
  const request = async (method, endpoint, body) => {
    try {
      return await boundary(method, endpoint, body);
    } catch {
      throw new Error(requestFailure);
    }
  };
  const metadata = await request('GET', `repositories/${repositoryId}`);

  if (
    !canonicalRepository(metadata) ||
    metadata.default_branch !== 'main' ||
    metadata.private !== false ||
    metadata.fork !== false
  )
    throw new Error(requestFailure);

  const mainPath = `${repositoryPath}/branches/main`;
  const main = await request('GET', mainPath);

  if (main?.name !== 'main' || !shaPattern.test(main?.commit?.sha ?? ''))
    throw new Error(requestFailure);

  if (main.commit.sha !== sourceSha) return { status: 'superseded', sourceSha };

  if (definition.paths && !(await relevantPaths(sourceSha, definition.paths, request)))
    return { status: 'not-applicable', sourceSha };

  const workflow = await request('GET', `${repositoryPath}/actions/workflows/${definition.file}`);

  if (
    !Number.isSafeInteger(workflow?.id) ||
    workflow.id <= 0 ||
    workflow.path !== workflowPath ||
    workflow.name !== workflowName ||
    workflow.state !== 'active'
  )
    throw new Error(requestFailure);

  const workflowEndpoint = `${repositoryPath}/actions/workflows/${workflow.id}`;
  const runs = await request('GET', `${workflowEndpoint}/runs?head_sha=${sourceSha}&per_page=100`);

  if (
    !Number.isSafeInteger(runs?.total_count) ||
    runs.total_count < 0 ||
    runs.total_count > 100 ||
    !Array.isArray(runs.workflow_runs) ||
    runs.workflow_runs.length > 100 ||
    runs.workflow_runs.length !== runs.total_count ||
    (runs.total_count > 0 && runs.workflow_runs.length === 0) ||
    runs.workflow_runs.some((run) => !canonicalRun(run, workflow.id, sourceSha, workflowPath))
  )
    throw new Error(requestFailure);

  if (runs.total_count > 0)
    return { status: 'already-requested', sourceSha, runId: runs.workflow_runs[0].id };

  const currentMain = await request('GET', mainPath);

  if (currentMain?.name !== 'main' || !shaPattern.test(currentMain?.commit?.sha ?? ''))
    throw new Error(requestFailure);

  if (currentMain.commit.sha !== sourceSha) return { status: 'superseded', sourceSha };

  await request('POST', `${workflowEndpoint}/dispatches`, {
    ref: 'main',
    inputs: { expected_head_sha: sourceSha },
  });

  return { status: 'requested', sourceSha };
}

function canonicalRepository(value) {
  return value?.id === repositoryId && value?.full_name === repository;
}

function canonicalRun(run, workflowId, sourceSha, workflowPath) {
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt > 0 &&
    run.workflow_id === workflowId &&
    run.head_sha === sourceSha &&
    run.head_branch === 'main' &&
    ['push', 'workflow_dispatch'].includes(run.event) &&
    typeof run.path === 'string' &&
    (run.path === workflowPath || run.path.startsWith(`${workflowPath}@`)) &&
    canonicalRepository(run.repository) &&
    canonicalRepository(run.head_repository)
  );
}

async function relevantPaths(sourceSha, paths, request) {
  for (let page = 1; page <= 5; page++) {
    const commit = await request(
      'GET',
      `${repositoryPath}/commits/${sourceSha}?per_page=100&page=${page}`,
    );
    if (commit?.sha !== sourceSha || !Array.isArray(commit.files) || commit.files.length > 100)
      throw new Error(requestFailure);
    for (const file of commit.files) {
      if (
        typeof file?.filename !== 'string' ||
        (file.previous_filename !== undefined && typeof file.previous_filename !== 'string')
      )
        throw new Error(requestFailure);
      if (
        [file.filename, file.previous_filename]
          .filter(Boolean)
          .some((name) =>
            paths.some((path) => (path.endsWith('/') ? name.startsWith(path) : name === path)),
          )
      )
        return true;
    }
    if (commit.files.length < 100) return false;
  }
  throw new Error(requestFailure);
}
