'use strict';

import fs = require('fs');

export interface Database {
  open(dbpath:string);
  getThumbnailDirectory(realDirectory:string);
  getItems();
  getItem(key:string);
  putItem(key:string, value:any);
  commit();
}

export interface ImageItem {
  fullPath:string;
  mtime:number;
  hash?:string;
  localTime?:number;
}

export class JSONDatabase implements Database {
  private _dbpath:string;
  private _dirMap:Map<string,string>;
  private _reverseDirMap:Map<string,string>;
  private _allItems:Map<string,any>;
  open(dbpath:string) {
    this._dbpath = dbpath;
    this.load();
  }
  getThumbnailDirectory(realDirectory:string) {
    if (!this._dirMap.has(realDirectory)) {
      let loop = true;
      let suggestion;
      while (loop) {
        loop = false;
        suggestion = ('0000000' + (Math.floor(Math.random() * 0x7fffffff).toString(16))).slice(-8);
        if (this._reverseDirMap.has(suggestion)) {
          loop = true;
        }
      }
      this._dirMap.set(realDirectory, suggestion);
      this._reverseDirMap.set(suggestion, realDirectory);
      //console.log(`added:${dir}:${this.dirMap.get(dir)}`);
    }
    return this._dirMap.get(realDirectory);
  }
  getItems() {
    return this._allItems;
  }
  getItem(key:string) {
    return this._allItems.get(key);
  }
  putItem(key:string, value:ImageItem) {
    this._allItems.set(key, value);
  }
  commit() {
    const obj = {
      _dirMap: [...this._dirMap],
      _allItems: [...this._allItems],
    };
    fs.writeFileSync(this._dbpath, JSON.stringify(obj));
  }
  private load() {
    try {
      const buffer = fs.readFileSync(this._dbpath);
      const obj = JSON.parse(buffer.toString('utf-8'));
      this._dirMap = new Map<string, string>(obj._dirMap);
      this._reverseDirMap = new Map<string, string>();
      for (let key of this._dirMap.keys()) {
        this._reverseDirMap.set(this._dirMap.get(key), key);
      }
      this._allItems = new Map<string, any>(obj._allItems);
    } catch (err) {
      this._dirMap = new Map();
      this._reverseDirMap = new Map();
      this._allItems = new Map();
    }
  }
}
