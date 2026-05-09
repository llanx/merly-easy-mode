import { getConfig } from "./config.js";
import { MerlyAuthError, MerlyHttpError } from "./errors.js";
import path from "node:path";
import {
  inspectGitWorkspace,
  normalizeBranchName,
  normalizeGitUrl,
  normalizeLocalPath,
  normalizeRelativePath,
  prepareGitVisibility,
  prepareMerlyRefVisibility,
} from "./gitWorkspace.js";
import { assessIssueBundle, rankIssues } from "./issueRanking.js";

export class MerlyClient {
  constructor(config = getConfig()) {
    this.config = config;
  }

  async status() {
    return this.request("/status", { auth: false });
  }

  async health() {
    return this.request("/api/v2/health", { auth: false });
  }

  async getCurrentIdentity() {
    return this.request("/api/v2/me");
  }

  async login({ email, password }) {
    if (!email || !password) {
      throw new Error("login requires email and password.");
    }

    return this.request("/api/v2/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    });
  }

  async refreshToken(refresh_token) {
    if (!refresh_token) {
      throw new Error("refreshToken requires refresh_token.");
    }

    return this.request("/api/v2/auth/token", {
      method: "POST",
      auth: false,
      body: { refresh_token },
    });
  }

  async listApiKeys() {
    return this.request("/api/v2/me/api-keys");
  }

  async createApiKey({ name }) {
    if (!name) {
      throw new Error("createApiKey requires name.");
    }

    return this.request("/api/v2/me/api-keys", {
      method: "POST",
      body: { name },
    });
  }

  async listRepositories(options = {}) {
    return this.request("/api/v2/repositories", {
      query: pickQuery(options, ["cursor", "limit", "sort", "filter", "status"]),
    });
  }

  async createRepository({
    name,
    git_url,
    gitUrl,
    description,
    git_branch,
    gitBranch,
    git_remote,
    gitRemote,
    source_root,
    sourceRoot,
    git_root,
    gitRoot,
    run_infer_after_add,
    runInferAfterAdd,
    report_after_infer,
    reportAfterInfer,
    language,
  } = {}) {
    const resolvedGitUrl = git_url || gitUrl;
    if (!name || !resolvedGitUrl) {
      throw new Error("createRepository requires name and git_url.");
    }

    const resolvedGitBranch = git_branch || gitBranch;
    const resolvedSourceRoot = source_root || sourceRoot;
    const resolvedGitRoot = git_root || gitRoot;
    if (usesLegacyRepositoryCreate(resolvedGitUrl)) {
      return this.createRepositoryViaLegacyForm({
        name,
        git_url: resolvedGitUrl,
        description,
        git_branch: resolvedGitBranch,
        git_remote: git_remote || gitRemote,
        source_root: resolvedSourceRoot,
        git_root: resolvedGitRoot,
        run_infer_after_add,
        runInferAfterAdd,
        report_after_infer,
        reportAfterInfer,
        language,
      });
    }

    const body = {
      name,
      git_url: resolvedGitUrl,
    };
    if (description) body.description = description;
    if (resolvedGitBranch) body.git_branch = resolvedGitBranch;
    if (resolvedSourceRoot) body.source_root = resolvedSourceRoot;
    if (resolvedGitRoot) body.git_root = resolvedGitRoot;

    return this.request("/api/v2/repositories", {
      method: "POST",
      body,
    });
  }

  async createRepositoryViaLegacyForm({
    name,
    git_url,
    description,
    git_branch,
    git_remote,
    source_root,
    git_root,
    run_infer_after_add,
    runInferAfterAdd,
    report_after_infer,
    reportAfterInfer,
    language,
  } = {}) {
    const rootTemplate = "${AWD}\\.git-root\\${ID}";
    const fields = {
      name,
      git_url,
      description,
      git_remote: git_remote || "origin",
      git_branch,
      git_root: git_root || rootTemplate,
      source_root: source_root || rootTemplate,
      tab_size: "2",
      language,
    };
    const shouldInfer = run_infer_after_add ?? runInferAfterAdd ?? true;
    const shouldReport = report_after_infer ?? reportAfterInfer ?? shouldInfer;
    if (shouldInfer) fields.run_infer_after_add = "on";
    if (shouldReport) fields.report_after_infer = "on";

    return this.requestForm("/api/r", fields);
  }

  async getRepository(repositoryId) {
    return this.request(`/api/v2/repositories/${encodeURIComponent(repositoryId)}`);
  }

  async listBranches(repositoryId, options = {}) {
    return this.request(`/api/v2/repositories/${encodeURIComponent(repositoryId)}/branches`, {
      query: pickQuery(options, ["cursor", "limit", "sort"]),
    });
  }

  async createBranch(repositoryId, { name } = {}) {
    if (!repositoryId || !name) {
      throw new Error("createBranch requires repository_id and name.");
    }

    return this.request(`/api/v2/repositories/${encodeURIComponent(repositoryId)}/branches`, {
      method: "POST",
      body: { name },
    });
  }

  async getBranch(branchId) {
    return this.request(`/api/v2/branches/${encodeURIComponent(branchId)}`);
  }

  async listBranchRbls(branchId, options = {}) {
    return this.request(`/api/v2/branches/${encodeURIComponent(branchId)}/rbls`, {
      query: pickQuery(options, ["cursor", "limit"]),
    });
  }

  async listRbls(options = {}) {
    return this.request("/api/v2/rbls", {
      query: pickQuery(options, ["cursor", "limit", "sort", "filter", "language", "repository_id"]),
    });
  }

  async getRbl(rblId) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}`);
  }

  async listSnapshots(rblId, options = {}) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/snapshots`, {
      query: pickQuery(options, ["cursor", "limit", "sort", "from_date", "to_date"]),
    });
  }

  async getSnapshot(rblId, snapshotId) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/snapshots/${encodeURIComponent(snapshotId)}`);
  }

  async listSnapshotIssues(rblId, snapshotId, options = {}) {
    return this.request(
      `/api/v2/rbls/${encodeURIComponent(rblId)}/snapshots/${encodeURIComponent(snapshotId)}/issues`,
      {
        query: pickQuery(options, [
          "cursor",
          "limit",
          "sort",
          "severity",
          "status",
          "file_path",
          "assignee_id",
        ]),
      },
    );
  }

  async createSnapshot(rblId, body = { method: "single" }) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/snapshots`, {
      method: "POST",
      body,
    });
  }

  async startSnapshot({ rbl_id, rblId, method = "single", value, ref } = {}) {
    const resolvedRblId = rbl_id || rblId;
    if (!resolvedRblId) {
      throw new Error("startSnapshot requires rbl_id.");
    }

    const body = { method };
    if (value !== undefined) body.value = value;
    if (ref !== undefined) body.ref = ref;

    return {
      rbl_id: resolvedRblId,
      request: body,
      job: await this.createSnapshot(resolvedRblId, body),
    };
  }

  async checkReanalysisReadiness({
    rbl_id,
    rblId,
    workspace_path,
    workspacePath,
    require_clean,
    requireClean,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    if (!resolvedRblId) {
      throw new Error("checkReanalysisReadiness requires rbl_id.");
    }

    const context = await this.getRepoAnalysisContext({ rbl_id: resolvedRblId });
    return buildReanalysisReadiness({
      rblId: resolvedRblId,
      context,
      workspacePath: workspace_path || workspacePath,
      requireClean: require_clean ?? requireClean ?? false,
    });
  }

  async prepareGitVisibility(options = {}) {
    return prepareGitVisibility(options);
  }

  async prepareRefVisibility({
    rbl_id,
    rblId,
    repository_id,
    repositoryId,
    workspace_path,
    workspacePath,
    merly_git_root,
    merlyGitRoot,
    merly_work_dir,
    merlyWorkDir,
    ref,
    source_ref,
    sourceRef,
    target_ref,
    targetRef,
    fetch = false,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedRepositoryId = repository_id || repositoryId;
    let context = null;
    let repository = null;

    if (resolvedRblId || resolvedRepositoryId) {
      context = await this.getRepoAnalysisContext({
        rbl_id: resolvedRblId,
        repository_id: resolvedRepositoryId,
      });
      repository = context.repository;
    }

    if (!repository && !(merly_git_root || merlyGitRoot)) {
      throw new Error("prepareRefVisibility requires rbl_id, repository_id, or merly_git_root.");
    }

    const health = merly_work_dir || merlyWorkDir || this.config.merlyWorkDir ? null : await this.health().catch(() => null);
    const resolvedMerlyWorkDir =
      merly_work_dir || merlyWorkDir || this.config.merlyWorkDir || inferMerlyWorkDirFromHealth(health);

    return {
      rbl_id: resolvedRblId || context?.rbl?.id || null,
      repository_id: resolvedRepositoryId || repository?.id || null,
      analysis_context: context ? summarizeAnalysisContext(context) : null,
      ...(await prepareMerlyRefVisibility({
        workspacePath: workspace_path || workspacePath,
        repository,
        merlyGitRoot: merly_git_root || merlyGitRoot,
        merlyWorkDir: resolvedMerlyWorkDir,
        ref,
        sourceRef: source_ref || sourceRef,
        targetRef: target_ref || targetRef,
        fetch,
      })),
    };
  }

  async listIssues(rblId, options = {}) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/issues`, {
      query: pickQuery(options, ["cursor", "limit", "sort", "severity", "status", "file_path", "assignee_id"]),
    });
  }

  async getIssue(rblId, issueId) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/issues/${encodeURIComponent(issueId)}`);
  }

  async getIssueInsights(rblId, issueId) {
    return this.request(
      `/api/v2/rbls/${encodeURIComponent(rblId)}/issues/${encodeURIComponent(issueId)}/expression-insights`,
    );
  }

  async listFiles(rblId, options = {}) {
    return this.request(`/api/v2/rbls/${encodeURIComponent(rblId)}/files`, {
      query: pickQuery(options, ["cursor", "limit", "sort", "file_path", "extension"]),
    });
  }

  async verifySnippet({ language, code, response_mode = "script", sensitivity = 0 }) {
    return this.request("/api/v2/dif/verify", {
      method: "POST",
      auth: "dif",
      body: {
        language,
        code,
        response_mode,
        sensitivity,
      },
    });
  }

  async getJobStatus(jobKey) {
    return this.request(`/api/v2/jobs/${encodeURIComponent(jobKey)}`);
  }

  async pollJob({ job_key, jobKey, timeout_ms, timeoutMs, poll_interval_ms, pollIntervalMs } = {}) {
    const resolvedJobKey = job_key || jobKey;
    if (!resolvedJobKey) {
      throw new Error("pollJob requires job_key.");
    }

    const startedAt = Date.now();
    const timeout = clampInteger(timeout_ms || timeoutMs, 1000, 3600000, 300000);
    const pollInterval = clampInteger(poll_interval_ms || pollIntervalMs, 250, 30000, 5000);
    const attempts = [];
    const errors = [];
    const pollResult = await this.pollJobUntilTerminal(resolvedJobKey, {
      startedAt,
      timeout,
      pollInterval,
      attempts,
      errors,
    });

    return {
      job_key: resolvedJobKey,
      wait_status: pollResult.waitStatus,
      timed_out: pollResult.waitStatus === "timeout",
      elapsed_ms: Date.now() - startedAt,
      timeout_ms: timeout,
      poll_interval_ms: pollInterval,
      attempts,
      errors,
      job_status: pollResult.jobStatus,
    };
  }

  async getFixCandidates({
    rbl_id,
    rblId,
    limit = 20,
    fetch_limit,
    fetchLimit,
    status = "open",
    severity,
    sort,
    include_path_prefixes,
    includePathPrefixes,
    exclude_path_prefixes,
    excludePathPrefixes,
    workspace_path,
    workspacePath,
    avoid_dirty_files,
    avoidDirtyFiles,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    if (!resolvedRblId) {
      throw new Error("getFixCandidates requires rbl_id.");
    }

    const outputLimit = clampInteger(limit, 1, 100, 20);
    const scanLimit = clampInteger(fetch_limit || fetchLimit || Math.max(outputLimit, 50), outputLimit, 1000, 50);
    const filterContext = await buildIssueFilterContext({
      include_path_prefixes: include_path_prefixes || includePathPrefixes,
      exclude_path_prefixes: exclude_path_prefixes || excludePathPrefixes,
      workspace_path: workspace_path || workspacePath,
      avoid_dirty_files: avoid_dirty_files ?? avoidDirtyFiles,
    });
    const response = await this.collectIssues(resolvedRblId, {
      scan_limit: scanLimit,
      status,
      severity,
      sort,
    });

    const issues = Array.isArray(response?.data) ? response.data : [];
    const uniqueIssues = dedupeIssues(issues);
    const filteredIssues = applyIssueFilters(uniqueIssues, filterContext);
    const rankedIssues = rankIssues(filteredIssues.issues);
    return {
      rbl_id: resolvedRblId,
      filter_policy: filterContext.policy,
      candidates: rankedIssues.slice(0, outputLimit),
      scanned_count: issues.length,
      unique_count: uniqueIssues.length,
      matched_count: filteredIssues.issues.length,
      skipped_by_filter: summarizeFilterSkips(filteredIssues.skipped),
      pages_scanned: response?.pages_scanned || 0,
      pagination: response?.pagination || null,
    };
  }

  async collectIssues(rblId, { scan_limit, status, severity, sort } = {}) {
    const scanLimit = clampInteger(scan_limit, 1, 1000, 50);
    const issues = [];
    let cursor;
    let pagination = null;
    let pagesScanned = 0;

    while (issues.length < scanLimit) {
      const pageLimit = Math.min(100, scanLimit - issues.length);
      const response = await this.listIssues(rblId, {
        cursor,
        limit: pageLimit,
        status,
        severity,
        sort,
      });
      const pageIssues = Array.isArray(response?.data) ? response.data : [];
      issues.push(...pageIssues);
      pagination = response?.pagination || null;
      pagesScanned += 1;

      cursor = pagination?.next_cursor || null;
      if (!cursor || pageIssues.length === 0) break;
    }

    return {
      data: issues,
      pages_scanned: pagesScanned,
      pagination: pagination
        ? {
            ...pagination,
            scanned_limit: scanLimit,
            next_cursor: cursor || pagination.next_cursor || null,
            has_more: Boolean(cursor || pagination.has_more),
          }
        : null,
    };
  }

  async planBatchFixes({
    rbl_id,
    rblId,
    max_batch_size,
    maxBatchSize,
    fetch_limit,
    fetchLimit,
    status = "open",
    severity,
    sort,
    readiness,
    exclude_issue_ids,
    excludeIssueIds,
    include_path_prefixes,
    includePathPrefixes,
    exclude_path_prefixes,
    excludePathPrefixes,
    workspace_path,
    workspacePath,
    avoid_dirty_files,
    avoidDirtyFiles,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    if (!resolvedRblId) {
      throw new Error("planBatchFixes requires rbl_id.");
    }

    const maxBatchSizeValue = clampInteger(max_batch_size || maxBatchSize, 1, 5, 3);
    const scanLimit = clampInteger(fetch_limit || fetchLimit || Math.max(maxBatchSizeValue * 20, 50), 1, 1000, 50);
    const allowedReadiness = normalizeStringList(readiness);
    const readinessAllowList = allowedReadiness.length > 0 ? allowedReadiness : ["candidate"];
    const excludedIssueIds = new Set(normalizeStringList(exclude_issue_ids || excludeIssueIds));
    const filterContext = await buildIssueFilterContext({
      include_path_prefixes: include_path_prefixes || includePathPrefixes,
      exclude_path_prefixes: exclude_path_prefixes || excludePathPrefixes,
      workspace_path: workspace_path || workspacePath,
      avoid_dirty_files: avoid_dirty_files ?? avoidDirtyFiles,
    });
    const response = await this.collectIssues(resolvedRblId, {
      scan_limit: scanLimit,
      status,
      severity,
      sort,
    });
    const rawIssues = Array.isArray(response?.data) ? response.data : [];
    const uniqueIssues = dedupeIssues(rawIssues);
    const filteredIssues = applyIssueFilters(uniqueIssues, filterContext);
    const rankedIssues = rankIssues(filteredIssues.issues);
    const selected = [];
    const skipped = filteredIssues.skipped.map((entry) => ({
      ...summarizeBatchCandidate(entry.issue),
      skip_reasons: entry.reasons,
    }));

    for (const issue of rankedIssues) {
      const decision = assessBatchCandidate(issue, {
        readinessAllowList,
        excludedIssueIds,
      });

      if (decision.selected && selected.length < maxBatchSizeValue) {
        selected.push({
          ...summarizeBatchCandidate(issue),
          batch_position: selected.length + 1,
          selection_reasons: decision.reasons,
        });
      } else {
        skipped.push({
          ...summarizeBatchCandidate(issue),
          skip_reasons: decision.reasons,
        });
      }
    }

    return {
      rbl_id: resolvedRblId,
      batch_policy: {
        max_batch_size: maxBatchSizeValue,
        strict_max_batch_size: true,
        stop_on_failure: true,
        continue_field: "repair_outcome.should_continue_batch",
        allowed_readiness: readinessAllowList,
        filters: filterContext.policy,
        per_issue_validation_required: true,
        repository_reanalysis_required: true,
        commit_each_successful_repair: true,
      },
      selected_count: selected.length,
      selected_candidates: selected,
      skipped_count: skipped.length,
      skipped_candidates: skipped.slice(0, 25),
      scanned_count: rawIssues.length,
      unique_count: uniqueIssues.length,
      matched_count: rankedIssues.length,
      pages_scanned: response?.pages_scanned || 0,
      pagination: response?.pagination || null,
      next_action:
        selected.length > 0
          ? "Repair selected_candidates[0] only, validate it, reanalyze it, then call merly_assess_batch_progress before continuing."
          : "No batch-safe candidates found with the current filters.",
    };
  }

  assessBatchProgress({ planned_issue_ids, plannedIssueIds, outcomes = [], max_batch_size, maxBatchSize } = {}) {
    const plannedIds = normalizeStringList(planned_issue_ids || plannedIssueIds);
    const maxBatchSizeValue = clampInteger(max_batch_size || maxBatchSize || plannedIds.length || 3, 1, 5, 3);
    const plannedWithinLimit = plannedIds.slice(0, maxBatchSizeValue);
    const normalizedOutcomes = outcomes.map(normalizeBatchOutcome);
    const completedIssueIds = new Set(normalizedOutcomes.map((outcome) => outcome.issue_id).filter(Boolean));
    const stoppedBy = normalizedOutcomes.find((outcome) => outcome.should_continue_batch === false) || null;
    const nextIssueId = stoppedBy
      ? null
      : plannedWithinLimit.find((issueId) => !completedIssueIds.has(String(issueId))) || null;

    return {
      batch_policy: {
        max_batch_size: maxBatchSizeValue,
        strict_max_batch_size: true,
        stop_on_failure: true,
        continue_field: "repair_outcome.should_continue_batch",
      },
      planned_issue_ids: plannedWithinLimit,
      completed_count: normalizedOutcomes.length,
      outcome_counts: countBatchOutcomes(normalizedOutcomes),
      outcomes: normalizedOutcomes,
      should_continue: !stoppedBy && Boolean(nextIssueId),
      stop_reason: stoppedBy ? `repair_outcome for ${stoppedBy.issue_id || "unknown issue"} stopped the batch` : null,
      next_issue_id: nextIssueId,
      summary: summarizeBatchProgress({ stoppedBy, nextIssueId, normalizedOutcomes }),
    };
  }

  async resolveWorkspace({ workspace_path, language } = {}) {
    const workspace = await inspectGitWorkspace(workspace_path);
    const repositories = await this.listRepositories({ limit: 100, status: "active" });
    const repositoryMatches = (repositories?.data || [])
      .map((repository) => ({
        repository,
        score: scoreRepositoryMatch(workspace, repository),
      }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score);

    const repository = repositoryMatches[0]?.repository || null;
    if (!repository) {
      return {
        workspace,
        repository: null,
        branch: null,
        rbl: null,
        confidence: "none",
        candidate_repositories: [],
      };
    }

    const branches = await this.listBranches(repository.id, { limit: 100 });
    const branch = chooseBranch(branches?.data || [], workspace.branch);
    const rbls = branch ? await this.listBranchRbls(branch.id, { limit: 100 }) : null;
    const rbl = chooseRbl(rbls?.data || [], language);

    return {
      workspace,
      repository,
      branch,
      rbl,
      confidence: confidence(repositoryMatches[0].score, branch, rbl),
      candidates: {
        repositories: repositoryMatches.slice(0, 5).map((match) => ({
          id: match.repository.id,
          name: match.repository.name,
          git_url: match.repository.git_url,
          source_root: match.repository.source_root,
          score: match.score,
        })),
        branches: branches?.data || [],
        rbls: rbls?.data || [],
      },
    };
  }

  async getRepoAnalysisContext({ repository_id, repositoryId, branch_id, branchId, rbl_id, rblId, language } = {}) {
    let repositoryIdValue = repository_id || repositoryId;
    let branchIdValue = branch_id || branchId;
    let rblIdValue = rbl_id || rblId;

    let rbl = rblIdValue ? await this.getRbl(rblIdValue) : null;
    if (rbl) {
      repositoryIdValue ||= rbl.repository_id;
      branchIdValue ||= rbl.branch_id;
    }

    if (!repositoryIdValue) {
      throw new Error("getRepoAnalysisContext requires repository_id or rbl_id.");
    }

    const repository = await this.getRepository(repositoryIdValue);

    let branch = null;
    if (branchIdValue) {
      branch = await this.getBranch(branchIdValue);
    } else {
      const branches = await this.listBranches(repositoryIdValue, { limit: 100 });
      branch = chooseBranch(branches?.data || [], repository.default_branch);
    }

    if (!rbl && branch) {
      const rbls = await this.listBranchRbls(branch.id, { limit: 100 });
      rbl = chooseRbl(rbls?.data || [], language);
    }

    const snapshots = rbl ? await this.listSnapshots(rbl.id, { limit: 1, sort: "-id" }) : null;

    return {
      repository,
      branch,
      rbl,
      latest_snapshot: snapshots?.data?.[0] || null,
    };
  }

  async getIssueBundle({ rbl_id, rblId, issue_id, issueId }) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedIssueId) {
      throw new Error("getIssueBundle requires rbl_id and issue_id.");
    }

    const issue = await this.getIssue(resolvedRblId, resolvedIssueId);
    let insights = [];
    let insightJob = null;

    try {
      const result = await this.getIssueInsights(resolvedRblId, resolvedIssueId);
      if (Array.isArray(result)) {
        insights = result.map(simplifyInsight);
      } else if (result?.job_key) {
        insightJob = result;
      }
    } catch (error) {
      insights = [{ error: error.message }];
    }

    return {
      rbl_id: resolvedRblId,
      issue_id: resolvedIssueId,
      issue,
      insights,
      insight_job: insightJob,
      repair_readiness: assessIssueBundle(issue, { insights, insightJob }),
    };
  }

  async waitForIssueInsights({
    rbl_id,
    rblId,
    issue_id,
    issueId,
    timeout_ms,
    timeoutMs,
    poll_interval_ms,
    pollIntervalMs,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedIssueId) {
      throw new Error("waitForIssueInsights requires rbl_id and issue_id.");
    }

    const issue = await this.getIssue(resolvedRblId, resolvedIssueId);
    const startedAt = Date.now();
    const timeout = clampInteger(timeout_ms || timeoutMs, 1000, 300000, 30000);
    const pollInterval = clampInteger(poll_interval_ms || pollIntervalMs, 250, 10000, 2000);
    const attempts = [];
    const errors = [];
    let insightJob = null;
    let jobStatus = null;

    while (true) {
      if (Date.now() - startedAt >= timeout) {
        return buildInsightWaitResult({
          rblId: resolvedRblId,
          issueId: resolvedIssueId,
          issue,
          waitStatus: "timeout",
          insights: [],
          insightJob: jobStatus || insightJob,
          jobStatus,
          attempts,
          errors,
          startedAt,
          timeout,
          pollInterval,
        });
      }

      try {
        const result = await this.getIssueInsights(resolvedRblId, resolvedIssueId);
        if (Array.isArray(result)) {
          const insights = result.map(simplifyInsight);
          return buildInsightWaitResult({
            rblId: resolvedRblId,
            issueId: resolvedIssueId,
            issue,
            waitStatus: "completed",
            insights,
            insightJob: null,
            jobStatus,
            attempts,
            errors,
            startedAt,
            timeout,
            pollInterval,
          });
        }

        if (result?.job_key) {
          insightJob = result;
          attempts.push({
            type: "insight_endpoint",
            status: result.status || "pending",
            job_key: result.job_key,
            elapsed_ms: Date.now() - startedAt,
          });

          const pollResult = await this.pollJobUntilTerminal(result.job_key, {
            startedAt,
            timeout,
            pollInterval,
            attempts,
            errors,
          });
          jobStatus = pollResult.jobStatus;

          if (pollResult.waitStatus === "timeout") {
            return buildInsightWaitResult({
              rblId: resolvedRblId,
              issueId: resolvedIssueId,
              issue,
              waitStatus: "timeout",
              insights: [],
              insightJob: jobStatus || insightJob,
              jobStatus,
              attempts,
              errors,
              startedAt,
              timeout,
              pollInterval,
            });
          }

          if (pollResult.waitStatus === "error") {
            return buildInsightWaitResult({
              rblId: resolvedRblId,
              issueId: resolvedIssueId,
              issue,
              waitStatus: "error",
              insights: [{ error: "Insight job polling failed." }],
              insightJob: jobStatus || insightJob,
              jobStatus,
              attempts,
              errors,
              startedAt,
              timeout,
              pollInterval,
            });
          }

          if (isFailedJobStatus(jobStatus?.status)) {
            return buildInsightWaitResult({
              rblId: resolvedRblId,
              issueId: resolvedIssueId,
              issue,
              waitStatus: jobStatus.status,
              insights: [{ error: jobStatus.error_message || `Insight job ${jobStatus.status}.` }],
              insightJob: jobStatus,
              jobStatus,
              attempts,
              errors,
              startedAt,
              timeout,
              pollInterval,
            });
          }

          continue;
        }

        errors.push({
          message: "Insight endpoint returned an unexpected payload.",
          elapsed_ms: Date.now() - startedAt,
        });
      } catch (error) {
        const summarizedError = summarizeError(error);
        summarizedError.elapsed_ms = Date.now() - startedAt;
        errors.push(summarizedError);
        if (!isRetryableInsightError(error)) {
          return buildInsightWaitResult({
            rblId: resolvedRblId,
            issueId: resolvedIssueId,
            issue,
            waitStatus: "error",
            insights: [{ error: error.message }],
            insightJob,
            jobStatus,
            attempts,
            errors,
            startedAt,
            timeout,
            pollInterval,
          });
        }
      }

      await sleep(Math.min(pollInterval, Math.max(0, startedAt + timeout - Date.now())));
    }
  }

  async pollJobUntilTerminal(jobKey, { startedAt, timeout, pollInterval, attempts, errors }) {
    let jobStatus = null;
    while (Date.now() - startedAt < timeout) {
      try {
        jobStatus = await this.getJobStatus(jobKey);
        attempts.push({
          type: "job_status",
          status: jobStatus?.status || "unknown",
          job_key: jobKey,
          progress: jobStatus?.progress,
          elapsed_ms: Date.now() - startedAt,
        });

        if (isTerminalJobStatus(jobStatus?.status)) {
          return { waitStatus: jobStatus.status, jobStatus };
        }
      } catch (error) {
        const summarizedError = summarizeError(error);
        summarizedError.elapsed_ms = Date.now() - startedAt;
        summarizedError.job_key = jobKey;
        errors.push(summarizedError);
        if (!isRetryableInsightError(error)) {
          return { waitStatus: "error", jobStatus };
        }
      }

      await sleep(Math.min(pollInterval, Math.max(0, startedAt + timeout - Date.now())));
    }

    return { waitStatus: "timeout", jobStatus };
  }

  async compareIssueState({ rbl_id, rblId, issue_id, issueId, before_issue, beforeIssue } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedIssueId) {
      throw new Error("compareIssueState requires rbl_id and issue_id.");
    }

    const before = before_issue || beforeIssue || (await this.getIssueOrNull(resolvedRblId, resolvedIssueId));
    const after = await this.getIssueOrNull(resolvedRblId, resolvedIssueId);
    return buildIssueComparison({ rblId: resolvedRblId, issueId: resolvedIssueId, before, after });
  }

  async findIssueInSnapshot({
    rbl_id,
    rblId,
    snapshot_id,
    snapshotId,
    issue_id,
    issueId,
    before_issue,
    beforeIssue,
    limit,
    max_pages,
    maxPages,
    status,
    severity,
    file_path,
    filePath,
    sort,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedSnapshotId = snapshot_id || snapshotId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedSnapshotId || !resolvedIssueId) {
      throw new Error("findIssueInSnapshot requires rbl_id, snapshot_id, and issue_id.");
    }

    const before = before_issue || beforeIssue || (await this.getIssueOrNull(resolvedRblId, resolvedIssueId));
    const pageLimit = clampInteger(limit, 1, 100, 100);
    const pageCountLimit = clampInteger(max_pages || maxPages, 1, 20, 5);
    const queryFilePath = file_path || filePath || before?.file_path;
    const pages = [];
    const nearMatches = [];
    let cursor = undefined;
    let found = null;
    let scannedCount = 0;

    for (let pageIndex = 0; pageIndex < pageCountLimit; pageIndex += 1) {
      const response = await this.listSnapshotIssues(resolvedRblId, resolvedSnapshotId, {
        cursor,
        limit: pageLimit,
        sort,
        severity,
        status,
        file_path: queryFilePath,
      });
      const issues = Array.isArray(response?.data) ? response.data : [];
      scannedCount += issues.length;
      pages.push({
        index: pageIndex + 1,
        count: issues.length,
        has_more: Boolean(response?.pagination?.has_more),
        next_cursor: response?.pagination?.next_cursor || null,
      });

      found = issues.find((issue) => String(issue.id) === String(resolvedIssueId)) || null;
      collectNearIssueMatches(nearMatches, issues, before, resolvedIssueId);
      if (found) break;

      cursor = response?.pagination?.next_cursor;
      if (!response?.pagination?.has_more || !cursor) break;
    }

    return {
      rbl_id: resolvedRblId,
      snapshot_id: resolvedSnapshotId,
      issue_id: resolvedIssueId,
      filters: {
        limit: pageLimit,
        max_pages: pageCountLimit,
        status: status || null,
        severity: severity || null,
        file_path: queryFilePath || null,
        sort: sort || null,
      },
      scanned_count: scannedCount,
      pages,
      issue: found,
      near_matches: nearMatches.slice(0, 5),
    };
  }

  async compareIssueAtSnapshot({
    rbl_id,
    rblId,
    snapshot_id,
    snapshotId,
    issue_id,
    issueId,
    before_issue,
    beforeIssue,
    limit,
    max_pages,
    maxPages,
    status,
    severity,
    file_path,
    filePath,
    sort,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedSnapshotId = snapshot_id || snapshotId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedSnapshotId || !resolvedIssueId) {
      throw new Error("compareIssueAtSnapshot requires rbl_id, snapshot_id, and issue_id.");
    }

    const before = before_issue || beforeIssue || (await this.getIssueOrNull(resolvedRblId, resolvedIssueId));
    const snapshot = await this.getSnapshot(resolvedRblId, resolvedSnapshotId).catch((error) => {
      if (Number(error?.details?.status) === 404) return null;
      throw error;
    });
    const lookup = await this.findIssueInSnapshot({
      rbl_id: resolvedRblId,
      snapshot_id: resolvedSnapshotId,
      issue_id: resolvedIssueId,
      before_issue: before,
      limit,
      max_pages,
      maxPages,
      status,
      severity,
      file_path,
      filePath,
      sort,
    });
    const comparison = buildIssueComparison({
      rblId: resolvedRblId,
      issueId: resolvedIssueId,
      before,
      after: lookup.issue,
    });

    return {
      rbl_id: resolvedRblId,
      snapshot: summarizeSnapshot(snapshot) || { id: resolvedSnapshotId },
      issue_id: resolvedIssueId,
      lookup,
      comparison,
      repair_outcome: comparison.repair_outcome,
    };
  }

  async reanalyzeAndCompareIssue({
    rbl_id,
    rblId,
    issue_id,
    issueId,
    method = "single",
    value,
    ref,
    timeout_ms,
    timeoutMs,
    poll_interval_ms,
    pollIntervalMs,
    workspace_path,
    workspacePath,
    require_clean,
    requireClean,
  } = {}) {
    const resolvedRblId = rbl_id || rblId;
    const resolvedIssueId = issue_id || issueId;
    if (!resolvedRblId || !resolvedIssueId) {
      throw new Error("reanalyzeAndCompareIssue requires rbl_id and issue_id.");
    }

    const beforeIssue = await this.getIssueOrNull(resolvedRblId, resolvedIssueId);
    const beforeContext = await this.getRepoAnalysisContext({ rbl_id: resolvedRblId });
    const beforeSnapshots = await this.listSnapshots(resolvedRblId, { limit: 10, sort: "-id" }).catch(() => null);
    const readiness = await buildReanalysisReadiness({
      rblId: resolvedRblId,
      context: beforeContext,
      workspacePath: workspace_path || workspacePath,
      requireClean: require_clean ?? requireClean ?? false,
    });

    if (!readiness.can_reanalyze) {
      return {
        rbl_id: resolvedRblId,
        issue_id: resolvedIssueId,
        skipped: true,
        skip_reason: "reanalysis_readiness_failed",
        readiness,
        snapshot_start: null,
        poll: null,
        before_context: summarizeAnalysisContext(beforeContext),
        after_context: null,
        comparison: buildIssueComparison({
          rblId: resolvedRblId,
          issueId: resolvedIssueId,
          before: beforeIssue,
          after: null,
          analysisCompleted: false,
        }),
      };
    }

    const snapshotStart = await this.startSnapshot({ rbl_id: resolvedRblId, method, value, ref });
    const jobKey = snapshotStart?.job?.job_key;
    let poll = null;
    if (jobKey) {
      poll = await this.pollJob({
        job_key: jobKey,
        timeout_ms,
        timeoutMs,
        poll_interval_ms,
        pollIntervalMs,
      });
    }

    const afterContext = await this.getRepoAnalysisContext({ rbl_id: resolvedRblId });
    const afterSnapshots = poll?.wait_status === "completed"
      ? await this.listSnapshots(resolvedRblId, { limit: 10, sort: "-id" }).catch(() => null)
      : null;
    const afterIssue = poll?.wait_status === "completed"
      ? await this.getIssueOrNull(resolvedRblId, resolvedIssueId)
      : null;
    const snapshotSelection = selectComparisonSnapshot(beforeSnapshots, afterSnapshots);
    const snapshotComparison = snapshotSelection.selected_snapshot && poll?.wait_status === "completed"
      ? await this.compareIssueAtSnapshot({
          rbl_id: resolvedRblId,
          snapshot_id: snapshotSelection.selected_snapshot.id,
          issue_id: resolvedIssueId,
          before_issue: beforeIssue,
          limit: 100,
          max_pages: 5,
        }).catch((error) => ({
          error: summarizeError(error),
          comparison: null,
        }))
      : null;
    const latestEndpointComparison = buildIssueComparison({
      rblId: resolvedRblId,
      issueId: resolvedIssueId,
      before: beforeIssue,
      after: afterIssue,
      analysisCompleted: poll?.wait_status === "completed",
    });
    const preferredComparison = snapshotComparison?.comparison || latestEndpointComparison;

    return {
      rbl_id: resolvedRblId,
      issue_id: resolvedIssueId,
      skipped: false,
      readiness,
      snapshot_start: snapshotStart,
      poll,
      before_context: summarizeAnalysisContext(beforeContext),
      after_context: summarizeAnalysisContext(afterContext),
      snapshot_selection: snapshotSelection,
      latest_endpoint_comparison: latestEndpointComparison,
      snapshot_comparison: snapshotComparison,
      comparison_strategy: snapshotComparison?.comparison ? "snapshot" : "latest_endpoint",
      comparison: preferredComparison,
      repair_outcome: preferredComparison.repair_outcome,
    };
  }

  async getIssueOrNull(rblId, issueId) {
    try {
      return await this.getIssue(rblId, issueId);
    } catch (error) {
      if (Number(error?.details?.status) === 404) return null;
      throw error;
    }
  }

  async request(path, options = {}) {
    const method = options.method || "GET";
    const auth = options.auth === undefined ? true : options.auth;
    const headers = {
      Accept: "application/json",
      ...this.authHeaders(auth),
      ...(options.headers || {}),
    };

    let body;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }

    const url = this.url(path, options.query);
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    const text = await response.text();
    const parsed = parseBody(text);

    if (!response.ok) {
      throw new MerlyHttpError(`${method} ${path} failed with HTTP ${response.status}`, {
        method,
        path,
        status: response.status,
        statusText: response.statusText,
        body: truncate(text, 1200),
      });
    }

    return parsed;
  }

  async requestForm(path, fields, options = {}) {
    const method = options.method || "POST";
    const auth = options.auth === undefined ? true : options.auth;
    const headers = {
      Accept: "application/json",
      ...this.authHeaders(auth),
      ...(options.headers || {}),
    };
    const body = new FormData();
    for (const [key, value] of Object.entries(fields || {})) {
      if (value !== undefined && value !== null && value !== "") {
        body.append(key, String(value));
      }
    }

    const url = this.url(path, options.query);
    const response = await fetch(url, {
      method,
      headers,
      body,
    });
    const text = await response.text();
    const parsed = parseBody(text);

    if (!response.ok) {
      throw new MerlyHttpError(`${method} ${path} failed with HTTP ${response.status}`, {
        method,
        path,
        status: response.status,
        statusText: response.statusText,
        body: truncate(text, 1200),
      });
    }

    return parsed;
  }

  url(path, query) {
    const url = new URL(`${this.config.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  authHeaders(required) {
    if (required === false) return {};
    if (required === "dif" && this.config.difApiKey) return { "X-API-Key": this.config.difApiKey };
    if (this.config.apiKey) return { "X-API-Key": this.config.apiKey };
    if (this.config.bearerToken) return { Authorization: `Bearer ${this.config.bearerToken}` };

    throw new MerlyAuthError(
      "Merly API credentials are required. Set MERLY_API_KEY or MERLY_BEARER_TOKEN before calling protected endpoints.",
    );
  }
}

function scoreRepositoryMatch(workspace, repository) {
  let score = 0;
  const repositoryRemote = normalizeGitUrl(repository.git_url);
  if (repositoryRemote && workspace.normalized_remote && repositoryRemote === workspace.normalized_remote) {
    score += 100;
  }

  const workspaceRoot = normalizeLocalPath(workspace.root);
  const repositoryLocalPath = normalizeRepositoryLocalPath(repository.git_url);
  const sourceRoot = normalizeLocalPath(repository.source_root);
  const gitRoot = normalizeLocalPath(repository.git_root);

  if (repositoryLocalPath && repositoryLocalPath === workspaceRoot) score += 90;
  if (sourceRoot && sourceRoot === workspaceRoot) score += 80;
  if (gitRoot && gitRoot === `${workspaceRoot}/.git`) score += 60;

  return score;
}

function normalizeRepositoryLocalPath(value) {
  if (!isLocalPathLike(value)) return "";
  return normalizeLocalPath(value);
}

function isLocalPathLike(value) {
  const text = String(value || "").trim();
  return Boolean(text && (/^[a-z]:[\\/]/i.test(text) || text.startsWith("/") || text.startsWith("\\\\")));
}

function usesLegacyRepositoryCreate(value) {
  if (isLocalPathLike(value)) return true;
  try {
    return new URL(value).protocol !== "https:";
  } catch {
    return true;
  }
}

function chooseBranch(branches, branchName) {
  const normalized = normalizeBranchName(branchName);
  return (
    branches.find((branch) => normalizeBranchName(branch.name) === normalized) ||
    branches.find((branch) => branch.is_default) ||
    branches[0] ||
    null
  );
}

function chooseRbl(rbls, language) {
  if (language) {
    const normalized = String(language).toLowerCase();
    const match = rbls.find((rbl) => String(rbl.language || "").toLowerCase() === normalized);
    if (match) return match;
  }

  return rbls.find((rbl) => rbl.status === "active") || rbls[0] || null;
}

function confidence(repositoryScore, branch, rbl) {
  if (repositoryScore >= 100 && branch && rbl) return "high";
  if (repositoryScore >= 80 && branch && rbl) return "medium";
  if (repositoryScore > 0) return "low";
  return "none";
}

function pickQuery(source, keys) {
  const result = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

function buildInsightWaitResult({
  rblId,
  issueId,
  issue,
  waitStatus,
  insights,
  insightJob,
  jobStatus,
  attempts,
  errors,
  startedAt,
  timeout,
  pollInterval,
}) {
  return {
    rbl_id: rblId,
    issue_id: issueId,
    wait_status: waitStatus,
    timed_out: waitStatus === "timeout",
    elapsed_ms: Date.now() - startedAt,
    timeout_ms: timeout,
    poll_interval_ms: pollInterval,
    attempts,
    errors,
    issue,
    insights,
    insight_job: insightJob,
    job_status: jobStatus,
    repair_readiness: assessIssueBundle(issue, { insights, insightJob }),
  };
}

function isTerminalJobStatus(status) {
  return ["completed", "failed", "canceled"].includes(String(status || "").toLowerCase());
}

function isFailedJobStatus(status) {
  return ["failed", "canceled"].includes(String(status || "").toLowerCase());
}

function isRetryableInsightError(error) {
  const status = Number(error?.details?.status);
  return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500;
}

function summarizeError(error) {
  return {
    name: error?.name || "Error",
    message: error?.message || String(error),
    status: error?.details?.status,
    path: error?.details?.path,
  };
}

function sleep(milliseconds) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function buildIssueFilterContext({
  include_path_prefixes,
  exclude_path_prefixes,
  workspace_path,
  avoid_dirty_files,
} = {}) {
  const includePathPrefixes = normalizePathPrefixes(include_path_prefixes);
  const excludePathPrefixes = normalizePathPrefixes(exclude_path_prefixes);
  const avoidDirtyFiles = Boolean(avoid_dirty_files);
  const warnings = [];
  let workspace = null;
  let dirtyFiles = new Set();

  if (avoidDirtyFiles) {
    if (!workspace_path) {
      warnings.push("avoid_dirty_files was requested without workspace_path; dirty file filtering is disabled.");
    } else {
      try {
        workspace = await inspectGitWorkspace(workspace_path, {
          includeStatus: true,
          maxStatusEntries: Number.MAX_SAFE_INTEGER,
        });
        dirtyFiles = collectDirtyFiles(workspace.status?.entries || []);
      } catch (error) {
        warnings.push(`Could not inspect git status for dirty file filtering: ${error.message}`);
      }
    }
  }

  return {
    includePathPrefixes,
    excludePathPrefixes,
    dirtyFiles,
    policy: {
      include_path_prefixes: includePathPrefixes,
      exclude_path_prefixes: excludePathPrefixes,
      workspace_path: workspace?.root || workspace_path || null,
      avoid_dirty_files: avoidDirtyFiles,
      dirty_file_count: dirtyFiles.size,
      warnings,
    },
  };
}

function applyIssueFilters(issues, context) {
  const kept = [];
  const skipped = [];

  for (const issue of issues || []) {
    const reasons = getIssueFilterReasons(issue, context);
    if (reasons.length > 0) {
      skipped.push({ issue, reasons });
    } else {
      kept.push(issue);
    }
  }

  return { issues: kept, skipped };
}

function dedupeIssues(issues) {
  const seen = new Set();
  const unique = [];

  for (const issue of issues || []) {
    const key = issueIdentityKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

function issueIdentityKey(issue) {
  const id = String(issue?.id || "").trim();
  if (id) return `id:${id}`;

  return [
    "fallback",
    normalizeIssuePath(issue?.file_path),
    String(issue?.file_line ?? ""),
    String(issue?.file_column ?? ""),
    String(issue?.snippet || "").trim(),
  ].join("|");
}

function getIssueFilterReasons(issue, context) {
  const reasons = [];
  const issuePath = normalizeIssuePath(issue?.file_path);

  if (!issuePath) {
    reasons.push("missing file path");
    return reasons;
  }

  if (
    context.includePathPrefixes.length > 0 &&
    !context.includePathPrefixes.some((prefix) => pathMatchesPrefix(issuePath, prefix))
  ) {
    reasons.push("file path is outside include prefixes");
  }

  const excludedPrefix = context.excludePathPrefixes.find((prefix) => pathMatchesPrefix(issuePath, prefix));
  if (excludedPrefix) {
    reasons.push(`file path matches excluded prefix ${excludedPrefix}`);
  }

  if (context.dirtyFiles.has(issuePath)) {
    reasons.push("file has local git changes");
  }

  return reasons;
}

function summarizeFilterSkips(skipped) {
  const counts = {};
  for (const entry of skipped || []) {
    for (const reason of entry.reasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }

  return {
    total: skipped?.length || 0,
    counts,
    examples: (skipped || []).slice(0, 10).map((entry) => ({
      id: entry.issue?.id,
      file_path: entry.issue?.file_path,
      file_line: entry.issue?.file_line,
      reasons: entry.reasons,
    })),
  };
}

function normalizePathPrefixes(value) {
  return normalizeStringList(value)
    .map((item) => normalizePathPrefix(item))
    .filter(Boolean);
}

function normalizePathPrefix(value) {
  return normalizeIssuePath(value)
    .replace(/\/\*\*?$/u, "")
    .replace(/\/+$/u, "");
}

function normalizeIssuePath(value) {
  return normalizeRelativePath(value).replace(/^\/+/u, "").toLowerCase();
}

function pathMatchesPrefix(issuePath, prefix) {
  return issuePath === prefix || issuePath.startsWith(`${prefix}/`);
}

function collectDirtyFiles(entries) {
  const dirtyFiles = new Set();
  for (const entry of entries || []) {
    for (const file of normalizeStatusEntryPaths(entry)) {
      dirtyFiles.add(file);
    }
  }
  return dirtyFiles;
}

function normalizeStatusEntryPaths(entry) {
  const statusPath = String(entry?.path || "");
  if (!statusPath) return [];

  return statusPath
    .split(" -> ")
    .map((item) => normalizeIssuePath(item))
    .filter(Boolean);
}

function assessBatchCandidate(issue, { readinessAllowList, excludedIssueIds }) {
  const reasons = [];
  let selected = true;
  const issueId = String(issue?.id || "");
  const readiness = String(issue?.auto_fix_readiness || "");

  if (excludedIssueIds.has(issueId)) {
    selected = false;
    reasons.push("issue id is excluded");
  }

  if (!readinessAllowList.includes(readiness)) {
    selected = false;
    reasons.push(`readiness ${readiness || "unknown"} is not in allowed batch readiness list`);
  }

  if (!issue?.file_path) {
    selected = false;
    reasons.push("missing file path");
  }

  if (!Number.isInteger(issue?.file_line)) {
    selected = false;
    reasons.push("missing line number");
  }

  if (!issue?.snippet) {
    selected = false;
    reasons.push("missing snippet");
  }

  if (selected) {
    reasons.push("selected for guarded batch");
  }

  return { selected, reasons };
}

function summarizeBatchCandidate(issue) {
  return {
    id: issue.id,
    severity: issue.severity,
    status: issue.status,
    action: issue.action,
    file_path: issue.file_path,
    file_line: issue.file_line,
    snippet: issue.snippet,
    auto_fix_score: issue.auto_fix_score,
    auto_fix_readiness: issue.auto_fix_readiness,
    auto_fix_reasons: issue.auto_fix_reasons,
    auto_fix_risks: issue.auto_fix_risks,
  };
}

function normalizeBatchOutcome(outcome) {
  const repairOutcome = outcome?.repair_outcome || outcome?.repairOutcome || outcome || {};
  return {
    issue_id: String(outcome?.issue_id || outcome?.issueId || repairOutcome.issue_id || ""),
    status: repairOutcome.status || outcome?.status || "unknown",
    repair_succeeded: repairOutcome.repair_succeeded ?? outcome?.repair_succeeded ?? null,
    should_continue_batch: repairOutcome.should_continue_batch ?? outcome?.should_continue_batch ?? false,
    recommended_action: repairOutcome.recommended_action || outcome?.recommended_action || "manual_review",
    comparison_state: outcome?.comparison_state || outcome?.comparisonState || outcome?.comparison?.state || null,
    snapshot_id: outcome?.snapshot_id || outcome?.snapshotId || outcome?.snapshot?.id || null,
    commit_sha: outcome?.commit_sha || outcome?.commitSha || null,
    summary: repairOutcome.summary || outcome?.summary || "",
  };
}

function countBatchOutcomes(outcomes) {
  const counts = {
    total: outcomes.length,
    resolved: 0,
    failed: 0,
    needs_review: 0,
    not_checked: 0,
    other: 0,
  };

  for (const outcome of outcomes) {
    if (outcome.status === "resolved") counts.resolved += 1;
    else if (String(outcome.status || "").startsWith("failed")) counts.failed += 1;
    else if (outcome.status === "needs_review") counts.needs_review += 1;
    else if (outcome.status === "not_checked") counts.not_checked += 1;
    else counts.other += 1;
  }

  return counts;
}

function summarizeBatchProgress({ stoppedBy, nextIssueId, normalizedOutcomes }) {
  if (stoppedBy) {
    return `Batch stopped after ${normalizedOutcomes.length} outcome(s): ${stoppedBy.issue_id || "unknown issue"} returned ${stoppedBy.status}.`;
  }

  if (nextIssueId) {
    return `Batch can continue with issue ${nextIssueId}.`;
  }

  return `Batch complete after ${normalizedOutcomes.length} outcome(s).`;
}

function normalizeStringList(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectNearIssueMatches(matches, issues, beforeIssue, targetIssueId) {
  if (!beforeIssue || matches.length >= 5) return;

  for (const issue of issues) {
    if (matches.length >= 5) return;
    if (String(issue.id) === String(targetIssueId)) continue;

    const reasons = [];
    if (beforeIssue.file_path && issue.file_path === beforeIssue.file_path) reasons.push("same_file");
    if (beforeIssue.snippet && issue.snippet === beforeIssue.snippet) reasons.push("same_snippet");
    if (
      beforeIssue.expression_instance_id &&
      issue.expression_instance_id &&
      String(issue.expression_instance_id) === String(beforeIssue.expression_instance_id)
    ) {
      reasons.push("same_expression_instance");
    }

    if (reasons.length > 0) {
      matches.push({
        reasons,
        issue: summarizeIssue(issue),
      });
    }
  }
}

function selectComparisonSnapshot(beforeSnapshots, afterSnapshots) {
  const before = Array.isArray(beforeSnapshots?.data) ? beforeSnapshots.data : [];
  const after = Array.isArray(afterSnapshots?.data) ? afterSnapshots.data : [];
  const beforeIds = new Set(before.map((snapshot) => String(snapshot.id)));
  const newSnapshots = after.filter((snapshot) => !beforeIds.has(String(snapshot.id)));
  const selected = sortSnapshotsDesc(newSnapshots)[0] || sortSnapshotsDesc(after)[0] || null;

  return {
    strategy: newSnapshots.length > 0 ? "new_snapshot" : selected ? "latest_after_snapshot" : "none",
    selected_snapshot: summarizeSnapshot(selected),
    before_snapshot_ids: sortSnapshotsDesc(before).map((snapshot) => snapshot.id),
    after_snapshot_ids: sortSnapshotsDesc(after).map((snapshot) => snapshot.id),
    new_snapshot_ids: sortSnapshotsDesc(newSnapshots).map((snapshot) => snapshot.id),
  };
}

function sortSnapshotsDesc(snapshots) {
  return [...snapshots].sort((left, right) => compareSnapshotDesc(left, right));
}

function compareSnapshotDesc(left, right) {
  const leftId = Number(left?.id);
  const rightId = Number(right?.id);
  if (Number.isFinite(leftId) && Number.isFinite(rightId) && leftId !== rightId) {
    return rightId - leftId;
  }

  const leftTime = snapshotTime(left);
  const rightTime = snapshotTime(right);
  if (leftTime !== rightTime) return rightTime - leftTime;
  return String(right?.id || "").localeCompare(String(left?.id || ""));
}

function snapshotTime(snapshot) {
  const value = snapshot?.created_at || snapshot?.analyzed_at || snapshot?.point_time || snapshot?.updated_at;
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : 0;
}

async function buildReanalysisReadiness({ rblId, context, workspacePath, requireClean }) {
  const repositoryPath = resolveRepositoryWorkspacePath(context?.repository);
  const requestedWorkspacePath = workspacePath || repositoryPath.path;
  const workspaceSource = workspacePath ? "input.workspace_path" : repositoryPath.source;
  const warnings = [];
  const blocks = [];
  let workspace = null;
  let workspaceError = null;

  if (requestedWorkspacePath) {
    try {
      workspace = await inspectGitWorkspace(requestedWorkspacePath, { includeStatus: true });
    } catch (error) {
      workspaceError = summarizeError(error);
      warnings.push(`Could not inspect local git workspace at ${requestedWorkspacePath}.`);
      if (requireClean) {
        blocks.push("require_clean is true, but the local git workspace could not be inspected.");
      }
    }
  } else {
    warnings.push("No local workspace path was provided or discovered from the Merly repository record.");
    if (requireClean) {
      blocks.push("require_clean is true, but no local workspace path is available to inspect.");
    }
  }

  if (workspace?.status?.clean === false) {
    warnings.push(
      "Local workspace has uncommitted changes; Merly repository re-analysis may not include them until they are committed or otherwise visible to the analyzed ref.",
    );
    if (requireClean) {
      blocks.push("require_clean is true and the local workspace has uncommitted changes.");
    }
  }

  const merlyBranchSha = context?.branch?.last_commit_sha || context?.branch?.commit_sha || "";
  if (workspace?.head && merlyBranchSha && !sameCommit(workspace.head, merlyBranchSha)) {
    warnings.push("Local HEAD differs from Merly's recorded branch commit; re-analysis may inspect different code.");
  }

  return {
    rbl_id: rblId,
    can_reanalyze: blocks.length === 0,
    require_clean: Boolean(requireClean),
    workspace_source: workspaceSource || "none",
    workspace_path: requestedWorkspacePath || null,
    merly_branch: context?.branch
      ? {
          id: context.branch.id,
          name: context.branch.name,
          last_commit_sha: merlyBranchSha || null,
        }
      : null,
    workspace: workspace
      ? {
          requested_path: workspace.requested_path,
          root: workspace.root,
          branch: workspace.branch,
          head: workspace.head,
          status: workspace.status,
        }
      : null,
    workspace_error: workspaceError,
    warnings,
    blocks,
    analysis_context: summarizeAnalysisContext(context),
  };
}

function resolveRepositoryWorkspacePath(repository) {
  const candidates = [
    { source: "repository.source_root", path: repository?.source_root },
    { source: "repository.git_root", path: stripGitDirectory(repository?.git_root) },
    { source: "repository.git_url", path: repository?.git_url },
  ];
  const match = candidates.find((candidate) => isLocalPathLike(candidate.path));
  return {
    path: match?.path || "",
    source: match?.source || "none",
  };
}

function inferMerlyWorkDirFromHealth(health) {
  const databasePath = String(health?.database?.database_path || "").trim();
  if (!databasePath) return "";

  const databaseDirectory = path.dirname(databasePath);
  if (path.basename(databaseDirectory).toLowerCase() === ".mentor") {
    return path.dirname(databaseDirectory);
  }

  return "";
}

function stripGitDirectory(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/[\\/]\.git$/i.test(text)) return path.dirname(text);
  return text;
}

function sameCommit(left, right) {
  const normalizedLeft = String(left || "").trim().toLowerCase();
  const normalizedRight = String(right || "").trim().toLowerCase();
  return Boolean(
    normalizedLeft &&
      normalizedRight &&
      (normalizedLeft === normalizedRight ||
        normalizedLeft.startsWith(normalizedRight) ||
        normalizedRight.startsWith(normalizedLeft)),
  );
}

function buildIssueComparison({ rblId, issueId, before, after, analysisCompleted = true }) {
  let state = "unchanged";
  const notes = [];

  if (!analysisCompleted) {
    state = "not_checked";
    notes.push("Analysis job did not complete, so issue state was not compared.");
  } else if (before && !after) {
    state = "disappeared";
    notes.push("Issue no longer appears at the same RBL issue endpoint.");
  } else if (!before && after) {
    state = "appeared";
    notes.push("Issue was not present before the comparison but is present now.");
  } else if (!before && !after) {
    state = "absent";
    notes.push("Issue is absent before and after comparison.");
  } else if (issueChanged(before, after)) {
    state = "changed";
    notes.push("Issue still exists, but one or more tracked fields changed.");
  } else {
    notes.push("Issue still exists with the same tracked fields.");
  }

  return {
    rbl_id: rblId,
    issue_id: issueId,
    state,
    before: summarizeIssue(before),
    after: summarizeIssue(after),
    changed_fields: before && after ? changedIssueFields(before, after) : [],
    notes,
    repair_outcome: assessRepairOutcome({ state, before, after, analysisCompleted }),
  };
}

function issueChanged(before, after) {
  return changedIssueFields(before, after).length > 0;
}

function changedIssueFields(before, after) {
  const fields = ["snapshot_id", "expression_instance_id", "status", "action", "file_path", "file_line", "snippet"];
  return fields.filter((field) => normalizeComparable(before?.[field]) !== normalizeComparable(after?.[field]));
}

function normalizeComparable(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function assessRepairOutcome({ state, before, after, analysisCompleted }) {
  if (!analysisCompleted || state === "not_checked") {
    return {
      status: "not_checked",
      repair_succeeded: null,
      should_continue_batch: false,
      recommended_action: "rerun_after_reanalysis_completes",
      summary: "Repair outcome was not checked because repository analysis did not complete.",
      next_steps: [
        "Do not claim the issue is fixed.",
        "Inspect the failed or timed-out job result.",
        "Rerun re-analysis after fixing the job or visibility problem.",
      ],
    };
  }

  if (state === "disappeared" || (before && !after)) {
    return {
      status: "resolved",
      repair_succeeded: true,
      should_continue_batch: true,
      recommended_action: "report_success",
      summary: "The issue no longer appears in the checked issue source.",
      next_steps: [
        "Report the issue as resolved.",
        "Keep the validation and snapshot evidence in the final report.",
      ],
    };
  }

  if (state === "unchanged" && before && after) {
    return {
      status: "failed_unchanged",
      repair_succeeded: false,
      should_continue_batch: false,
      recommended_action: "stop_and_refine_or_skip",
      summary: "The issue is still present with the same tracked fields after re-analysis.",
      next_steps: [
        "Do not claim the issue is fixed.",
        "Keep the repair branch or commit for inspection.",
        "Refine the patch using issue insights, or mark this candidate failed and select another high-confidence issue.",
      ],
    };
  }

  if (state === "changed") {
    return {
      status: "needs_review",
      repair_succeeded: null,
      should_continue_batch: false,
      recommended_action: "manual_review",
      summary: "The issue still exists, but one or more tracked fields changed.",
      next_steps: [
        "Review the changed fields and nearby matches.",
        "Confirm whether the original finding moved, mutated, or was replaced by a related finding.",
        "Do not continue an automated batch until the result is classified.",
      ],
    };
  }

  if (state === "absent") {
    return {
      status: "not_present",
      repair_succeeded: null,
      should_continue_batch: true,
      recommended_action: "record_absent",
      summary: "The issue was absent before and after comparison.",
      next_steps: [
        "Record that there was no active issue to repair.",
        "Select another candidate if an automated repair run should continue.",
      ],
    };
  }

  if (state === "appeared") {
    return {
      status: "unexpected_appeared",
      repair_succeeded: false,
      should_continue_batch: false,
      recommended_action: "manual_review",
      summary: "The issue appeared after comparison even though it was not present before.",
      next_steps: [
        "Treat this as a regression or comparison mismatch.",
        "Inspect the selected snapshot and target issue id before making another edit.",
      ],
    };
  }

  return {
    status: "unknown",
    repair_succeeded: null,
    should_continue_batch: false,
    recommended_action: "manual_review",
    summary: "Repair outcome could not be classified.",
    next_steps: [
      "Inspect the comparison payload.",
      "Do not continue automated repair until the result is understood.",
    ],
  };
}

function summarizeIssue(issue) {
  if (!issue) return null;
  return {
    id: issue.id,
    snapshot_id: issue.snapshot_id,
    expression_instance_id: issue.expression_instance_id,
    status: issue.status,
    action: issue.action,
    severity: issue.severity,
    file_path: issue.file_path,
    file_line: issue.file_line,
    snippet: issue.snippet,
    updated_at: issue.updated_at,
  };
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    rbl_id: snapshot.rbl_id,
    repository_id: snapshot.repository_id,
    branch_id: snapshot.branch_id,
    language: snapshot.language,
    status: snapshot.status,
    commit_sha: snapshot.commit_sha,
    point_ref: snapshot.point_ref,
    point_time: snapshot.point_time,
    score: snapshot.score,
    issue_count: snapshot.issue_count,
    anomaly_count: snapshot.anomaly_count,
    notable_count: snapshot.notable_count,
    expression_count: snapshot.expression_count,
    created_at: snapshot.created_at,
    analyzed_at: snapshot.analyzed_at,
    updated_at: snapshot.updated_at,
  };
}

function summarizeAnalysisContext(context) {
  return {
    repository: context?.repository
      ? {
          id: context.repository.id,
          name: context.repository.name,
          status: context.repository.status,
          updated_at: context.repository.updated_at,
        }
      : null,
    branch: context?.branch
      ? {
          id: context.branch.id,
          name: context.branch.name,
          last_commit_sha: context.branch.last_commit_sha,
          updated_at: context.branch.updated_at,
        }
      : null,
    rbl: context?.rbl
      ? {
          id: context.rbl.id,
          language: context.rbl.language,
          last_score: context.rbl.last_score,
          last_issue_count: context.rbl.last_issue_count,
          last_analyzed_at: context.rbl.last_analyzed_at,
          snapshot_count: context.rbl.snapshot_count,
          updated_at: context.rbl.updated_at,
        }
      : null,
    latest_snapshot: context?.latest_snapshot
      ? summarizeSnapshot(context.latest_snapshot)
      : null,
  };
}

function parseBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function simplifyInsight(insight) {
  return {
    id: insight.id,
    expression_id: insight.expression_id,
    issue_id: insight.issue_id,
    text: stripHtml(insight.html || ""),
    views: insight.views,
    up_votes: insight.up_votes,
    down_votes: insight.down_votes,
  };
}

function stripHtml(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
