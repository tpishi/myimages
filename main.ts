'use strict';

import fs = require('fs');
import crypto = require('crypto');
import http = require('http');
import Rx = require('rxjs/Rx');

function dir(path:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.readdir(path, async (err, files) => {
      if (err) {
        reject(err);
        return;
      }
      const promises = [];
      files.forEach((file) => {
        promises.push(stat(path + '/' + file));
      });
      const paths:Array<string[]> = await Promise.all(promises);
      const all = [];
      paths.forEach((result) => {
        Array.prototype.push.apply(all, result);
      });
      resolve(all);
    });
  });
}

function stat(path:string):Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    fs.stat(path, async (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      if (stats.isDirectory()) {
        resolve(await dir(path));
      } else if (path.endsWith('.jpg') ||
                 path.endsWith('.JPG') ||
                 path.endsWith('.jpeg') ||
                 path.endsWith('.JPEG')) {
        resolve([path]);
      } else {
        resolve([]);
      }
    });
  });
}

async function calcHash(path) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const hash = crypto.createHash('sha1');
      const data = fs.readFileSync(path);
      hash.update(data);
      resolve(hash.digest().toString('hex'));
    }, 0);
  });
}

stat(process.argv[2]).then((files) => {
  let processing:number = 0;
  let total:number = files.length;
  const observer = Rx.Observable.create(async (obs) => {
    // Here, forEach cannot be used.
    for (let file of files) {
      obs.next({
        path: file,
        hash: await calcHash(file)
      });
    }
    obs.complete();
    return () => {
      console.log('disposed');
    };
  });
  observer.subscribe((x) => {
    processing++;
  }, (err) => {
    console.log('error');
  }, () => {
    console.log('complete');
  });
  http.createServer((request, response) => {
    response.write('hello:' + processing + '/' + total);
    response.end();
  }).listen(8080);
});

