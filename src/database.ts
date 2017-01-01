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
  imageTime:number;
  hash?:string;
  exifTime?:number;
}

export interface Database {
  open(dbpath:string):Promise<void>;
  insertOrUpdateItem(info:FileInfo, exifTime?:number):Promise<number>;
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
  protected abstract findId(item:ImageItem):Promise<number>;
  createItem(info:FileInfo):Promise<ImageItem> {
    return new Promise((resolve, reject) => {
      resolve({
        fullPath: info.fullPath,
        mtime: info.mtime,
        imageTime: info.mtime,
      });
    });
  }
  insertOrUpdateItem(info:FileInfo, exifTime?:number):Promise<number> {
    return new Promise<number>(async (resolve, reject) => {
      const imageItem:ImageItem = await this.createItem(info);
      this.findId(imageItem).then((id) => {
        if (typeof exifTime !== 'undefined') {
          imageItem.exifTime = exifTime;
          imageItem.imageTime = exifTime;
        }
        if (id === -1) {
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
      const SQL_INFO = 'CREATE TABLE IF NOT EXISTS info (id INTEGER PRIMARY KEY, fullPath TEXT UNIQUE, imageTime INGETER, mtime INTEGER, exifTime INTEGER NULL, hash TEXT NULL)';
      this._db.run(SQL_INFO, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
  findId(item:ImageItem):Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const SQL = 'SELECT id FROM info WHERE fullPath = ?';
      this._db.get(SQL, [item.fullPath], (err, res) => {
        if (err) {
          console.log(`findId:${err}`);
          reject(err);
          return;
        }
        if (res) {
          //console.log(`findId:${JSON.stringify(res)}`);
          resolve(res['id']);
        } else {
          resolve(-1);
        }
      });
    });
  }
  updateItem(item:ImageItem):Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let sql = 'UPDATE info SET mtime = $mtime, imageTime = $imageTime';
      const args:any = {
        $mtime: item.mtime,
        $imageTime: item.imageTime
      };
      if (Number.isInteger(item.exifTime)) {
        sql += ', exifTime = $exifTime';
        args.$exifTime = item.exifTime;
        args.$imageTime = item.exifTime;
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
        this.findId(item).then(id => resolve(id));
      });
    });
  }
  insertItem(item:ImageItem):Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let sql, args;
      if (typeof item.exifTime !== 'undefined') {
        sql = 'INSERT INTO info (fullPath, imageTime, mtime, exifTime) values ( $fullPath, $imageTime, $mtime, $exifTime )';
        args = {
          $fullPath: item.fullPath,
          $imageTime: item.imageTime,
          $mtime: item.mtime,
          $exifTime: item.exifTime
        };
      } else {
        sql = 'INSERT INTO info (fullPath, imageTime, mtime) values ( $fullPath, $imageTime, $mtime )';
        args = {
          $fullPath: item.fullPath,
          $imageTime: item.imageTime,
          $mtime: item.mtime
        };
      }
      this._db.run(sql, args, (err) => {
        if (err) {
          reject(err);
          return;
        }
        this.findId(item).then(id => resolve(id));
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
          console.log(`getItems:${item.id},${item.fullPath},${item.imageTime},${item.exifTime}`);
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