/** Creates a lock that resolves when it's lock count reaches 0.
 * If a timeout is provided, the lock rejects if it has not unlocked
 * by the specified number of milliseconds (default 1000).
 */
module.exports.Lock = function lock(count = 1, ms = 5000) {
  let methods;
  const promise = new Promise((resolve, reject) => {
    let timer;
    let cancel = () => {
      if (timer) {
        clearTimeout(timer);
      }
    };

    let lock = () => {
      count++;
    };

    let unlock = () => {
      count--;
      if (count === 0) {
        cancel();
        resolve();
      }
    };

    methods = { resolve, reject, lock, unlock, cancel };
    if (ms) {
      timer = setTimeout(() => {
        reject(new Error("timeout"));
      }, ms);
    }
  });
  return Object.assign(promise, methods);
};
