import { useEffect, useState } from "react";
import { api, Contest, Problem } from "./api";
import { Edit3, Plus, Settings2, Trash2, Upload, X } from "lucide-react";
import { handleEditorTab } from "./editor";
import { WheelDateTime } from "./datetime";
import { ObjectiveItemsEditor } from "./objective-editor";
export const emptyProblem = {
  id: "",
  title: "",
  difficulty: "入门",
  tags: "基础",
  time_limit: 1000,
  memory_limit: 256,
  description: "",
  input_format: "",
  output_format: "",
  sample_input: "",
  sample_output: "",
  testcases: '[["1 2","3"]]',
  anti_cheat_enabled: 0,
  anti_cheat_limit: 3,
  hidden: 0,
  spj_enabled: 0,
  spj_source: "",
  question_type: "programming",
  objective_options: ["选项 A", "选项 B"],
  objective_answer: [],
  objective_items: [],
};
const emptyContest = {
  title: "",
  type: "ACM",
  starts_at: "",
  duration: 120,
  description: "",
  rule_set: "OIL",
  team_size: 5,
  solving_duration: 7200,
  hack_duration: 3600,
  personal_problem_count: 5,
  team_problem_count: 5,
  mystery_problem: 1,
  team_mode: "invite",
  team_assignments_text: "",
  problems: [] as string[],
  problem_kinds: {} as Record<string, string>,
  anti_cheat_disabled: 0,
};
export function AdminPage({
  problems,
  reload,
  error,
  mode = "problems",
  createProblem,
  createContest,
  standaloneContest = false,
  onContestSaved,
}: {
  problems: Problem[];
  reload: () => void;
  error: (s: string) => void;
  mode?: "problems" | "contests";
  createProblem?: () => void;
  createContest?: () => void;
  standaloneContest?: boolean;
  onContestSaved?: () => void;
}) {
  const [contests, setContests] = useState<Contest[]>([]),
    [pform, setPform] = useState<any | null>(null),
    [cform, setCform] = useState<any | null>(standaloneContest ? { ...emptyContest } : null),
    [selectedProblems, setSelectedProblems] = useState<string[]>([]),
    [contestUsers, setContestUsers] = useState<Array<{ id: number; username: string }>>([]);
  const loadContests = () => api.contests().then(setContests);
  useEffect(() => {
    void loadContests();
  }, []);
  useEffect(() => { if (cform?.type === "OIL" && !contestUsers.length) api.contestUsers().then(setContestUsers).catch((e) => error(e.message)); }, [cform?.type]);
  async function saveProblem(e: any) {
    e.preventDefault();
    try {
      const body = {
        ...pform,
        tags: String(pform.tags)
          .split(",")
          .map((x: string) => x.trim()),
        testcases: JSON.parse(pform.testcases),
      };
      pform._edit
        ? await api.updateProblem(pform.id, body)
        : await api.createProblem(body);
      setPform(null);
      reload();
    } catch (e: any) {
      error(e.message);
    }
  }
  async function editProblem(p: Problem) {
    try {
      const full = await api.adminProblem(p.id);
      const merged = full.input_format === "已合并到完整题面" ? full.description : `${full.description}\n\n## 输入格式\n\n${full.input_format}\n\n## 输出格式\n\n${full.output_format}${full.sample_input || full.sample_output ? `\n\n## 样例\n\n### 输入\n\n\`\`\`text\n${full.sample_input || ""}\n\`\`\`\n\n### 输出\n\n\`\`\`text\n${full.sample_output || ""}\n\`\`\`` : ""}`;
      setPform({
        ...full,
        description: merged,
        input_format: "已合并到完整题面", output_format: "已合并到完整题面", sample_input: "", sample_output: "",
        tags: full.tags.join(","),
        testcases: JSON.stringify(full.testcases, null, 2),
        _edit: true,
      });
    } catch (e: any) {
      error(e.message);
    }
  }
  function configureTestcases(id: string) {
    history.pushState({}, "", `/problems/${encodeURIComponent(id)}/tests`);
    dispatchEvent(new PopStateEvent("popstate"));
  }
  async function saveContest(e: any) {
    e.preventDefault();
    try {
      const selected = Array.isArray(cform.problems) ? cform.problems : [];
      const kinds = { ...(cform.problem_kinds || {}) };
      selected.forEach((id: string, index: number) => {
        if (!["personal", "team", "mystery"].includes(kinds[id])) {
          kinds[id] = index < Number(cform.personal_problem_count || 0) ? "personal" : "team";
        }
      });
      const body = {
        ...cform,
        problems: selected,
        problem_kinds: kinds,
        starts_at: new Date(cform.starts_at).toISOString(),
      };
      cform.id
        ? await api.updateContest(cform.id, body)
        : await api.createContest(body);
      setCform(null);
      loadContests();
      onContestSaved?.();
    } catch (e: any) {
      error(e.message);
    }
  }
  async function editContest(c: Contest) {
    try {
      const full = await api.contest(c.id),
        d = new Date(full.starts_at);
      setCform({
        ...full,
        starts_at: new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16),
        problems: full.problems?.map((p) => p.id) || [],
        problem_kinds: Object.fromEntries((full.problems || []).map((p: any, index: number) => [p.id, p.kind || (index < Number(full.personal_problem_count || 0) ? "personal" : "team")])),
      });
    } catch (e: any) {
      error(e.message);
    }
  }
  return (
    <section className={`inline-admin${standaloneContest ? " standalone-contest-admin" : ""}`}>
      {mode === "problems" ? (
        <div className="manage-list">
          <div className="problem-batch-bar"><label><input type="checkbox" checked={!!problems.length && selectedProblems.length === problems.length} onChange={(e) => setSelectedProblems(e.target.checked ? problems.map((p) => p.id) : [])} />全选</label><span>已选择 {selectedProblems.length} 题</span><button type="button" className="danger" disabled={!selectedProblems.length} onClick={async()=>{if(!confirm(`确定删除选中的 ${selectedProblems.length} 道题及其提交、比赛和训练关联吗？`))return;try{const result=await api.deleteProblems(selectedProblems);setSelectedProblems([]);reload();alert(`已删除 ${result.deleted} 道题`);}catch(e:any){error(e.message);}}}><Trash2/>批量删除</button></div>
          <button
            className="primary add-btn"
            onClick={() =>
              createProblem
                ? createProblem()
                : setPform({ ...emptyProblem })
            }
          >
            <Plus />
            创建题目
          </button>
          <label className="secondary add-btn problem-import-btn">
            <Upload />
            导入题目包
            <input type="file" accept=".zip,application/zip" hidden onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                const result = await api.importProblems(file);
                alert(`导入完成：新增 ${result.inserted.length} 题，跳过 ${result.skipped.length} 题，失败 ${result.failed.length} 题。${result.remoteOnly ? "\n该包为远程评测题库，需要对应评测插件才能实际评测。" : ""}`);
                reload();
              } catch (e: any) { error(e.message); }
              event.target.value = "";
            }} />
          </label>
          {problems.map((p) => (
            <article key={p.id}>
              <input className="problem-select" type="checkbox" checked={selectedProblems.includes(p.id)} onChange={(e) => setSelectedProblems((ids) => e.target.checked ? [...ids,p.id] : ids.filter((id)=>id!==p.id))} />
              <div>
                <span>{p.id}</span>
                <b>{p.title}</b>
                <small>
                  {p.difficulty} · {p.tags.join(" / ")}
                </small>
              </div>
              <button title="编辑" onClick={() => editProblem(p)}>
                <Edit3 />
              </button>
              {p.question_type === "programming" && <button title="测试点设置" onClick={() => configureTestcases(p.id)}>
                <Settings2 />
              </button>}
              <button
                title="删除"
                onClick={async () => {
                  if (confirm(`删除 ${p.id}？`))
                    try {
                      await api.deleteProblem(p.id);
                      reload();
                    } catch (e: any) {
                      error(e.message);
                    }
                }}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="manage-list">
          <button
            type="button"
            className="primary add-btn"
            onClick={() => createContest ? createContest() : setCform({ ...emptyContest })}
          >
            <Plus />
            创建比赛
          </button>
          {contests.map((c) => (
            <article key={c.id}>
              <div>
                <span>#{c.id}</span>
                <b>{c.title}</b>
                <small>
                  {c.type} · {new Date(c.starts_at).toLocaleString()}
                </small>
              </div>
              <button title="编辑" onClick={() => editContest(c)}>
                <Edit3 />
              </button>
              <button
                title="删除"
                onClick={async () => {
                  if (confirm(`删除 ${c.title}？`)) {
                    await api.deleteContest(c.id);
                    loadContests();
                  }
                }}
              >
                <Trash2 />
              </button>
            </article>
          ))}
        </div>
      )}
      {pform && (
        <Modal close={() => setPform(null)}>
          <form className="content-form" onSubmit={saveProblem}>
            <h2>{pform._edit ? "编辑题目" : "创建题目"}</h2>
            <div className="form-grid">
              <Field label="题号">
                <input
                  disabled={pform._edit}
                  value={pform.id}
                  onChange={(e) => setPform({ ...pform, id: e.target.value })}
                />
              </Field>
              <Field label="标题">
                <input
                  value={pform.title}
                  onChange={(e) =>
                    setPform({ ...pform, title: e.target.value })
                  }
                />
              </Field>
              <Field label="难度">
                <select
                  value={pform.difficulty}
                  onChange={(e) =>
                    setPform({ ...pform, difficulty: e.target.value })
                  }
                >
                  {["入门", "简单", "中等", "困难"].map((x) => (
                    <option>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="标签（逗号分隔）">
                <input
                  value={pform.tags}
                  onChange={(e) => setPform({ ...pform, tags: e.target.value })}
                />
              </Field>
              <Field label="时间限制 ms">
                <input
                  type="number"
                  value={pform.time_limit}
                  onChange={(e) =>
                    setPform({ ...pform, time_limit: +e.target.value })
                  }
                />
              </Field>
              <Field label="内存限制 MB">
                <input
                  type="number"
                  value={pform.memory_limit}
                  onChange={(e) =>
                    setPform({ ...pform, memory_limit: +e.target.value })
                  }
                />
              </Field>
            </div>
            <label className="check-row"><input type="checkbox" checked={!!pform.hidden} onChange={(e) => setPform({ ...pform, hidden: e.target.checked ? 1 : 0 })} />隐藏题目（仅管理员和 Root 可见）</label>
            <label className="check-row"><input type="checkbox" checked={!!pform.anti_cheat_enabled} onChange={(e) => setPform({ ...pform, anti_cheat_enabled: e.target.checked ? 1 : 0 })} />开启反作弊（监控切屏）</label>
            {pform.anti_cheat_enabled && <Field label="切屏次数上限"><input type="number" min="1" max="100" value={pform.anti_cheat_limit || 3} onChange={(e) => setPform({ ...pform, anti_cheat_limit: +e.target.value })} /></Field>}
            {["description"].map((k) => (
              <Field
                label={
                  (
                    {
                      description: "完整题面（Markdown，请在正文内编写题目描述、输入格式、输出格式和样例）",
                      testcases: "测试点 JSON",
                    } as any
                  )[k]
                }
              >
                <textarea
                  rows={k === "description" ? 22 : 8}
                  value={pform[k]}
                  onChange={(e) => setPform({ ...pform, [k]: e.target.value })}
                  onKeyDown={(e) =>
                    handleEditorTab(e, pform[k], (next) =>
                      setPform({ ...pform, [k]: next })
                    )
                  }
                />
              </Field>
            ))}
            <Field label="题型"><select value={pform.question_type || "programming"} onChange={(e)=>setPform({...pform,question_type:e.target.value,objective_options:e.target.value==="judge"?["正确","错误"]:pform.objective_options,objective_answer:[],objective_items:e.target.value==="objective"&&!(pform.objective_items||[]).length?[{type:"single",options:["选项 A","选项 B"],answer:[]}]:pform.objective_items})}><option value="programming">编程题</option><option value="objective">客观题（可混合）</option></select></Field>
            {pform.question_type === "objective" && <ObjectiveItemsEditor items={pform.objective_items || []} onChange={(objective_items)=>setPform({...pform,objective_items})}/>}
            <button className="primary">保存题目</button>
          </form>
        </Modal>
      )}
      {cform && (
        <Modal close={() => setCform(null)} standalone={standaloneContest}>
          <form className="content-form contest-editor-form" onSubmit={saveContest}>
            <h2>{cform.id ? "编辑比赛" : "创建比赛"}</h2>
            <section className="contest-form-section">
            <h3>基础信息</h3>
            <Field label="比赛名称">
              <input
                value={cform.title}
                onChange={(e) => setCform({ ...cform, title: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="赛制">
                <select
                  value={cform.type}
                  onChange={(e) => setCform({ ...cform, type: e.target.value })}
                >
                  {["ACM", "OI", "IOI", "OIL", "作业"].map((x) => (
                    <option>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="时长（分钟）">
                <input
                  type="number"
                  value={cform.duration}
                  onChange={(e) =>
                    setCform({ ...cform, duration: +e.target.value })
                  }
                />
              </Field>
            </div>
            </section>
            {cform.type === "OIL" && (
              <section className="contest-form-section">
                <h3>OIL 赛制设置</h3>
                <div className="form-grid">
                  <Field label="组队方式"><select value={cform.team_mode || "invite"} onChange={(e) => setCform({ ...cform, team_mode: e.target.value })}><option value="admin">仅管理员预设</option><option value="invite">仅邀请链接</option><option value="hybrid">预设 + 邀请链接</option></select></Field>
                  <Field label="每队人数"><input type="number" min="1" value={cform.team_size} onChange={(e) => setCform({ ...cform, team_size: +e.target.value })} /></Field>
                  <Field label="个人题数量"><input type="number" min="0" value={cform.personal_problem_count} onChange={(e) => setCform({ ...cform, personal_problem_count: +e.target.value })} /></Field>
                  <Field label="团队题数量"><input type="number" min="1" value={cform.team_problem_count} onChange={(e) => setCform({ ...cform, team_problem_count: +e.target.value })} /></Field>
                  <Field label="做题阶段（秒）"><input type="number" min="60" value={cform.solving_duration} onChange={(e) => setCform({ ...cform, solving_duration: +e.target.value })} /></Field>
                  <Field label="公开 Hack 阶段（秒）"><input type="number" min="0" value={cform.hack_duration} onChange={(e) => setCform({ ...cform, hack_duration: +e.target.value })} /></Field>
                </div>
                {cform.team_mode !== "invite" && <Field label="预设队伍（每行一队，用户名用逗号分隔）"><textarea rows={7} placeholder={"alice, bob, carol\ndave, eve"} value={cform.team_assignments_text || ""} onChange={(e) => setCform({ ...cform, team_assignments_text: e.target.value })} /><small className="field-help">可用用户：{contestUsers.map((user) => user.username).join("、") || "正在加载..."}</small></Field>}
                <label className="check-row"><input type="checkbox" checked={!!cform.mystery_problem} onChange={(e) => setCform({ ...cform, mystery_problem: e.target.checked ? 1 : 0 })} />包含神秘题（200 分，禁止 Hack）</label>
              </section>
            )}
            <section className="contest-form-section">
            <h3>时间与说明</h3>
            <Field label="开始时间">
              <WheelDateTime value={cform.starts_at} onChange={(value) => setCform({ ...cform, starts_at: value })} />
            </Field>
            <Field label="说明">
              <textarea
                value={cform.description}
                onChange={(e) =>
                  setCform({ ...cform, description: e.target.value })
                }
                onKeyDown={(e) =>
                  handleEditorTab(e, cform.description, (next) =>
                    setCform({ ...cform, description: next })
                  )
                }
              />
            </Field>
            </section>
            <section className="contest-form-section contest-problem-section">
            <h3>题目配置</h3>
            <Field label="包含题目">
              <label className="check-row"><input type="checkbox" checked={!!cform.anti_cheat_disabled} onChange={(e) => setCform({ ...cform, anti_cheat_disabled: e.target.checked ? 1 : 0 })} />本比赛关闭题目反作弊</label>
              <div className="problem-checks">
                {problems.map((p, index) => (
                  <label>
                    <input
                      type="checkbox"
                      checked={cform.problems.includes(p.id)}
                      onChange={(e) =>
                        setCform({
                          ...cform,
                          problems: e.target.checked
                            ? [...cform.problems, p.id]
                            : cform.problems.filter((x: string) => x !== p.id),
                        })
                      }
                    />
                    {p.id} {p.title}{cform.type === "OIL" && <select className="contest-problem-kind" aria-label={`${p.id} 题目类型`} value={cform.problem_kinds?.[p.id] || (cform.problems.indexOf(p.id) < Number(cform.personal_problem_count || 0) ? "personal" : "team")} onClick={(e) => e.stopPropagation()} onChange={(e) => { const kind = e.target.value; setCform({ ...cform, mystery_problem: kind === "mystery" ? 1 : cform.mystery_problem, problem_kinds: { ...(cform.problem_kinds || {}), [p.id]: kind } }); }}><option value="personal">个人题</option><option value="team">团队题</option><option value="mystery">神秘题（200 分）</option></select>}
                  </label>
                ))}
              </div>
            </Field>
            </section>
            <button className="primary">保存比赛</button>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Field({ label, children }: { label: string; children: any }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Modal({ close, children, standalone = false }: { close: () => void; children: any; standalone?: boolean }) {
  return (
    <div className={`modal-bg${standalone ? " modal-page" : ""}`}>
      <div className="manage-modal">
        {!standalone && <button className="modal-close" onClick={close}>
          <X />
        </button>}
        {children}
      </div>
    </div>
  );
}
