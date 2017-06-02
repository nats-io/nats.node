/* jslint node: true */
'use strict';

var fs = require('fs');

// TODO: add array support
function jsonToYaml(o) {
    var indent = arguments[1] !== undefined ? arguments[1] + '  ' : '';
    var buf = [];
    for (var k in o) {
        if (o.hasOwnProperty(k)) {
            var v = o[k];
            if (Array.isArray(v)) {
                buf.push(indent + k + ' [');
                buf.push(jsonToYaml(v, indent));
                buf.push(indent + ' ]');
            } else if (typeof v === 'object') {
                // don't print a key if it is an array and it is an index
                var kn = Array.isArray(o) ? '' : k;
                buf.push(indent + kn + ' {');
                buf.push(jsonToYaml(v, indent));
                buf.push(indent + ' }');
            } else {
                if (!Array.isArray(o)) {
                    buf.push(indent + k + ': ' + v);
                } else {
                    buf.push(indent + v);
                }
            }
        }
    }
    return buf.join('\n');
}

exports.j = jsonToYaml;

exports.writeFile = function(fn, data) {
    fs.writeFileSync(fn, data);
};
