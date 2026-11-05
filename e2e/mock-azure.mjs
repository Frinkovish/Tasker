// A fake Azure OpenAI endpoint that misbehaves on request, for testing failure paths.
import http from "node:http";

let calls = 0;
let last = null;

const blank = {
  title: "", description: null, workspaceName: null, workspaceEvidence: null,
  stakeholderName: null, projectName: null, deadlinePhrase: null, deadlineDate: null, deadlineTime: null,
  priority: "medium", priorityEvidence: null, estimatedMinutes: null, estimateEvidence: null,
  nextAction: null, questions: [],
};

function nextWeekday(target) {
  const zone = "Africa/Tunis";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const delta = ((target - today.getUTCDay() + 7) % 7) || 7;
  return new Date(today.getTime() + delta * 86400000).toISOString().slice(0, 10);
}

function reply(res, content, finish = "stop", refusal = null) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ finish_reason: finish, message: { content, refusal } }], usage: { total_tokens: 1 } }));
}

// The assistant: scripted by keywords in the latest user message.
let assistantLast = null;
const toolReplies = [];
const FILTERS = { workspace_id: null, status: "active", deadline: null, priority: null, person: null, project: null, text: null };
const callTool = (res, ...calls) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: calls.map(([name, args], i) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } })) } }] }));
};
const answer = (res, text, ids = []) => reply(res, JSON.stringify({ reply: text, referenced_task_ids: ids }));

function assistant(parsed, res) {
  const lastUserIndex = parsed.messages.findLastIndex((m) => m.role === "user");
  const text = parsed.messages[lastUserIndex].content;
  const after = parsed.messages.slice(lastUserIndex + 1);
  const results = after.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  const round = after.filter((m) => m.role === "assistant").length;
  assistantLast = { messages: parsed.messages, tools: parsed.tools.map((t) => t.function.name), reasoning: parsed.reasoning_effort, toolChoice: parsed.tool_choice, strictReply: parsed.response_format?.json_schema?.strict };
  toolReplies.push(...after.filter((m) => m.role === "tool").slice(-1).map((m) => m.content));
  const firstTask = () => results[0].tasks[0];

  if (text.includes("MOCK_FAIL")) { res.writeHead(500); return res.end("boom"); }
  if (text.includes("MOCK_BADJSON")) return reply(res, "this is not json");
  if (text.includes("MOCK_FILTERED")) return reply(res, null, "content_filter");
  if (text.includes("MOCK_SLOW")) return void setTimeout(() => answer(res, "Too late"), 45000);
  if (text.includes("MOCK_LOOP")) {
    return parsed.tool_choice === "none" ? answer(res, "Out of rounds, here's what I have.") : callTool(res, ["get_workload", {}]);
  }
  if (text.includes("MOCK_XSS")) {
    return answer(res, `<img src=x onerror="window.__pwned=1"> <a href="https://evil.example">Click here</a> **bold** [link](https://evil.example)\n${"L".repeat(400)}`, ["00000000-0000-4000-8000-000000000999", "not-a-uuid"]);
  }
  if (text.includes("MOCK_FOREIGN")) {
    const id = text.match(/MOCK_FOREIGN (\S+)/)[1];
    return round === 0 ? callTool(res, ["propose_task_change", { task_id: id, changes: [{ field: "priority", value: "critical" }] }]) : answer(res, `Result: ${results[0].error ?? "PROPOSED"}`);
  }
  if (text.includes("MOCK_READFOREIGN")) {
    const id = text.match(/MOCK_READFOREIGN (\S+)/)[1];
    return round === 0 ? callTool(res, ["get_task", { task_id: id }]) : answer(res, `Result: ${results[0].error ?? "READ " + results[0].title}`);
  }
  if (text.includes("MOCK_MOVEWS")) {
    const search = () => callTool(res, ["find_tasks", { ...FILTERS, text: "alpha" }]);
    if (round === 0) return search();
    return round === 1 ? callTool(res, ["propose_task_change", { task_id: firstTask().id, changes: [{ field: "workspaceId", value: "x" }] }]) : answer(res, `Result: ${results[1].error ?? "PROPOSED"}`);
  }
  if (text.includes("MOCK_BADTOOL")) {
    if (round === 0) return callTool(res, ["drop_all_tables", {}], ["find_tasks", "{not json"]);
    return answer(res, `Results: ${results.map((r) => r.error).join(" | ")}`);
  }
  if (text.includes("MOCK_MOVE")) {
    const [, word, value] = text.match(/MOCK_MOVE (\S+) (\S+)/);
    if (round === 0) return callTool(res, ["find_tasks", { ...FILTERS, text: word }]);
    if (round === 1) return callTool(res, ["propose_task_change", { task_id: firstTask().id, changes: [{ field: "deadline", value }] }]);
    return answer(res, results[1].error ? `Couldn't: ${results[1].error}` : "It's ready for you to confirm below.", [firstTask().id]);
  }
  if (text.includes("MOCK_NOTE")) {
    const word = text.match(/MOCK_NOTE (\S+)/)[1];
    if (round === 0) return callTool(res, ["find_tasks", { ...FILTERS, text: word }]);
    if (round === 1) return callTool(res, ["propose_note", { task_id: firstTask().id, body: "A note from the assistant" }], ["propose_subtask", { task_id: firstTask().id, title: "A step from the assistant" }], ["propose_task_change", { task_id: firstTask().id, changes: [{ field: "priority", value: "critical" }, { field: "waitingFor", value: "Nadia" }] }]);
    return answer(res, "Three things to confirm below.");
  }
  if (text.includes("overdue")) {
    if (round === 0) return callTool(res, ["find_tasks", { ...FILTERS, deadline: "overdue" }]);
    const { tasks, total } = results[0];
    return answer(res, total === 0 ? "Nothing is overdue." : `Overdue (${total}):\n${tasks.map((t) => `- ${t.title} (${t.workspace})`).join("\n")}`, tasks.map((t) => t.id));
  }
  if (text.includes("today")) {
    if (round === 0) return callTool(res, ["get_daily_plan", { workspace_id: null, available_minutes: null }]);
    return answer(res, `Top: ${results[0].most_important.map((t) => t.title).join(", ") || "nothing"}`, results[0].most_important.map((t) => t.id));
  }
  if (text.includes("Emma")) {
    if (round === 0) return callTool(res, [ "find_tasks", { ...FILTERS, status: "all", person: "Emma" }]);
    return answer(res, `Found ${results[0].total}`, results[0].tasks.map((t) => t.id));
  }
  return answer(res, `You said: ${text}`);
}

