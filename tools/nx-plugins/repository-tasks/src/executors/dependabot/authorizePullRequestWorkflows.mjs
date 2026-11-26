// #region Imports
import { requestDependabotGitHub } from './requestDependabotGitHub.mjs';
import { resolveDependabotRepository } from './resolveDependabotRepository.mjs';
import { authorizePullRequestWorkflow } from './authorizePullRequestWorkflow.mjs';
import { verificationPolicy } from './verificationPolicy.mjs';
// #endregion

/**
 * Routes real approval-required CI to the isolated read-only authorization job.
 *
 * @param context - The trusted default-branch workflow event and repository identity.
 * @param dependencies - The bounded existing-token GitHub request boundary.
 * @returns One fixed authorization outcome per current own bot PR, at most thirty.
 * @remarks A CI event selects only its actual current native run and attempt. Scheduled recovery reads a bounded open inventory. Branch refresh, merge, diagnostics, dependency installation and publication are outside this owner.
 * @internal
 */
export async function authorizePullRequestWorkflows(context, dependencies = {}) {
  if (!['workflow_run', 'workflow_dispatch', 'schedule'].includes(context?.eventName)) return [];
  const request = dependencies.request ?? requestDependabotGitHub;
  const identity = await resolveDependabotRepository(context, request);
  if (!identity) return [];
  const numbers = new Set();
  if (context.eventName === 'workflow_run') {
    const runId = positive(context.runId);
    const attempt = positive(context.runAttempt);
    if (!runId || !attempt) return [];
    const workflow = await request(
      'GET',
      `${identity.path}/actions/workflows/${verificationPolicy.workflowFile}`,
    );
    const run = await request('GET', `${identity.path}/actions/runs/${runId}`);
    if (
      workflow?.name !== verificationPolicy.workflowName ||
      workflow.path !== verificationPolicy.workflowPath ||
      workflow.state !== 'active' ||
      run?.id !== runId ||
      run.run_attempt !== attempt ||
      run.event !== 'pull_request' ||
      run.status !== 'completed' ||
      run.conclusion !== 'action_required' ||
      run.workflow_id !== workflow.id ||
      run.name !== workflow.name ||
      run.repository?.id !== identity.id ||
      run.head_repository?.id !== identity.id ||
      !Array.isArray(run.pull_requests) ||
      run.pull_requests.length !== 1 ||
      !positive(run.pull_requests[0]?.number)
    )
      return [];
    numbers.add(run.pull_requests[0].number);
  } else {
    for (let page = 1; page <= 5; page++) {
      const pulls = await request(
        'GET',
        `${identity.path}/pulls?state=open&base=${identity.defaultBranch}&per_page=100&page=${page}`,
      );
      if (!Array.isArray(pulls) || pulls.length > 100)
        throw new Error('The authorization inventory is invalid.');
      for (const pull of pulls)
        if (
          positive(pull?.number) &&
          pull.user?.id === 49699333 &&
          pull.user.login === 'dependabot[bot]' &&
          pull.user.type === 'Bot'
        )
          numbers.add(pull.number);
      if (pulls.length < 100) break;
      if (page === 5) throw new Error('The authorization inventory exceeds its bound.');
    }
  }
  const results = [];
  for (const number of [...numbers].slice(0, 30)) {
    try {
      results.push(await authorizePullRequestWorkflow({ ...context, number }, { request }));
    } catch {
      results.push({ number, status: 'blocked', reason: 'approval-request-failed' });
    }
  }
  return results;
}

function positive(value) {
  const number = typeof value === 'string' && /^[1-9]\d*$/u.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
