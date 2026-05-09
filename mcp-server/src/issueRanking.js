const SEVERITY_SCORE = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

const ACTION_SCORE = {
  fix: 80,
  simplify: 70,
  investigate: 20,
  potential_security_issue: 10,
  potential_crash: 10,
  ignore: -100,
};

const TEST_PATH_PATTERN = /(^|[\\/])(?:test|tests|__tests__|spec)([\\/]|$)|(?:test|tests|spec)\.(?:c|cc|cpp|cxx|h|hpp|js|ts|py)$/i;

const GENERATED_PATH_PATTERN = /(^|[\\/])(?:generated|vendor|third_party|external|node_modules)([\\/]|$)/i;

const GUARD_SNIPPET_PATTERNS = [
  { label: "null guard", pattern: /\b(?:null|nullptr)\b/i },
  { label: "validity guard", pattern: /\bIsValid\b|\.IsValid\b/i },
  { label: "finite-value guard", pattern: /\bIsFinite\b/i },
  { label: "bounds guard", pattern: /\b(?:Contains|ContainsCell|Within|InBounds)\b/i },
  { label: "type/state guard", pattern: /\b(?:Cast<|Status|State|Mode)\b/i },
];

export function rankIssues(issues) {
  return issues
    .map((issue) => enrichIssue(issue))
    .sort((a, b) => b.auto_fix_score - a.auto_fix_score);
}

export function assessIssueBundle(issue, { insights = [], insightJob = null } = {}) {
  const enrichedIssue = enrichIssue(issue);
  const insightState = assessInsightState(insights, insightJob);
  const risks = [...enrichedIssue.auto_fix_risks, ...insightState.risks];
  const readiness = chooseReadiness(risks);
  const insightPenalty = insightState.risks.reduce((total, risk) => total + risk.penalty, 0);

  return {
    auto_fix_score: enrichedIssue.auto_fix_score + insightPenalty,
    auto_fix_readiness: readiness,
    auto_fix_reasons: enrichedIssue.auto_fix_reasons,
    auto_fix_risks: risks,
    insight_state: insightState.state,
  };
}

function enrichIssue(issue) {
  const autoFixReasons = scoreReasons(issue);
  const autoFixRisks = riskReasons(issue);
  return {
    ...issue,
    auto_fix_score: scoreIssue(issue, autoFixRisks),
    auto_fix_readiness: chooseReadiness(autoFixRisks),
    auto_fix_reasons: autoFixReasons,
    auto_fix_risks: autoFixRisks,
  };
}

function scoreIssue(issue) {
  let score = SEVERITY_SCORE[String(issue.severity || "").toLowerCase()] || 0;
  score += ACTION_SCORE[String(issue.action || "").toLowerCase()] || 0;

  if (issue.status === "open") score += 50;
  if (issue.file_path) score += 40;
  if (Number.isInteger(issue.file_line)) score += 30;
  if (issue.snippet && issue.snippet.length > 0) score += 30;
  if (issue.snippet && issue.snippet.length < 1000) score += 20;
  if (issue.comment) score += 5;

  const path = String(issue.file_path || "");
  if (path && !TEST_PATH_PATTERN.test(path) && !GENERATED_PATH_PATTERN.test(path)) score += 25;

  for (const risk of riskReasons(issue)) {
    score += risk.penalty;
  }

  return score;
}

function scoreReasons(issue) {
  const reasons = [];
  if (issue.status === "open") reasons.push("open issue");
  if (issue.severity) reasons.push(`${issue.severity} severity`);
  if (issue.action) reasons.push(`action=${issue.action}`);
  if (issue.file_path) reasons.push("has file path");
  if (Number.isInteger(issue.file_line)) reasons.push("has line number");
  if (issue.snippet) reasons.push("has snippet");
  if (issue.snippet && issue.snippet.length < 1000) reasons.push("small snippet");
  if (issue.file_path && !TEST_PATH_PATTERN.test(issue.file_path)) reasons.push("production path");
  return reasons;
}

function riskReasons(issue) {
  const risks = [];
  const path = String(issue.file_path || "");
  const snippet = String(issue.snippet || "");

  if (path && TEST_PATH_PATTERN.test(path)) {
    risks.push({
      kind: "test_path",
      label: "test fixture path",
      penalty: -160,
      automated_fix_impact: "skip_early_prototype",
    });
  }

  if (path && GENERATED_PATH_PATTERN.test(path)) {
    risks.push({
      kind: "generated_or_external_path",
      label: "generated or external path",
      penalty: -220,
      automated_fix_impact: "skip_early_prototype",
    });
  }

  if (isConditionOnlySnippet(snippet)) {
    risks.push({
      kind: "condition_only_snippet",
      label: "condition-only snippet",
      penalty: -25,
      automated_fix_impact: "inspect_only",
    });
  }

  for (const guard of GUARD_SNIPPET_PATTERNS) {
    if (guard.pattern.test(snippet)) {
      risks.push({
        kind: normalizeKind(guard.label),
        label: guard.label,
        penalty: -45,
        automated_fix_impact: "inspect_only",
      });
    }
  }

  if (snippet.includes("||") || snippet.includes("&&")) {
    risks.push({
      kind: "compound_condition",
      label: "compound condition",
      penalty: -15,
      automated_fix_impact: "inspect_only",
    });
  }

  return risks;
}

function chooseReadiness(risks) {
  if (risks.some((risk) => risk.automated_fix_impact === "skip_early_prototype")) {
    return "skip_early_prototype";
  }

  if (risks.some((risk) => risk.automated_fix_impact === "defer_until_insights_ready")) {
    return "defer_until_insights_ready";
  }

  if (risks.some((risk) => risk.automated_fix_impact === "inspect_only")) {
    return "inspect_only";
  }

  return "candidate";
}

function assessInsightState(insights, insightJob) {
  if (insightJob) {
    const jobStatus = String(insightJob.status || "").toLowerCase();
    if (["failed", "canceled"].includes(jobStatus)) {
      return {
        state: jobStatus,
        risks: [
          {
            kind: "failed_insights",
            label: `expression insights ${jobStatus}`,
            penalty: -80,
            automated_fix_impact: "defer_until_insights_ready",
          },
        ],
      };
    }

    if (jobStatus === "completed") {
      return {
        state: "completed_without_insights",
        risks: [
          {
            kind: "missing_insights",
            label: "insight job completed without expression insights",
            penalty: -40,
            automated_fix_impact: "inspect_only",
          },
        ],
      };
    }

    return {
      state: "pending",
      risks: [
        {
          kind: "pending_insights",
          label: "expression insights pending",
          penalty: -80,
          automated_fix_impact: "defer_until_insights_ready",
        },
      ],
    };
  }

  if (insights.some((insight) => insight?.error)) {
    return {
      state: "error",
      risks: [
        {
          kind: "failed_insights",
          label: "expression insights unavailable",
          penalty: -80,
          automated_fix_impact: "defer_until_insights_ready",
        },
      ],
    };
  }

  if (insights.length === 0) {
    return {
      state: "missing",
      risks: [
        {
          kind: "missing_insights",
          label: "no expression insights returned",
          penalty: -40,
          automated_fix_impact: "inspect_only",
        },
      ],
    };
  }

  return { state: "available", risks: [] };
}

function isConditionOnlySnippet(snippet) {
  return /^\s*if\s*\(.+\)\s*(?:\{\s*\})?\s*;?\s*$/s.test(snippet);
}

function normalizeKind(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
