// Minimal stand-in for @cloudflare/containers: forwards containerFetch to the local server.mjs.
// There is no real container, so the raw-port poller path (`ctx.container`) stays undefined.
export class Container {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.scheduled = []; }
  containerFetch(url, init) { return fetch(url.replace('http://container', process.env.CONTAINER_ORIGIN), init); }
  async schedule(when, callback, payload) {
    const s = { taskId: 't' + Math.random().toString(36).slice(2, 10), callback, payload, type: 'scheduled', time: when instanceof Date ? when.getTime() / 1000 : Date.now() / 1000 + when };
    this.scheduled.push(s);
    return s;
  }
  deleteSchedules(name) { this.scheduled = this.scheduled.filter((s) => s.callback !== name); }
  renewActivityTimeout() {}
  async onActivityExpired() {}
}
export const getContainer = (ns, name) => ns.get(name);
