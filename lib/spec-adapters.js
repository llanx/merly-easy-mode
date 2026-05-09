const fs = require("node:fs");
const path = require("node:path");

const ADAPTERS = {
  markdown: { id: "markdown", label: "Markdown" },
  adr: { id: "adr-markdown", label: "ADR Markdown" },
  gherkin: { id: "gherkin", label: "Gherkin" },
  openapi: { id: "openapi", label: "OpenAPI" },
  asyncapi: { id: "asyncapi", label: "AsyncAPI" },
  graphql: { id: "graphql-sdl", label: "GraphQL SDL" },
  jsonSchema: { id: "json-schema", label: "JSON Schema" },
};

const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

function extractSpecRequirements(inputPath, options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const absolutePath = path.resolve(baseDir, inputPath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const lines = splitLines(content);
  const adapter = detectSpecAdapter(absolutePath, content);
  const context = {
    absolutePath,
    displayPath: normalizePath(path.relative(baseDir, absolutePath) || path.basename(absolutePath)),
    content,
    lines,
  };

  let requirements;
  switch (adapter.id) {
    case ADAPTERS.gherkin.id:
      requirements = extractGherkin(context);
      break;
    case ADAPTERS.openapi.id:
      requirements = extractOpenApi(context);
      break;
    case ADAPTERS.asyncapi.id:
      requirements = extractAsyncApi(context);
      break;
    case ADAPTERS.graphql.id:
      requirements = extractGraphql(context);
      break;
    case ADAPTERS.jsonSchema.id:
      requirements = extractJsonSchema(context);
      break;
    case ADAPTERS.adr.id:
      requirements = extractAdrMarkdown(context);
      break;
    default:
      requirements = extractMarkdown(context);
      break;
  }

  const normalizedRequirements = requirements.map((item, index) => ({
    id: `${adapter.id}-${String(index + 1).padStart(3, "0")}`,
    source: {
      path: context.displayPath,
      line: item.line,
    },
    kind: item.kind,
    text: normalizeWhitespace(item.text),
    section: item.section || "",
    metadata: item.metadata || {},
  }));

  const warnings = [];
  if (normalizedRequirements.length === 0) {
    warnings.push("No requirement-like items were extracted.");
  }

  return {
    spec_path: context.displayPath,
    adapter,
    requirement_count: normalizedRequirements.length,
    requirements: normalizedRequirements,
    warnings,
    note: "Extraction only; no semantic proof or Merly verification was performed.",
  };
}

function detectSpecAdapter(filePath, content) {
  const extension = path.extname(filePath).toLowerCase();
  const trimmed = content.trim();

  if (extension === ".feature") return ADAPTERS.gherkin;
  if (extension === ".graphql" || extension === ".gql") return ADAPTERS.graphql;

  if (extension === ".json" || extension === ".schema") {
    const parsed = parseJson(trimmed);
    if (parsed?.openapi || parsed?.swagger) return ADAPTERS.openapi;
    if (parsed?.asyncapi) return ADAPTERS.asyncapi;
    return ADAPTERS.jsonSchema;
  }

  if (extension === ".yaml" || extension === ".yml") {
    if (/^\s*openapi\s*:/m.test(content) || /^\s*swagger\s*:/m.test(content)) return ADAPTERS.openapi;
    if (/^\s*asyncapi\s*:/m.test(content)) return ADAPTERS.asyncapi;
  }

  if (extension === ".md" && looksLikeAdr(content)) return ADAPTERS.adr;
  return ADAPTERS.markdown;
}

function extractMarkdown(context) {
  const items = [];
  let section = "";

  context.lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      section = heading[2].trim();
      return;
    }

    const candidate = cleanMarkdownListItem(line);
    if (!candidate) return;
    if (!isRequirementText(candidate)) return;
    items.push({
      line: index + 1,
      kind: "requirement",
      section,
      text: candidate,
    });
  });

  return items;
}

function extractAdrMarkdown(context) {
  const items = [];
  let section = "";

  context.lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      section = heading[2].trim();
      return;
    }

    const candidate = cleanMarkdownListItem(line);
    if (!candidate) return;

    if (/^status\s*:/i.test(candidate)) {
      items.push({ line: index + 1, kind: "status", section: section || "Status", text: candidate });
    } else if (/^decision$/i.test(section) || /^decisions$/i.test(section)) {
      items.push({ line: index + 1, kind: "decision", section, text: candidate });
    } else if (/^consequences?$/i.test(section)) {
      items.push({ line: index + 1, kind: "consequence", section, text: candidate });
    } else if (isRequirementText(candidate)) {
      items.push({ line: index + 1, kind: "requirement", section, text: candidate });
    }
  });

  return items;
}

