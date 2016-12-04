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
    fs.readdir(dir, async (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(files);
    });
  });
}