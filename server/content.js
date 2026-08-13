import { auth, admin } from "./auth.js";
const difficulties = new Set(["入门", "简单", "中等", "困难"]),
  contestTypes = new Set(["ACM", "OI", "IOI", "作业"]);
const text = (v, n, max = 100000) => {
  const s = String(v ?? "").trim();
  if (!s || s.length > max) throw new Error(`${n}不能为空或过长`);
  return s;
};
function problemBody(body) {
  const id = text(body.id, "题号", 24);
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error("题号只能包含字母、数字、下划线和连字符");
  const difficulty = text(body.difficulty, "难度", 8);
  if (!difficulties.has(difficulty)) throw new Error("难度无效");
  const tags = Array.isArray(body.tags)
    ? body.tags
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 12)
    : String(body.tags || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 12);
  let testcases = body.testcases;
  if (typeof testcases === "string") testcases = JSON.parse(testcases);
  if (
    !Array.isArray(testcases) ||
    !testcases.length ||
    testcases.some((x) => !Array.isArray(x) || x.length !== 2)
  )
    throw new Error("测试点必须是 [[输入,输出]] 数组");
  return {
    id,
    title: text(body.title, "标题", 100),
    difficulty,
    tags: JSON.stringify(tags),
    time_limit: Math.max(100, Math.min(60000, Number(body.time_limit) || 1000)),
    memory_limit: Math.max(
      16,
      Math.min(2048, Number(body.memory_limit) || 256),
    ),
    description: text(body.description, "题目描述"),
    input_format: text(body.input_format, "输入格式"),
    output_format: text(body.output_format, "输出格式"),
    sample_input: String(body.sample_input ?? ""),
    sample_output: String(body.sample_output ?? ""),
    testcases: JSON.stringify(testcases),
  };
}
export function mountContent(app, db, publicProblem) {
  app.get("/api/admin/problems/:id", admin, (req, res) => {
    const p = db
      .prepare("SELECT * FROM problems WHERE id=?")
      .get(req.params.id);
    if (!p) return res.status(404).json({ error: "题目不存在" });
    res.json({ ...publicProblem(p, true), testcases: JSON.parse(p.testcases) });
  });
  app.post("/api/admin/problems", admin, (req, res) => {
    try {
      const p = problemBody(req.body);
      db.prepare(
        `INSERT INTO problems(id,title,difficulty,tags,time_limit,memory_limit,description,input_format,output_format,sample_input,sample_output,testcases) VALUES(@id,@title,@difficulty,@tags,@time_limit,@memory_limit,@description,@input_format,@output_format,@sample_input,@sample_output,@testcases)`,
      ).run(p);
      res
        .status(201)
        .json(
          publicProblem(
            db.prepare("SELECT * FROM problems WHERE id=?").get(p.id),
            true,
          ),
        );
    } catch (e) {
      res
        .status(String(e.message).includes("UNIQUE") ? 409 : 400)
        .json({ error: e.message });
    }
  });
  app.put("/api/admin/problems/:id", admin, (req, res) => {
    try {
      const p = problemBody({ ...req.body, id: req.params.id });
      const r = db
        .prepare(
          `UPDATE problems SET title=@title,difficulty=@difficulty,tags=@tags,time_limit=@time_limit,memory_limit=@memory_limit,description=@description,input_format=@input_format,output_format=@output_format,sample_input=@sample_input,sample_output=@sample_output,testcases=@testcases WHERE id=@id`,
        )
        .run(p);
      if (!r.changes) return res.status(404).json({ error: "题目不存在" });
      res.json(
        publicProblem(
          db.prepare("SELECT * FROM problems WHERE id=?").get(p.id),
          true,
        ),
      );
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/admin/problems/:id", admin, (req, res) => {
    if (
      db
        .prepare("SELECT 1 FROM submissions WHERE problem_id=? LIMIT 1")
        .get(req.params.id)
    )
      return res.status(409).json({ error: "题目已有提交记录，不能删除" });
    const r = db.prepare("DELETE FROM problems WHERE id=?").run(req.params.id);
    res.status(r.changes ? 204 : 404).end();
  });
  app.get("/api/contests/:id", (req, res) => {
    const c = db
      .prepare("SELECT * FROM contests WHERE id=?")
      .get(req.params.id);
    if (!c) return res.status(404).json({ error: "比赛不存在" });
    c.problems = db
      .prepare(
        "SELECT p.id,p.title,cp.position FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=? ORDER BY cp.position",
      )
      .all(req.params.id);
    res.json(c);
  });
  const contestBody = (b) => {
    const starts = new Date(b.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("开始时间无效");
    const type = text(b.type, "赛制", 12);
    if (!contestTypes.has(type)) throw new Error("赛制无效");
    return {
      title: text(b.title, "比赛名称", 100),
      type,
      starts_at: starts.toISOString(),
      duration: Math.max(10, Math.min(10080, Number(b.duration) || 120)),
      description: String(b.description || ""),
      problems: Array.isArray(b.problems) ? b.problems : [],
    };
  };
  const setContestProblems = (id, ids) => {
    db.prepare("DELETE FROM contest_problems WHERE contest_id=?").run(id);
    const ins = db.prepare("INSERT INTO contest_problems VALUES(?,?,?)");
    ids.forEach((pid, i) => ins.run(id, pid, i));
  };
  app.post("/api/admin/contests", admin, (req, res) => {
    try {
      const c = contestBody(req.body),
        { problems, ...fields } = c,
        r = db
          .prepare(
            "INSERT INTO contests(title,type,starts_at,duration,description) VALUES(@title,@type,@starts_at,@duration,@description)",
          )
          .run(fields);
      setContestProblems(Number(r.lastInsertRowid), problems);
      res.status(201).json({ id: Number(r.lastInsertRowid), ...c });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.put("/api/admin/contests/:id", admin, (req, res) => {
    try {
      const c = contestBody(req.body),
        { problems, ...fields } = c,
        r = db
          .prepare(
            "UPDATE contests SET title=@title,type=@type,starts_at=@starts_at,duration=@duration,description=@description WHERE id=@id",
          )
          .run({ ...fields, id: req.params.id });
      if (!r.changes) return res.status(404).json({ error: "比赛不存在" });
      setContestProblems(req.params.id, problems);
      res.json({ id: Number(req.params.id), ...c });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/admin/contests/:id", admin, (req, res) => {
    const r = db.prepare("DELETE FROM contests WHERE id=?").run(req.params.id);
    res.status(r.changes ? 204 : 404).end();
  });
  app.get("/api/discussions", (_, res) =>
    res.json(
      db
        .prepare(
          `SELECT d.id,d.title,d.content,d.created_at,d.updated_at,u.username,COUNT(r.id) replies FROM discussions d JOIN users u ON u.id=d.user_id LEFT JOIN discussion_replies r ON r.discussion_id=d.id GROUP BY d.id ORDER BY d.updated_at DESC`,
        )
        .all(),
    ),
  );
  app.get("/api/discussions/:id", (req, res) => {
    const post = db
      .prepare(
        "SELECT d.*,u.username FROM discussions d JOIN users u ON u.id=d.user_id WHERE d.id=?",
      )
      .get(req.params.id);
    if (!post) return res.status(404).json({ error: "讨论不存在" });
    post.replies = db
      .prepare(
        "SELECT r.*,u.username FROM discussion_replies r JOIN users u ON u.id=r.user_id WHERE discussion_id=? ORDER BY r.id",
      )
      .all(req.params.id);
    res.json(post);
  });
  app.post("/api/discussions", auth, (req, res) => {
    try {
      const r = db
        .prepare("INSERT INTO discussions(user_id,title,content) VALUES(?,?,?)")
        .run(
          req.user.id,
          text(req.body.title, "标题", 120),
          text(req.body.content, "内容"),
        );
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/discussions/:id/replies", auth, (req, res) => {
    if (!db.prepare("SELECT 1 FROM discussions WHERE id=?").get(req.params.id))
      return res.status(404).json({ error: "讨论不存在" });
    try {
      const r = db
        .prepare(
          "INSERT INTO discussion_replies(discussion_id,user_id,content) VALUES(?,?,?)",
        )
        .run(req.params.id, req.user.id, text(req.body.content, "回复"));
      db.prepare(
        "UPDATE discussions SET updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(req.params.id);
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/discussions/:id", auth, (req, res) => {
    const post = db
      .prepare("SELECT user_id FROM discussions WHERE id=?")
      .get(req.params.id);
    if (!post) return res.status(404).end();
    if (post.user_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "无权删除" });
    db.prepare("DELETE FROM discussions WHERE id=?").run(req.params.id);
    res.status(204).end();
  });
}
