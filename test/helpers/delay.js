exports.check = function check(
  fn,
  timeout = 5000,
  opts = { interval: 50, name: "" },
) {
  opts = Object.assign(opts, { interval: 50 });
  let toHandle;
  const to = new Promise((_, reject) => {
    toHandle = setTimeout(() => {
      const m = opts?.name ? `${opts.name} timeout` : "timeout";
      reject(new Error(m));
    }, timeout);
  });

  const task = new Promise((done) => {
    const i = setInterval(async () => {
      try {
        const v = await fn();
        if (v) {
          clearTimeout(toHandle);
          clearInterval(i);
          done(v);
        }
      } catch (_) {
        console.log(_);
        // ignore
      }
    }, opts?.interval);
  });

  return Promise.race([to, task]);
};
