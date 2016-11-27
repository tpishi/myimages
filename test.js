'use strict';

const fs = require('fs');
const crypto = require('crypto');

function dir(path) {
  const paths = [];
  const files = fs.readdirSync(path);
  files.forEach((name) => {
    const fullPath = path + '/' + name;
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      Array.prototype.push.apply(paths, dir(fullPath));
    } else if (fullPath.endsWith('.JPG') ||
               fullPath.endsWith('.jpg') ||
               fullPath.endsWith('.JPEG') ||
               fullPath.endsWith('.jpeg')) {
      paths.push(fullPath);
    }
  });
  return paths;
}

function calcHash(path) {
  const hash = crypto.createHash('sha1');
  const buffer = fs.readFileSync(path);
  hash.update(buffer);
  return hash.digest().toString('hex');
}

function createHashTable(files) {
  const table = {};
  files.forEach((path, index) => {
    console.log('creating hash:' + index + '/' + files.length);
    const hash = calcHash(path);
    if (!(hash in table)) {
      table[hash] = [];
    }
    table[hash].push(path);
  });
  return table;
}

const files = dir(process.argv[2]);
console.log('files:' + files.length);
const table = createHashTable(files);
let hash;
for (hash in table) {
  if (table[hash].length >= 2) {
    let message = 'hash:' + hash;
    table[hash].forEach((path) => {
      message = message + ':' + path;
    });
    console.log(message);
  }
}