const {
  deferred,
} = require("../../lib/nats-base-client/internal_mod");

exports.check = function check(
  fn,
  timeout = 5000,
  opts = { interval: 50, name: "" },
) {
  opts = Object.assign(opts, { interval: 50 });

  const d = deferred();
  let timer;
  let to;

  to = setTimeout(() => {
    clearTimeout(to);
    clearInterval(timer);
    const m = opts.name ? `${opts.name} timeout` : "timeout";
    return d.reject(new Error(m));
  }, timeout);

  timer = setInterval(async () => {
    try {
      const v = await fn();
      if (v) {
        clearTimeout(to);
        clearInterval(timer);
        return d.resolve(v);
      }
    } catch (_) {
      // ignore
    }
  }, opts.interval);

  return d;
};
