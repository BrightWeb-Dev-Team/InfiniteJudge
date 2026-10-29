import { auth, admin } from "./auth.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { runSandbox } from "./sandbox.js";
const difficulties = new Set(["入门", "简单", "中等", "困难"]),
  contestTypes = new Set(["ACM", "OI", "IOI", "OIL", "作业"]);
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
  const spj_enabled = body.spj_enabled === true || body.spj_enabled === 1 || body.spj_enabled === "1" ? 1 : 0, spj_source = String(body.spj_source || "");
  const question_type=["programming","single","multiple","judge","objective"].includes(body.question_type)?body.question_type:"programming";
  let objective_items = Array.isArray(body.objective_items) ? body.objective_items.slice(0, 50).map((item) => {
    const type = ["single", "multiple", "judge"].includes(item?.type) ? item.type : "single";
    const options = type === "judge" ? ["正确", "错误"] : (Array.isArray(item?.options) ? item.options.map(String).map((x) => x.trim()).filter(Boolean).slice(0, 20) : []);
    const answer = [...new Set((Array.isArray(item?.answer) ? item.answer : []).map(String))].filter((x) => options.includes(x));
    if (options.length < 2 || !answer.length || (type !== "multiple" && answer.length !== 1)) throw new Error("请正确配置混合客观题小题");
    return { type, options, answer };
  }) : [];
  if (question_type === "objective" && !objective_items.length) throw new Error("混合客观题至少需要一道小题");
  const objective_options=question_type==="judge"?["正确","错误"]:(Array.isArray(body.objective_options)?body.objective_options.map(String).map((x)=>x.trim()).filter(Boolean).slice(0,20):[]);
  const objective_answer=[...new Set((Array.isArray(body.objective_answer)?body.objective_answer:[]).map(String))].filter((x)=>objective_options.includes(x));
  if(question_type!=="programming" && question_type!=="objective" && (objective_options.length<2||!objective_answer.length||(question_type!=="multiple"&&objective_answer.length!==1)))throw new Error("请正确配置客观题选项和答案");
  if (spj_enabled && (!spj_source.trim() || spj_source.length > 131072)) throw new Error("Special Judge 源码不能为空或超过 128 KiB");
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
    description: text(body.description, "完整题面"),
    input_format: String(body.input_format || "已合并到完整题面"),
    output_format: String(body.output_format || "已合并到完整题面"),
    sample_input: String(body.sample_input ?? ""),
    sample_output: String(body.sample_output ?? ""),
    testcases: JSON.stringify(testcases),
    anti_cheat_enabled: body.anti_cheat_enabled === true || body.anti_cheat_enabled === 1 || body.anti_cheat_enabled === "1" ? 1 : 0,
    anti_cheat_limit: Math.max(1, Math.min(100, Number(body.anti_cheat_limit) || 3)),
    integrity_enabled: body.integrity_enabled === true || body.integrity_enabled === 1 || body.integrity_enabled === "1" ? 1 : 0,
    integrity_summary_limit: Math.max(200, Math.min(20000, Number(body.integrity_summary_limit) || 4000)),
    hidden: body.hidden === true || body.hidden === 1 || body.hidden === "1" ? 1 : 0,
    spj_enabled, spj_source,
    question_type,objective_options:JSON.stringify(objective_options),objective_answer:JSON.stringify(objective_answer),objective_items:JSON.stringify(objective_items),
  };
}
async function validateSpj(p) { if (!p.spj_enabled) return; const dir=await mkdtemp(join(tmpdir(),"ij-spj-check-")); try { await writeFile(join(dir,"SpecialJudge.cpp"),p.spj_source); const result=await runSandbox({command:"g++",args:["SpecialJudge.cpp","-O2","-std=c++20","-o","SpecialJudge"],cwd:dir,timeout:30000,sandbox:false}); if(result.code) throw new Error(`Special Judge 编译失败：${(result.err||result.out).slice(0,3000)}`); } finally { await rm(dir,{recursive:true,force:true}); } }
export function mountContent(app, db, publicProblem, domainPerms) {
  const domainPermission = domainPerms.domainPermission;
  // The broad permission wins; otherwise the owner-only variant applies when
  // the viewer created the row.
  const canEdit = (permission, ownPermission, ownerId) => (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "请先登录" });
    if (req.user.role === "root") return next();
    const perms = domainPerms.permissionsFor(req.user, req.domain.id).perms;
    const owns = Number(ownerId(req)) === Number(req.user.id);
    if (!perms[permission] && !(owns && perms[ownPermission])) return res.status(403).json({ error: "当前域没有该权限", permission });
    next();
  };
  const problemDomain = (req) => db.prepare("SELECT domain_id FROM problems WHERE id=?").get(req.params.id)?.domain_id;
  app.get("/api/admin/problems/:id", auth, domainPermission("view_problem", problemDomain), (req, res) => {
    const p = db
      .prepare("SELECT * FROM problems WHERE id=?")
      .get(req.params.id);
    if (!p) return res.status(404).json({ error: "题目不存在" });
    res.json({ ...publicProblem(p, true), testcases: JSON.parse(p.testcases), spj_source: p.spj_source || "", objective_answer: JSON.parse(p.objective_answer || "[]"), objective_items: JSON.parse(p.objective_items || "[]") });
  });
  app.post("/api/admin/problems", auth, domainPermission("create_problem"), async (req, res) => {
    try {
      const p = problemBody(req.body);
      // The domain that granted create_problem, never a header the client controls.
      p.domain_id=req.domain.id;
      p.creator_id=req.user.id;
      await validateSpj(p);
      db.prepare(
        `INSERT INTO problems(id,title,difficulty,tags,time_limit,memory_limit,description,input_format,output_format,sample_input,sample_output,testcases,anti_cheat_enabled,anti_cheat_limit,integrity_enabled,integrity_summary_limit,hidden,spj_enabled,spj_source,question_type,objective_options,objective_answer,objective_items,domain_id,creator_id) VALUES(@id,@title,@difficulty,@tags,@time_limit,@memory_limit,@description,@input_format,@output_format,@sample_input,@sample_output,@testcases,@anti_cheat_enabled,@anti_cheat_limit,@integrity_enabled,@integrity_summary_limit,@hidden,@spj_enabled,@spj_source,@question_type,@objective_options,@objective_answer,@objective_items,@domain_id,@creator_id)`,
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
  app.put("/api/admin/problems/:id", auth, domainPermission("view_problem", problemDomain), canEdit("edit_problem", "edit_own_problem", (req) => db.prepare("SELECT creator_id FROM problems WHERE id=?").get(req.params.id)?.creator_id), async (req, res) => {
    try {
      const p = problemBody({ ...req.body, id: req.params.id });
      await validateSpj(p);
      const r = db
        .prepare(
          `UPDATE problems SET title=@title,difficulty=@difficulty,tags=@tags,time_limit=@time_limit,memory_limit=@memory_limit,description=@description,input_format=@input_format,output_format=@output_format,sample_input=@sample_input,sample_output=@sample_output,testcases=@testcases,anti_cheat_enabled=@anti_cheat_enabled,anti_cheat_limit=@anti_cheat_limit,integrity_enabled=@integrity_enabled,integrity_summary_limit=@integrity_summary_limit,hidden=@hidden,spj_enabled=@spj_enabled,spj_source=@spj_source,question_type=@question_type,objective_options=@objective_options,objective_answer=@objective_answer,objective_items=@objective_items WHERE id=@id`,
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
  app.put("/api/admin/problems/:id/testcases", auth, domainPermission("view_problem", problemDomain), canEdit("edit_problem", "edit_own_problem", (req) => db.prepare("SELECT creator_id FROM problems WHERE id=?").get(req.params.id)?.creator_id), async (req, res) => {
    try {
      const current = db.prepare("SELECT question_type FROM problems WHERE id=?").get(req.params.id);
      if (!current) return res.status(404).json({ error: "题目不存在" });
      if (current.question_type !== "programming") return res.status(400).json({ error: "客观题不需要配置测试点" });
      let testcases = req.body.testcases;
      if (typeof testcases === "string") testcases = JSON.parse(testcases);
      if (!Array.isArray(testcases) || !testcases.length || testcases.some((item) => !Array.isArray(item) || item.length !== 2 || item.some((value) => typeof value !== "string"))) {
        throw new Error("测试点必须是至少一组 [[输入,输出]] 数据");
      }
      const spj_enabled = req.body.spj_enabled === true || req.body.spj_enabled === 1 || req.body.spj_enabled === "1" ? 1 : 0;
      const spj_source = String(req.body.spj_source || "");
      const value = { spj_enabled, spj_source };
      if (spj_enabled) await validateSpj(value);
      db.prepare("UPDATE problems SET testcases=?,spj_enabled=?,spj_source=? WHERE id=?").run(JSON.stringify(testcases), spj_enabled, spj_source, req.params.id);
      res.json({ id: req.params.id, testcases, ...value });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/admin/problems/:id", auth, domainPermission("view_problem", problemDomain), canEdit("edit_problem", "edit_own_problem", (req) => db.prepare("SELECT creator_id FROM problems WHERE id=?").get(req.params.id)?.creator_id), (req, res) => {
    const ids=[req.params.id], marks="?"; let changes=0; db.exec("BEGIN"); try { for(const table of ["submissions","problem_focus_events","contest_problems","contest_hacks","learning_problems"]) db.prepare(`DELETE FROM ${table} WHERE problem_id IN (${marks})`).run(...ids); changes=db.prepare(`DELETE FROM problems WHERE id IN (${marks})`).run(...ids).changes; db.exec("COMMIT"); } catch(e){db.exec("ROLLBACK"); return res.status(400).json({error:e.message});} res.status(changes ? 204 : 404).end();
  });
  app.post("/api/admin/problems/batch-delete", auth, domainPermission("edit_problem"), (req,res)=>{ const ids=[...new Set((Array.isArray(req.body.ids)?req.body.ids:[]).map(String).filter((id)=>/^[A-Za-z0-9_-]{1,24}$/.test(id)))].slice(0,500); if(!ids.length)return res.status(400).json({error:"请选择要删除的题目"}); const marks=ids.map(()=>"?").join(","); let deleted=0; db.exec("BEGIN"); try { for(const table of ["submissions","problem_focus_events","contest_problems","contest_hacks","learning_problems"]) db.prepare(`DELETE FROM ${table} WHERE problem_id IN (${marks})`).run(...ids); deleted=db.prepare(`DELETE FROM problems WHERE id IN (${marks})`).run(...ids).changes; db.exec("COMMIT"); } catch(e){db.exec("ROLLBACK"); return res.status(400).json({error:e.message});} res.json({deleted}); });
  app.post("/api/admin/problems/append-ai-policy", auth, domainPermission("edit_problem"), (req, res) => {
    const marker = "## AI 使用规则";
    const policy = `${marker}\n\n本比赛禁止使用生成式 AI 辅助完成题目。系统会结合代码相似度、提交行为和代码风格变化进行风险筛查；筛查结果仅用于人工复核，不会自动判罚，参赛者可以提交申诉。`;
    // Scoped to the domain that granted edit_problem; omitting the header must never
    // rewrite every domain's problems.
    const result = db.prepare("UPDATE problems SET description=rtrim(description) || '\n\n---\n\n' || ? WHERE domain_id=? AND instr(description,?)=0").run(policy, req.domain.id, marker);
    res.json({ updated: result.changes, policy });
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
      .all(req.params.id).map((p) => { let kinds = {}; try { kinds = JSON.parse(c.problem_kinds || "{}"); } catch {} const personalCount=Number(c.personal_problem_count)||Number(c.team_size)||5; return { ...p, kind: kinds[p.id] || (Number(p.position)<personalCount ? "personal" : "team") }; });
    try {
      const teams = JSON.parse(c.team_assignments || "[]");
      c.team_assignments_text = teams.map((team) => team.map((id) => db.prepare("SELECT username FROM users WHERE id=?").get(id)?.username).filter(Boolean).join(", ")).join("\n");
    } catch { c.team_assignments_text = ""; }
    res.json(c);
  });
  app.get("/api/admin/contest-users", auth, domainPermission("create_contest"), (req, res) => res.json(db.prepare("SELECT u.id,u.username FROM users u JOIN domain_members m ON m.user_id=u.id WHERE m.domain_id=? ORDER BY u.username COLLATE NOCASE").all(req.domain.id)));
  const oilContest = (id) => db.prepare("SELECT * FROM contests WHERE id=? AND type='OIL'").get(id);
  const oilPhase = (c) => {
    const start = new Date(c.starts_at).getTime(), now = Date.now();
    if (now < start) return "before";
    const solvingEnd = start + (Number(c.solving_duration) || 7200) * 1000;
    const hackEnd = solvingEnd + (Number(c.hack_duration) || 3600) * 1000;
    return now < solvingEnd ? "solving" : now < hackEnd ? "hacking" : "ended";
  };
  const oilParticipant = (contestId, userId) => db.prepare("SELECT cp.*,u.username,u.avatar FROM contest_participants cp JOIN users u ON u.id=cp.user_id WHERE cp.contest_id=? AND cp.user_id=?").get(contestId, userId);
  const oilTeam = (contestId, teamNo) => {
    let team = db.prepare("SELECT * FROM contest_team_invites WHERE contest_id=? AND team_no=?").get(contestId, teamNo);
    if (!team) {
      const first = db.prepare("SELECT user_id FROM contest_participants WHERE contest_id=? AND team_no=? ORDER BY joined_at,user_id LIMIT 1").get(contestId, teamNo);
      if (!first) return null;
      const token = randomBytes(18).toString("base64url");
      db.prepare("INSERT INTO contest_team_invites(token,contest_id,team_no,created_by) VALUES(?,?,?,?)").run(token, contestId, teamNo, first.user_id);
      team = db.prepare("SELECT * FROM contest_team_invites WHERE token=?").get(token);
    }
    return team;
  };
  app.post("/api/contests/:id/oil/join", auth, (req, res) => {
    const c = oilContest(req.params.id); if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    const existing = oilParticipant(c.id, req.user.id); if (existing) return res.json(existing);
    if (c.team_mode === "admin") return res.status(403).json({ error: "本比赛由管理员预设队伍，请联系管理员分配" });
    const team = Number(db.prepare("SELECT MAX(team_no) value FROM contest_participants WHERE contest_id=?").get(c.id)?.value || 0) + 1;
    db.prepare("INSERT INTO contest_participants(contest_id,user_id,team_no,seat_no) VALUES(?,?,?,1)").run(c.id, req.user.id, team);
    oilTeam(c.id, team); return res.status(201).json(oilParticipant(c.id, req.user.id));
  });
  app.get("/api/contests/:id/oil/state", auth, (req, res) => {
    const c = oilContest(req.params.id); if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    const participant = oilParticipant(c.id, req.user.id), team = participant && oilTeam(c.id, participant.team_no);
    res.json({ contest: c, phase: oilPhase(c), participant, captainId: team?.created_by || null, participants: db.prepare("SELECT cp.user_id,cp.team_no,cp.seat_no,cp.locked,u.username,u.avatar FROM contest_participants cp JOIN users u ON u.id=cp.user_id WHERE cp.contest_id=? ORDER BY cp.team_no,cp.seat_no").all(c.id) });
  });
  app.post("/api/contests/:id/oil/invite", auth, (req, res) => {
    const c = oilContest(req.params.id), p = c && oilParticipant(c.id, req.user.id);
    if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    if (c.team_mode === "admin") return res.status(403).json({ error: "本比赛已关闭邀请链接组队" });
    if (!p) return res.status(403).json({ error: "请先加入比赛再邀请队友" });
    const invite = oilTeam(c.id, p.team_no);
    res.json({ token: invite.token, teamNo: p.team_no });
  });
  app.post("/api/contests/:id/oil/invite/:token/join", auth, (req, res) => {
    const c = oilContest(req.params.id);
    if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    if (c.team_mode === "admin") return res.status(403).json({ error: "本比赛已关闭邀请链接组队" });
    const invite = db.prepare("SELECT * FROM contest_team_invites WHERE token=? AND contest_id=?").get(req.params.token, c.id);
    if (!invite) return res.status(404).json({ error: "组队链接无效或已失效" });
    const existing = oilParticipant(c.id, req.user.id);
    if (existing) {
      if (existing.team_no !== invite.team_no) return res.status(409).json({ error: "你已经加入了其他队伍" });
      return res.json(existing);
    }
    const size = Number(c.team_size) || 5;
    for (let seat = 1; seat <= size; seat++) {
      try {
        db.prepare("INSERT INTO contest_participants(contest_id,user_id,team_no,seat_no) VALUES(?,?,?,?)").run(c.id, req.user.id, invite.team_no, seat);
        return res.status(201).json(oilParticipant(c.id, req.user.id));
      } catch (_) {}
    }
    res.status(409).json({ error: "该队伍已满" });
  });
  const captainTeam = (contestId, userId) => db.prepare("SELECT * FROM contest_team_invites WHERE contest_id=? AND created_by=?").get(contestId, userId);
  app.put("/api/contests/:id/oil/team/captain", auth, (req, res) => {
    const c = oilContest(req.params.id), team = c && captainTeam(c.id, req.user.id), userId = Number(req.body?.userId);
    if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    if (!team) return res.status(403).json({ error: "只有队长可以转让队长" });
    if (!Number.isInteger(userId) || !db.prepare("SELECT 1 FROM contest_participants WHERE contest_id=? AND team_no=? AND user_id=?").get(c.id, team.team_no, userId)) return res.status(400).json({ error: "请选择本队成员" });
    db.prepare("UPDATE contest_team_invites SET created_by=? WHERE contest_id=? AND team_no=?").run(userId, c.id, team.team_no);
    res.json({ captainId: userId });
  });
  app.delete("/api/contests/:id/oil/team/members/:userId", auth, (req, res) => {
    const c = oilContest(req.params.id), team = c && captainTeam(c.id, req.user.id), userId = Number(req.params.userId);
    if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    if (!team) return res.status(403).json({ error: "只有队长可以移除队员" });
    if (userId === req.user.id) return res.status(400).json({ error: "队长不能踢出自己，请转让队长或解散小队" });
    const target = oilParticipant(c.id, userId);
    if (!target || target.team_no !== team.team_no) return res.status(404).json({ error: "该用户不在你的小队中" });
    if (target.locked) return res.status(409).json({ error: "不能移除已锁定题目的队员" });
    db.prepare("DELETE FROM contest_participants WHERE contest_id=? AND user_id=?").run(c.id, userId);
    res.status(204).end();
  });
  app.delete("/api/contests/:id/oil/team", auth, (req, res) => {
    const c = oilContest(req.params.id), team = c && captainTeam(c.id, req.user.id);
    if (!c) return res.status(404).json({ error: "OIL 比赛不存在" });
    if (!team) return res.status(403).json({ error: "只有队长可以解散小队" });
    if (db.prepare("SELECT 1 FROM contest_participants WHERE contest_id=? AND team_no=? AND locked=1").get(c.id, team.team_no)) return res.status(409).json({ error: "已有队员锁定题目，不能解散小队" });
    db.exec("BEGIN");
    try { db.prepare("DELETE FROM contest_participants WHERE contest_id=? AND team_no=?").run(c.id, team.team_no); db.prepare("DELETE FROM contest_team_invites WHERE contest_id=? AND team_no=?").run(c.id, team.team_no); db.exec("COMMIT"); res.status(204).end(); }
    catch (e) { db.exec("ROLLBACK"); res.status(400).json({ error: e.message }); }
  });
  app.post("/api/contests/:id/oil/lock", auth, (req, res) => {
    const c = oilContest(req.params.id), p = c && oilParticipant(req.params.id, req.user.id); if (!c) return res.status(404).json({ error: "OIL 比赛不存在" }); if (!p) return res.status(403).json({ error: "请先加入比赛" }); if (oilPhase(c) !== "solving") return res.status(409).json({ error: "当前不在锁题阶段" });
    db.prepare("UPDATE contest_participants SET locked=1 WHERE contest_id=? AND user_id=?").run(c.id, req.user.id); res.json(oilParticipant(c.id, req.user.id));
  });
  app.get("/api/contests/:id/oil/problems", auth, (req, res) => {
    const c = oilContest(req.params.id), p = c && oilParticipant(req.params.id, req.user.id); if (!c) return res.status(404).json({ error: "OIL 比赛不存在" }); if (!p) return res.status(403).json({ error: "请先加入比赛" });
    const personal = Number(c.personal_problem_count) || Number(c.team_size) || 5;
    let kinds = {}; try { kinds = JSON.parse(c.problem_kinds || "{}"); } catch {}
    const rows = db.prepare("SELECT p.id,p.title,p.difficulty,cp.position FROM contest_problems cp JOIN problems p ON p.id=cp.problem_id WHERE cp.contest_id=? ORDER BY cp.position").all(c.id).map((x) => {
      const kind = kinds[x.id] || (x.position < personal ? "personal" : "team");
      return { ...x, kind, isPersonal: kind === "personal", isTeam: kind === "team", visible: !p.locked || kind !== "personal", isMystery: Boolean(c.mystery_problem && kind === "mystery") };
    }).filter((x) => x.visible);
    res.json({ phase: oilPhase(c), locked: Boolean(p.locked), problems: rows });
  });
  app.get("/api/contests/:id/oil/chat", auth, (req, res) => {
    const p = oilParticipant(req.params.id, req.user.id); if (!p || !p.locked) return res.status(403).json({ error: "锁题后才能进入团队讨论" });
    res.json(db.prepare("SELECT m.*,u.username,u.avatar FROM contest_messages m JOIN users u ON u.id=m.user_id JOIN contest_participants cp ON cp.contest_id=m.contest_id AND cp.user_id=m.user_id WHERE m.contest_id=? AND cp.team_no=? ORDER BY m.id").all(req.params.id, p.team_no));
  });
  const hackAccess = (contestId, userId) => {
    const contest = oilContest(contestId), participant = contest && oilParticipant(contestId, userId);
    if (!contest) throw new Error("OIL 比赛不存在");
    if (!participant) throw new Error("请先加入比赛");
    if (!participant.locked) throw new Error("锁定个人题后才能 Hack");
    return { contest, participant, phase: oilPhase(contest) };
  };
  app.get("/api/contests/:id/oil/hack-targets", auth, (req, res) => {
    try {
      const { contest, participant, phase } = hackAccess(req.params.id, req.user.id);
      if (!['solving','hacking'].includes(phase)) return res.json({ phase, targets: [] });
      let kinds = {}; try { kinds = JSON.parse(contest.problem_kinds || "{}"); } catch {}
      const personal = Number(contest.personal_problem_count) || Number(contest.team_size) || 5;
      const rows = db.prepare(`SELECT s.id,s.problem_id,s.status,s.score,s.language,s.source,s.created_at,u.username,cp.team_no,cp.seat_no,cpr.position
        FROM submissions s JOIN users u ON u.id=s.user_id
        JOIN contest_participants cp ON cp.contest_id=? AND cp.user_id=s.user_id
        JOIN contest_problems cpr ON cpr.contest_id=? AND cpr.problem_id=s.problem_id
        WHERE (s.contest_id=? OR (s.contest_id IS NULL AND s.created_at>=?)) AND cp.team_no<>?
        ORDER BY s.id DESC`).all(contest.id,contest.id,contest.id,new Date(contest.starts_at).toISOString().slice(0,19).replace('T',' '),participant.team_no);
      const targets = rows.filter((row) => { const kind = kinds[row.problem_id] || (Number(row.position) < personal ? "personal" : "team"); return phase === "solving" ? kind === "personal" && Number(row.seat_no) === Number(participant.seat_no) : kind === "team"; });
      res.json({ phase, targets });
    } catch (error) { res.status(403).json({ error: error.message }); }
  });
  app.post("/api/contests/:id/oil/hacks", auth, (req, res) => {
    try {
      const { contest, participant, phase } = hackAccess(req.params.id, req.user.id);
      const submission = db.prepare(`SELECT s.*,cp.team_no,cp.seat_no,cpr.position FROM submissions s
        JOIN contest_participants cp ON cp.contest_id=? AND cp.user_id=s.user_id
        JOIN contest_problems cpr ON cpr.contest_id=? AND cpr.problem_id=s.problem_id WHERE s.id=?`).get(contest.id,contest.id,req.body.submissionId);
      if (!submission || submission.team_no === participant.team_no) return res.status(400).json({ error: "Hack 目标无效" });
      let kinds = {}; try { kinds = JSON.parse(contest.problem_kinds || "{}"); } catch {}
      const personal = Number(contest.personal_problem_count) || Number(contest.team_size) || 5;
      const kind = kinds[submission.problem_id] || (Number(submission.position) < personal ? "personal" : "team");
      const allowed = phase === "solving" ? kind === "personal" && Number(submission.seat_no) === Number(participant.seat_no) : phase === "hacking" && kind === "team";
      if (!allowed) return res.status(409).json({ error: "当前阶段不允许 Hack 该提交" });
      const input = String(req.body.input || "").slice(0,100000); if (!input.trim()) return res.status(400).json({ error: "请输入 Hack 数据" });
      const result = db.prepare("INSERT INTO contest_hacks(contest_id,attacker_id,target_user_id,problem_id,subtask,phase,status,target_submission_id,input) VALUES(?,?,?,?,?,?,?,?,?)").run(contest.id,req.user.id,submission.user_id,submission.problem_id,String(req.body.subtask||""),phase,"pending",submission.id,input);
      res.status(201).json({ id:Number(result.lastInsertRowid),status:"pending" });
    } catch (error) { res.status(403).json({ error: error.message }); }
  });
  app.post("/api/contests/:id/oil/chat", auth, (req, res) => {
    const p = oilParticipant(req.params.id, req.user.id); if (!p || !p.locked) return res.status(403).json({ error: "锁题后才能发言" }); const content = String(req.body?.content || "").trim(); if (!content || content.length > 2000) return res.status(400).json({ error: "消息不能为空且不能超过 2000 字" });
    const r = db.prepare("INSERT INTO contest_messages(contest_id,user_id,content) VALUES(?,?,?)").run(req.params.id, req.user.id, content); res.status(201).json({ id: Number(r.lastInsertRowid), content });
  });
  const contestBody = (b) => {
    const starts = new Date(b.starts_at);
    if (Number.isNaN(starts.getTime())) throw new Error("开始时间无效");
    const type = text(b.type, "赛制", 12);
    if (!contestTypes.has(type)) throw new Error("赛制无效");
    const oil = type === "OIL";
    const solving_duration = oil ? Math.max(60, Math.min(86400, Number(b.solving_duration) || 7200)) : 0;
    const hack_duration = oil ? Math.max(0, Math.min(86400, Number(b.hack_duration) || 3600)) : 0;
    const selectedProblems = Array.isArray(b.problems) ? b.problems.map(String) : [];
    const problem_kinds = Object.fromEntries(selectedProblems.map((id, index) => {
      const kind = b.problem_kinds && typeof b.problem_kinds === "object" ? b.problem_kinds[id] : "";
      return [id, ["personal", "team", "mystery"].includes(kind) ? kind : (index < (Number(b.personal_problem_count) || 5) ? "personal" : "team")];
    }));
    const hasMystery = Object.values(problem_kinds).includes("mystery");
    const team_mode = oil && ["admin", "invite", "hybrid"].includes(b.team_mode) ? b.team_mode : "invite";
    const seenUsers = new Set(), team_size = oil ? Math.max(1, Math.min(20, Number(b.team_size) || 5)) : 0;
    const team_assignments = oil && team_mode !== "invite" ? String(b.team_assignments_text || "").split(/\r?\n/).map((line) => line.split(/[,，]/).map((name) => name.trim()).filter(Boolean)).filter((team) => team.length).map((names, index) => {
      if (names.length > team_size) throw new Error(`预设队伍 ${index + 1} 超过每队 ${team_size} 人限制`);
      return names.map((username) => {
        const user = db.prepare("SELECT id FROM users WHERE username=?").get(username);
        if (!user) throw new Error(`预设队伍中不存在用户：${username}`);
        if (seenUsers.has(user.id)) throw new Error(`用户 ${username} 被分配到多个队伍`);
        seenUsers.add(user.id); return user.id;
      });
    }) : [];
    return {
      title: text(b.title, "比赛名称", 100),
      type,
      starts_at: starts.toISOString(),
      duration: oil ? Math.ceil((solving_duration + hack_duration) / 60) : Math.max(10, Math.min(10080, Number(b.duration) || 120)),
      description: String(b.description || ""),
      rule_set: oil ? String(b.rule_set || "OIL") : "",
      team_size,
      solving_duration,
      hack_duration,
      personal_problem_count: oil ? Object.values(problem_kinds).filter((kind) => kind === "personal").length : 0,
      team_problem_count: oil ? Object.values(problem_kinds).filter((kind) => kind === "team").length : 0,
      mystery_problem: oil && (hasMystery || b.mystery_problem === true || b.mystery_problem === 1 || b.mystery_problem === "1") ? 1 : 0,
      problem_kinds: JSON.stringify(oil ? problem_kinds : {}),
      team_mode,
      team_assignments: JSON.stringify(team_assignments),
      anti_cheat_disabled: b.anti_cheat_disabled ? 1 : 0,
      problems: Array.isArray(b.problems) ? b.problems : [],
    };
  };
  const setContestProblems = (id, ids) => {
    db.prepare("DELETE FROM contest_problems WHERE contest_id=?").run(id);
    const ins = db.prepare("INSERT INTO contest_problems VALUES(?,?,?)");
    ids.forEach((pid, i) => ins.run(id, pid, i));
  };
  const syncContestTeams = (id, mode, encodedTeams) => {
    const teams = JSON.parse(encodedTeams || "[]");
    if (db.prepare("SELECT 1 FROM contest_participants WHERE contest_id=? AND locked=1").get(id)) throw new Error("已有参赛者锁题，不能修改预设队伍");
    if (mode === "admin") {
      db.prepare("DELETE FROM contest_team_invites WHERE contest_id=?").run(id);
      db.prepare("DELETE FROM contest_participants WHERE contest_id=?").run(id);
    } else if (mode === "hybrid" && teams.length) {
      db.prepare(`DELETE FROM contest_team_invites WHERE contest_id=? AND team_no<=?`).run(id, teams.length);
      db.prepare(`DELETE FROM contest_participants WHERE contest_id=? AND (team_no<=? OR user_id IN (${teams.flat().map(() => "?").join(",") || "NULL"}))`).run(id, teams.length, ...teams.flat());
    }
    const insert = db.prepare("INSERT INTO contest_participants(contest_id,user_id,team_no,seat_no) VALUES(?,?,?,?)");
    teams.forEach((team, teamIndex) => team.forEach((userId, seatIndex) => insert.run(id, userId, teamIndex + 1, seatIndex + 1)));
    teams.forEach((team, teamIndex) => { if (!team.length) return; db.prepare("INSERT INTO contest_team_invites(token,contest_id,team_no,created_by) VALUES(?,?,?,?)").run(randomBytes(18).toString("base64url"), id, teamIndex + 1, team[0]); });
  };
  app.post("/api/admin/contests", auth, domainPermission("create_contest"), (req, res) => {
    try {
      db.exec("BEGIN");
      const c = contestBody(req.body),
        { problems, ...fields } = c,
        r = db
          .prepare(
            "INSERT INTO contests(title,type,starts_at,duration,description,rule_set,team_size,solving_duration,hack_duration,personal_problem_count,team_problem_count,mystery_problem,problem_kinds,anti_cheat_disabled,team_mode,team_assignments,creator_id) VALUES(@title,@type,@starts_at,@duration,@description,@rule_set,@team_size,@solving_duration,@hack_duration,@personal_problem_count,@team_problem_count,@mystery_problem,@problem_kinds,@anti_cheat_disabled,@team_mode,@team_assignments,@creator_id)",
          )
          .run({ ...fields, creator_id: req.user.id });
      setContestProblems(Number(r.lastInsertRowid), problems);
      syncContestTeams(Number(r.lastInsertRowid), c.team_mode, c.team_assignments);
      db.exec("COMMIT");
      res.status(201).json({ id: Number(r.lastInsertRowid), ...c });
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch {}
      res.status(400).json({ error: e.message });
    }
  });
  app.put("/api/admin/contests/:id", auth, canEdit("modify_contest", "modify_own_contest", (req) => db.prepare("SELECT creator_id FROM contests WHERE id=?").get(req.params.id)?.creator_id), (req, res) => {
    try {
      db.exec("BEGIN");
      const c = contestBody(req.body),
        { problems, ...fields } = c,
        r = db
          .prepare(
            "UPDATE contests SET title=@title,type=@type,starts_at=@starts_at,duration=@duration,description=@description,rule_set=@rule_set,team_size=@team_size,solving_duration=@solving_duration,hack_duration=@hack_duration,personal_problem_count=@personal_problem_count,team_problem_count=@team_problem_count,mystery_problem=@mystery_problem,problem_kinds=@problem_kinds,anti_cheat_disabled=@anti_cheat_disabled,team_mode=@team_mode,team_assignments=@team_assignments WHERE id=@id",
          )
          .run({ ...fields, id: req.params.id });
      if (!r.changes) { db.exec("ROLLBACK"); return res.status(404).json({ error: "比赛不存在" }); }
      setContestProblems(req.params.id, problems);
      syncContestTeams(req.params.id, c.team_mode, c.team_assignments);
      db.exec("COMMIT");
      res.json({ id: Number(req.params.id), ...c });
    } catch (e) {
      try { db.exec("ROLLBACK"); } catch {}
      res.status(400).json({ error: e.message });
    }
  });
  app.delete("/api/admin/contests/:id", auth, canEdit("modify_contest", "modify_own_contest", (req) => db.prepare("SELECT creator_id FROM contests WHERE id=?").get(req.params.id)?.creator_id), (req, res) => {
    const r = db.prepare("DELETE FROM contests WHERE id=?").run(req.params.id);
    res.status(r.changes ? 204 : 404).end();
  });
  app.get("/api/discussions", (req, res) =>
    res.json(
      db
        .prepare(
          `SELECT d.id,d.title,d.content,d.created_at,d.updated_at,u.username,COUNT(r.id) replies FROM discussions d JOIN users u ON u.id=d.user_id LEFT JOIN discussion_replies r ON r.discussion_id=d.id WHERE d.domain_id=? GROUP BY d.id ORDER BY d.updated_at DESC`,
        )
        .all(Number(req.headers["x-domain-id"]) || db.prepare("SELECT id FROM domains ORDER BY id LIMIT 1").get()?.id),
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
  app.post("/api/discussions", auth, domainPermission("create_discussion"), (req, res) => {
    try {
      const r = db
        .prepare("INSERT INTO discussions(user_id,title,content,domain_id) VALUES(?,?,?,?)")
        .run(
          req.user.id,
          text(req.body.title, "标题", 120),
          text(req.body.content, "内容"),
          req.domain.id,
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
      .prepare("SELECT user_id,domain_id FROM discussions WHERE id=?")
      .get(req.params.id);
    if (!post) return res.status(404).end();
    const perms = domainPerms.permissionsFor(req.user, post.domain_id).perms;
    if (!perms.delete_discussion && !(post.user_id === req.user.id && perms.delete_own_discussion))
      return res.status(403).json({ error: "无权删除" });
    db.prepare("DELETE FROM discussions WHERE id=?").run(req.params.id);
    res.status(204).end();
  });
}
