import { EventEmitter } from "node:events";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
export class PluginRuntime {
  constructor(app, db, root) {
    this.app = app;
    this.db = db;
    this.root = root;
    this.events = new EventEmitter();
    this.settings = new Map();
    this.ui = new Map();
  }
  Route(name, path, Handler) {
    const runtime = this;
    this.app.all(path, async (req, res, next) => {
      try {
        const h = new Handler();
        Object.assign(h, {
          ctx: runtime,
          request: req,
          response: {},
          args: { ...req.params, ...req.query, ...req.body },
          user: req.user,
        });
        const method = req.method === "GET" ? "get" : "post";
        if (h.prepare) await h.prepare(h.args);
        if (h[method]) await h[method](h.args);
        await runtime.events.emit("handler/after/" + name + "#" + method, h);
        if (h.response.redirect) return res.redirect(h.response.redirect);
        res.status(h.response.status || 200).json(h.response.body ?? {});
      } catch (e) {
        next(e);
      }
    });
  }
  on(name, fn) {
    this.events.on(name, fn);
  }
  emit(name, ...args) {
    return this.events.emit(name, ...args);
  }
  injectUI(slot, name, value) {
    if (!this.ui.has(slot)) this.ui.set(slot, new Map());
    this.ui.get(slot).set(name, value);
  }
  interval(fn, ms) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }
  collection(name) {
    return {
      find: () => [],
      findOne: () => null,
      insertOne: (doc) =>
        this.db
          .prepare("INSERT INTO plugin_data(plugin,key,value) VALUES(?,?,?)")
          .run(name, crypto.randomUUID(), JSON.stringify(doc)),
    };
  }
  async load() {
    let dirs = [];
    try {
      dirs = await readdir(this.root, { withFileTypes: true });
    } catch {
      return [];
    }
    const loaded = [];
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      try {
        const pkg = JSON.parse(
            await readFile(join(this.root, d.name, "package.json"), "utf8"),
          ),
          entry = resolve(this.root, d.name, pkg.main || "index.js"),
          mod = await import(pathToFileURL(entry).href);
        if (typeof mod.apply !== "function")
          throw new Error("Missing apply(ctx)");
        await mod.apply(this);
        loaded.push({
          name: pkg.name || d.name,
          version: pkg.version || "0.0.0",
        });
      } catch (e) {
        loaded.push({ name: d.name, error: e.message });
      }
    }
    return loaded;
  }
}
