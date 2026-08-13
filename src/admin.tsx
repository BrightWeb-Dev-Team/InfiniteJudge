import { useEffect, useState } from "react";
import { api, Contest, Problem } from "./api";
import { Edit3, Plus, Trash2, Upload, X } from "lucide-react";
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
};
const emptyContest = {
  title: "",
  type: "ACM",
  starts_at: "",
  duration: 120,
  description: "",
  problems: [] as string[],
};
export function AdminPage({
  problems,
  reload,
  error,
  mode = "problems",
  createProblem,
}: {
  problems: Problem[];
  reload: () => void;
  error: (s: string) => void;
  mode?: "problems" | "contests";
  createProblem?: () => void;
}) {
  const [contests, setContests] = useState<Contest[]>([]),
    [pform, setPform] = useState<any | null>(null),
    [cform, setCform] = useState<any | null>(null);
  const loadContests = () => api.contests().then(setContests);
  useEffect(() => {
    void loadContests();
  }, []);
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
      setPform({
        ...full,
        tags: full.tags.join(","),
        testcases: JSON.stringify(full.testcases, null, 2),
        _edit: true,
      });
    } catch (e: any) {
      error(e.message);
    }
  }
  async function saveContest(e: any) {
    e.preventDefault();
    try {
      const body = {
        ...cform,
        starts_at: new Date(cform.starts_at).toISOString(),
      };
      cform.id
        ? await api.updateContest(cform.id, body)
        : await api.createContest(body);
      setCform(null);
      loadContests();
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
      });
    } catch (e: any) {
      error(e.message);
    }
  }
  return (
    <section className="inline-admin">
      {mode === "problems" ? (
        <div className="manage-list">
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
            className="primary add-btn"
            onClick={() => setCform({ ...emptyContest })}
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
            {[
              "description",
              "input_format",
              "output_format",
              "sample_input",
              "sample_output",
              "testcases",
            ].map((k) => (
              <Field
                label={
                  (
                    {
                      description: "题目描述（Markdown）",
                      input_format: "输入格式（Markdown）",
                      output_format: "输出格式（Markdown）",
                      sample_input: "样例输入",
                      sample_output: "样例输出",
                      testcases: "测试点 JSON",
                    } as any
                  )[k]
                }
              >
                <textarea
                  rows={k === "description" ? 10 : k === "testcases" ? 6 : 4}
                  value={pform[k]}
                  onChange={(e) => setPform({ ...pform, [k]: e.target.value })}
                />
              </Field>
            ))}
            <button className="primary">保存题目</button>
          </form>
        </Modal>
      )}
      {cform && (
        <Modal close={() => setCform(null)}>
          <form className="content-form" onSubmit={saveContest}>
            <h2>{cform.id ? "编辑比赛" : "创建比赛"}</h2>
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
                  {["ACM", "OI", "IOI", "作业"].map((x) => (
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
            <Field label="开始时间">
              <input
                type="datetime-local"
                value={cform.starts_at}
                onChange={(e) =>
                  setCform({ ...cform, starts_at: e.target.value })
                }
              />
            </Field>
            <Field label="说明">
              <textarea
                value={cform.description}
                onChange={(e) =>
                  setCform({ ...cform, description: e.target.value })
                }
              />
            </Field>
            <Field label="包含题目">
              <div className="problem-checks">
                {problems.map((p) => (
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
                    {p.id} {p.title}
                  </label>
                ))}
              </div>
            </Field>
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
function Modal({ close, children }: { close: () => void; children: any }) {
  return (
    <div className="modal-bg">
      <div className="manage-modal">
        <button className="modal-close" onClick={close}>
          <X />
        </button>
        {children}
      </div>
    </div>
  );
}
