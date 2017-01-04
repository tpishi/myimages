'use strict';

import fs = require('fs');

export function stat(path:string):Promise<fs.Stats> {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stats);
    });
  });
}

export function readdir(dir:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(files);
    });
  });
}

export function mkdir(path:any) {
  return new Promise((resolve, reject) => {
    fs.mkdir(path, (err) => {
      if (err && err.code !== 'EEXIST') {
        reject(err);
        return;
      }
      resolve();
    });
  });
}