function extractGherkin(context) {
  const items = [];
  let feature = "";
  let scenario = "";

  context.lines.forEach((line, index) => {
    const trimmed = line.trim();
    const featureMatch = trimmed.match(/^Feature:\s*(.+)$/i);
    if (featureMatch) {
      feature = featureMatch[1].trim();
      return;
    }

    const scenarioMatch = trimmed.match(/^(Scenario|Scenario Outline):\s*(.+)$/i);
    if (scenarioMatch) {
      scenario = scenarioMatch[2].trim();
      items.push({
        line: index + 1,
        kind: "scenario",
        section: feature,
        text: `${scenarioMatch[1]}: ${scenario}`,
      });
      return;
    }

    const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)$/i);
    if (stepMatch) {
      items.push({
        line: index + 1,
        kind: "gherkin_step",
        section: scenario || feature,
        text: `${capitalize(stepMatch[1].toLowerCase())} ${stepMatch[2].trim()}`,
        metadata: { feature, scenario, keyword: capitalize(stepMatch[1].toLowerCase()) },
      });
    }
  });

  return items;
}

function extractOpenApi(context) {
  const document = parseJson(context.content);
  if (!document) return extractYamlApiLike(context, "openapi");

  const items = [];
  const paths = document.paths || {};
  for (const [route, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method.toLowerCase())) continue;

      const upperMethod = method.toUpperCase();
      const operationLine = findLine(context.lines, `"${method}"`) || findLine(context.lines, route);
      const summary = operation?.summary || operation?.operationId || "";
      items.push({
        line: operationLine,
        kind: "operation",
        section: route,
        text: `${upperMethod} ${route}${summary ? ` - ${summary}` : ""}`,
        metadata: { method: upperMethod, path: route, operation_id: operation?.operationId || "" },
      });

      for (const [status, response] of Object.entries(operation?.responses || {})) {
        items.push({
          line: findLine(context.lines, `"${status}"`) || operationLine,
          kind: "response",
          section: `${upperMethod} ${route}`,
          text: `${upperMethod} ${route} response ${status}${response?.description ? ` - ${response.description}` : ""}`,
          metadata: { method: upperMethod, path: route, status },
        });
      }
    }
  }

  return items;
}

function extractAsyncApi(context) {
  const document = parseJson(context.content);
  if (!document) return extractYamlApiLike(context, "asyncapi");

  const items = [];
  const channels = document.channels || {};
  for (const [channel, channelItem] of Object.entries(channels)) {
    for (const operationName of ["publish", "subscribe"]) {
      const operation = channelItem?.[operationName];
      if (!operation) continue;

      const messageName = messageLabel(operation.message);
      items.push({
        line: findLine(context.lines, `"${operationName}"`) || findLine(context.lines, channel),
        kind: "message_operation",
        section: channel,
        text: `${operationName} ${channel}${messageName ? ` message ${messageName}` : ""}`,
        metadata: { channel, operation: operationName, message: messageName },
      });
    }
  }

  return items;
}

