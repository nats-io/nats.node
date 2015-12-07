/* jslint node: true */
/* global describe: false, before: false, after: false, it: false */
'use strict';

exports.sleep = function(ms) {
  var start = new Date().getTime(), expire = start + ms;
  while (new Date().getTime() < expire) { }
  return;
};
