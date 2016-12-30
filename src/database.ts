'use strict';

import fs = require('fs');
import path = require('path');
import * as sqlite3 from 'sqlite3';

const MAX_FILES_PER_DIRECTORY = 32768;

export interface FileInfo {
  fullPath:string;
  mtime:number;
}

export interface ImageItem extends FileInfo {
  thumbnailDir:string;
  hash?:string;
  localTime?:number;
}

export interface Database {
  open(dbpath:string):Promise<void>;
  insertOrUpdateItem(info:FileInfo, localTime?:number):Promise<number>;
  getItems():Promise<any>;
  getItem(id:number):Promise<ImageItem>;
  updateItem(item:ImageItem):Promise<number>;
  getThumbnailPath(id:number):string;
}

abstract class DatabaseImpl implements Database {
  protected _dbpath:string;
  abstract open(dbpath:string):Promise<void>;
  abstract getItems():Promise<Map<string,ImageItem>>;
  abstract getItem(id:number):Promise<ImageItem>;
  abstract updateItem(item:ImageItem):Promise<number>;
  protected abstract insertItem(value:ImageItem):Promise<number>;
  protected abstract existsItem(item:ImageItem):Promise<boolean>;
  createItem(info:FileInfo):Promise<ImageItem> {
    return new Promise((resolve, reject) => {
      resolve({
        fullPath: info.fullPath,
        mtime: info.mtime,
      });
    });
  }
  insertOrUpdateItem(info:FileInfo, localTime?:number):Promise<number> {
    return new Promise<number>(async (resolve, reject) => {
      const imageItem:ImageItem = await this.createItem(info);
      this.existsItem(imageItem).then((exists) => {
        if (!exists) {
          if (typeof localTime !== 'undefined') {
            imageItem.localTime = localTime;
          }
          this.insertItem(imageItem).then((key) => {
            resolve(key);
          });
        } else {
          this.updateItem(imageItem).then((key) => {
            resolve(key);
          });
        }
      });
    });
  }
  protected getIdFromThumbnailPath(thumbnailPath:string):number {
    const parent = parseInt(thumbnailPath.slice(0, 4), 16);
    const name = parseInt(thumbnailPath.slice(5, 9), 16);
    const id = parent*MAX_FILES_PER_DIRECTORY + name;
    //console.log(`getIdFromThumbnailPath:${thumbnailPath},${id}`);
    return id;
  }
  getThumbnailPath(id:number):string {
    const parent = ('0000' + Math.floor(id / MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
    const name = ('0000' + (id % MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
    return parent + path.sep + name + '.webp';
  }
}

function makeThumbnailPath(id:number):string {
  const parent = ('0000' + Math.floor(id / MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
  const name = ('0000' + (id % MAX_FILES_PER_DIRECTORY).toString(16)).slice(-4);
  return parent + path.sep + name + '.webp';
}

export class SQLiteDatabase extends DatabaseImpl {
  private _db;
  open(dbpath:string):Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._db = new sqlite3.Database(dbpath);
      const SQL_INFO = 'CREATE TABLE IF NOT EXISTS info (id INTEGER PRIMARY KEY, thumbnailDir TEXT, fullPath TEXT UNIQUE, mtime INTEGER, localTime INTEGER NULL, hash TEXT NULL)';
      this._db.run(SQL_INFO, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  existsItem(item:ImageItem):Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      const SQL = 'SELECT COUNT(*) FROM info WHERE fullPath = ?';
      this._db.get(SQL, [item.fullPath], (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        //console.log('res:' + JSON.stringify(res));
        resolve(res['COUNT(*)'] !== 0);
      });
    });
  }
  updateItem(item:ImageItem):Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let sql = 'UPDATE info SET mtime = $mtime';
      const args:any = {
        $mtime: item.mtime
      };
      if (Number.isInteger(item.localTime)) {
        sql += ' , localTime = $localTime';
        args.$localTime = item.localTime;
      }
      if (item.hash) {
        sql += ' , hash = $hash';
        args.$hash = item.hash;
      }
      sql += ' WHERE fullPath = $fullPath';
      args.$fullPath = item.fullPath;
      //console.log('SQL:' + sql);
      //console.log('args:' + JSON.stringify(args));
      this._db.run(sql, args, (err) => {
        if (err) {
          console.log('run:err:' + err);
          reject(err);
          return;
        }
        const SQL = 'SELECT id, thumbnailDir FROM info WHERE fullPath = $fullPath';
        const args2 = {$fullPath: item.fullPath};
        this._db.all(SQL, args2, (err, rows) => {
          if (err) {
            //console.log('SQL:' + SQL);
            //console.log('args2:' + args2);
            console.log('all:err:' + err);
            reject(err);
            return;
          }
          //console.log(`updateItem:rows = ${JSON.stringify(rows)}`);
          resolve(rows[0].id);
        });
      });
    });
  }
  insertItem(item:ImageItem):Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let sql, args;
      if (typeof item.localTime !== 'undefined') {
        sql = 'INSERT INTO info (fullPath, mtime, localTime) values ( $fullPath, $mtime, $localTime )';
        args = {
          $fullPath: item.fullPath,
          $mtime: item.mtime,
          $localTime: item.localTime
        };
      } else {
        sql = 'INSERT INTO info (fullPath, mtime) values ( $fullPath, $mtime )';
        args = {
          $fullPath: item.fullPath,
          $mtime: item.mtime
        };
      }
      // WARN: do not use arrow function, since we need to obtain lastID from special this object
      this._db.run(sql, args, function (err) {
        if (err) {
          reject(err);
          return;
        }
        //console.log(`insertItem:lastID = ${this.lastID}`);
        resolve(this.lastID);
      });
    });
  }
  getItems():Promise<Map<string,ImageItem>> {
    return new Promise<Map<string,ImageItem>>((resolve, reject) => {
      console.log('getItems()');
      const SQL = 'SELECT * FROM info';
      this._db.all(SQL, (err,rows) => {
        if (err) {
          console.log('reject:' + err);
          reject(err);
          return;
        }
        //console.log(JSON.stringify(rows));
        const map = new Map();
        rows.forEach((item) => {
          map.set(item.id, item);
          //console.log(`getItems:${item.id},${item.fullPath}`);
        });
        //console.log('getItems:' + JSON.stringify(map));
        //process.exit(1);
        resolve(map);
      });
    });
  }
  getItem(id:number):Promise<ImageItem> {
    return new Promise<ImageItem>((resolve, reject) => {
      const SQL = 'SELECT * FROM info WHERE id = ?';
      this._db.get(SQL, [id], (err,row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }
}