function extractGraphql(context) {
  const items = [];
  let currentDefinition = null;
  let currentKind = "";

  context.lines.forEach((line, index) => {
    const trimmed = line.trim();
    const definition = trimmed.match(/^(type|input|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (definition) {
      currentKind = definition[1];
      currentDefinition = definition[2];
      items.push({
        line: index + 1,
        kind: "definition",
        section: currentDefinition,
        text: `${currentKind} ${currentDefinition}`,
        metadata: { definition: currentDefinition, definition_kind: currentKind },
      });
      return;
    }

    if (trimmed === "}") {
      currentDefinition = null;
      currentKind = "";
      return;
    }

    if (!currentDefinition || !trimmed || trimmed.startsWith("#")) return;

    if (currentKind === "enum" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
      items.push({
        line: index + 1,
        kind: "enum_value",
        section: currentDefinition,
        text: `enum ${currentDefinition} value ${trimmed}`,
        metadata: { definition: currentDefinition, value: trimmed },
      });
      return;
    }

    const field = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\([^)]*\))?)\s*:\s*([^#]+)$/);
    if (field) {
      items.push({
        line: index + 1,
        kind: "field",
        section: currentDefinition,
        text: `${currentKind} ${currentDefinition} field ${field[1]}: ${field[2].trim()}`,
        metadata: { definition: currentDefinition, field: field[1], type: field[2].trim() },
      });
    }
  });

  return items;
}

function extractJsonSchema(context) {
  const schema = parseJson(context.content);
  if (!schema) return [];

  const items = [];
  const title = schema.title || "root";
  if (Array.isArray(schema.required) && schema.required.length > 0) {
    items.push({
      line: findLine(context.lines, "\"required\""),
      kind: "required_fields",
      section: title,
      text: `${title} requires ${schema.required.join(", ")}`,
      metadata: { required: schema.required },
    });
  }

  for (const [property, definition] of Object.entries(schema.properties || {})) {
    const constraints = [];
    if (definition.type) constraints.push(`type ${definition.type}`);
    if (definition.format) constraints.push(`format ${definition.format}`);
    if (definition.minLength !== undefined) constraints.push(`minLength ${definition.minLength}`);
    if (definition.enum) constraints.push(`enum ${definition.enum.join(", ")}`);

    items.push({
      line: findLine(context.lines, `"${property}"`),
      kind: "property",
      section: title,
      text: `${title} property ${property}${constraints.length > 0 ? ` ${constraints.join("; ")}` : ""}`,
      metadata: { property, constraints },
    });
  }

  return items;
}

function extractYamlApiLike(context, adapterId) {
  const items = [];
  let currentPath = "";
  let currentChannel = "";

  context.lines.forEach((line, index) => {
    const pathMatch = line.match(/^\s{2}([/][^:]+):\s*$/);
    if (pathMatch) currentPath = pathMatch[1];

    const methodMatch = line.match(/^\s{4}(get|put|post|delete|patch|publish|subscribe):\s*$/i);
    if (methodMatch) {
      const operation = methodMatch[1].toLowerCase();
      const section = currentPath || currentChannel;
      items.push({
        line: index + 1,
        kind: adapterId === "asyncapi" ? "message_operation" : "operation",
        section,
        text: `${operation.toUpperCase()} ${section}`,
        metadata: { operation, path: section },
      });
    }

    const channelMatch = line.match(/^\s{2}([^:/][^:]+):\s*$/);
    if (channelMatch && !currentPath) currentChannel = channelMatch[1];
  });

  return items;
}

function looksLikeAdr(content) {
  return /(^|\n)#\s*ADR\b/i.test(content) ||
    /(^|\n)##\s*Decision\s*$/im.test(content) ||
    /(^|\n)##\s*Consequences?\s*$/im.test(content);
}

function cleanMarkdownListItem(line) {
  return line
    .trim()
    .replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function isRequirementText(value) {
  return /^(REQ[-_ ]?\d+|Requirement)\b/i.test(value) ||
    /\b(MUST|MUST NOT|SHOULD|SHOULD NOT|SHALL|MAY)\b/.test(value);
}

function messageLabel(message) {
  if (!message) return "";
  if (message.$ref) return path.basename(message.$ref);
  return message.name || message.title || message.messageId || "";
}

function parseJson(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function splitLines(content) {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function findLine(lines, needle) {
  const index = lines.findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : 1;
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSpecSummary(result, { title = "Spec Preflight", dryRun = false } = {}) {
  const lines = [
    `${title}${dryRun ? " (dry run)" : ""}`,
    "",
    `Spec input: ${result.spec_path}`,
    `Adapter: ${result.adapter.label} (${result.adapter.id})`,
    `Extracted requirements: ${result.requirement_count}`,
    "Extraction only; no semantic proof or Merly verification was performed.",
  ];

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }

  if (result.requirements.length > 0) {
    lines.push("", "Requirement Items:");
    for (const item of result.requirements) {
      lines.push(`- ${item.id} ${item.source.path}:${item.source.line} ${item.kind} - ${item.text}`);
    }
  }

  return lines.join("\n");
}

module.exports = {
  ADAPTERS,
  detectSpecAdapter,
  extractSpecRequirements,
  formatSpecSummary,
};
