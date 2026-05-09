const SUPPORTED_FAIL_ON_POLICIES = [
  "missing-mappings",
  "merly-failure",
  "unresolved-blockers",
  "unsupported-spec",
];

function parseSpecFailOn(value) {
  if (!value) return [];

  const rawValues = Array.isArray(value) ? value : [value];
  const policies = rawValues
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (policies.includes("none")) return [];

  const unique = [...new Set(policies)];
  const unknown = unique.filter((policy) => !SUPPORTED_FAIL_ON_POLICIES.includes(policy));
  if (unknown.length > 0) {
    throw new Error(`Unsupported --fail-on policy: ${unknown.join(", ")}`);
  }

  return unique;
}

function evaluateSpecPolicies(report, failOnPolicies = []) {
  const policies = [...new Set(failOnPolicies)];
  const failures = [];

  for (const policy of policies) {
    const failure = evaluatePolicy(report, policy);
    if (failure) failures.push(failure);
  }

  return {
    mode: policies.length > 0 ? "enforced" : "advisory",
    status: failures.length > 0 ? "fail" : "pass",
    fail_on: policies,
    failures,
  };
}

function evaluatePolicy(report, policy) {
  switch (policy) {
    case "missing-mappings":
      return hasSkippedCheck(report, "requirement_to_file_mapping")
        ? {
            policy,
            reason: "Requirement-to-file mapping is missing.",
          }
        : null;
    case "merly-failure":
      return hasMerlyFailure(report)
        ? {
            policy,
            reason: "Merly evidence contains failed checks.",
          }
        : null;
    case "unresolved-blockers": {
      const blockers = collectUnresolvedBlockers(report);
      return blockers.length > 0
        ? {
            policy,
            reason: blockers.join(" "),
          }
        : null;
    }
    case "unsupported-spec":
      return hasSkippedCheck(report, "unsupported_spec_format")
        ? {
            policy,
            reason: "Spec input used an unsupported format fallback.",
          }
        : null;
    default:
      return null;
  }
}

function collectUnresolvedBlockers(report) {
  const blockers = [];

  if (hasMerlyFailure(report)) {
    blockers.push("Merly evidence contains failed checks.");
  }

  if (hasSkippedCheck(report, "unsupported_spec_format")) {
    blockers.push("Spec input used an unsupported format fallback.");
  }

  if ((report.summary?.requirement_count || 0) === 0) {
    blockers.push("No requirements were extracted.");
  }

  const changedFileIssue = (report.skipped_checks || []).find((check) => (
    check.name === "changed_files" &&
    /could not|not running|not a git|fatal|failed/i.test(check.reason || "")
  ));
  if (changedFileIssue) {
    blockers.push("Changed-file collection failed.");
  }

  return blockers;
}

function hasMerlyFailure(report) {
  return report.merly_evidence?.status === "failed" ||
    (report.merly_evidence?.checks || []).some((check) => check.status === "fail");
}

function hasSkippedCheck(report, name) {
  return (report.skipped_checks || []).some((check) => check.name === name);
}

function supportedFailOnPolicyList() {
  return SUPPORTED_FAIL_ON_POLICIES.join(", ");
}

module.exports = {
  SUPPORTED_FAIL_ON_POLICIES,
  evaluateSpecPolicies,
  parseSpecFailOn,
  supportedFailOnPolicyList,
};
