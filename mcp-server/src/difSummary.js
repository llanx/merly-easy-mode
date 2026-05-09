export function summarizeDifResult(result) {
  return pruneUndefined({
    eventId: result?.eventId,
    language: result?.language,
    response_mode: result?.response_mode,
    stream: result?.stream,
    base_stream: result?.base_stream,
    verdict: result?.verdict,
    trust_signal: result?.trust_signal,
    routing_reason: result?.routing_reason,
    scores: result?.scores,
    counts: result?.counts,
    tags: result?.tags,
    top_finding: summarizeSignal(result?.top_finding || result?.findings?.[0]),
    top_semantic_signal: summarizeSignal(result?.top_semantic_signal),
    top_block_semantic_signal: summarizeSignal(result?.top_block_semantic_signal),
    top_structural_signal: summarizeSignal(result?.top_structural_signal),
  });
}

function summarizeSignal(signal) {
  if (!signal) return undefined;
  return pruneUndefined({
    kind: signal.kind,
    expression_kind: signal.expression_kind,
    semantic_role: signal.semantic_role,
    semantic_family: signal.semantic_family,
    support_band: signal.support_band,
    support_interpretation: signal.support_interpretation,
    cost: signal.cost,
    total_score: signal.total_score,
    semantic_support_score: signal.semantic_support_score,
    excerpt: truncate(signal.excerpt, 500),
    span: signal.span,
  });
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
