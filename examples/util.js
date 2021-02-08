exports.delay = function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

exports.Performance = class Performance {
  timers;
  measures;

  constructor() {
    this.timers = new Map();
    this.measures = new Map();
  }

  mark(key) {
    this.timers.set(key, Date.now());
  }

  measure(key, startKey, endKey) {
    const s = this.timers.get(startKey);
    if (s === undefined) {
      throw new Error(`${startKey} is not defined`);
    }
    const e = this.timers.get(endKey);
    if (e === undefined) {
      throw new Error(`${endKey} is not defined`);
    }
    this.measures.set(key, e - s);
  }

  getEntries() {
    const values = [];
    this.measures.forEach((v, k) => {
      values.push({ name: k, duration: v });
    });
    return values;
  }
};