http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/assistant-last") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ calls, last: assistantLast, toolReplies }));
  }
  if (req.method === "GET" && req.url === "/count") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ calls, last }));
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    calls++;
    const parsed = JSON.parse(body);
    if (parsed.tools) return assistant(parsed, res);
    const user = parsed.messages.find((m) => m.role === "user").content;
    last = { url: req.url, hasKey: Boolean(req.headers["api-key"]), keyLooksReal: (req.headers["api-key"] ?? "").length > 10, user, responseFormat: parsed.response_format?.type, strict: parsed.response_format?.json_schema?.strict };
    const request = JSON.parse(user).request;

    if (request.includes("MOCK_FAIL")) { res.writeHead(500); return res.end("boom"); }
    if (request.includes("MOCK_429")) { res.writeHead(429); return res.end("slow down"); }
    if (request.includes("MOCK_BADJSON")) return reply(res, "this is not json");
    if (request.includes("MOCK_BADSHAPE")) return reply(res, JSON.stringify({ title: "Only a title" }));
    if (request.includes("MOCK_FILTERED")) return reply(res, null, "content_filter");
    if (request.includes("MOCK_REFUSAL")) return reply(res, null, "stop", "I can't help with that.");
    if (request.includes("MOCK_SLOW")) return void setTimeout(() => reply(res, JSON.stringify(blank)), 25000);
    if (request.includes("MOCK_INVENT")) {
      return reply(res, JSON.stringify({
        ...blank,
        title: `<img src=x onerror="window.__pwned=1"> Hijacked`,
        description: "d".repeat(9000),
        workspaceName: "Hacker Corp", workspaceEvidence: "not in the request",
        stakeholderName: "Nadia",
        projectName: "Reporting",
        deadlinePhrase: "next Friday", deadlineDate: "2030-01-04", deadlineTime: "09:00",
        priority: "critical", priorityEvidence: "extremely urgent",
        estimatedMinutes: -5,
        questions: ["<b>Bold question?</b>"],
      }));
    }
    if (request.includes("MOCK_GOOD")) {
      return reply(res, JSON.stringify({
        ...blank,
        title: "Update the ELD dashboard",
        description: "Include validation rules.",
        stakeholderName: "Emma",
        projectName: "ELD",
        deadlinePhrase: "before Monday", deadlineDate: nextWeekday(1), deadlineTime: null,
        priority: "high",
        estimatedMinutes: 90,
        nextAction: "Pull the enrollment figures",
        questions: ["Which figures should it use?"],
      }));
    }
    return reply(res, JSON.stringify(blank));
  });
}).listen(3199, () => console.log("mock ready"));
