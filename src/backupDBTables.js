import { promises as fs } from 'fs';
import { mkdirSync } from "fs";
import path from 'path';
import Log from "./logger.js"

const backupPath = path.resolve("./backup/");

export async function readListFromFile(filename){
  try {
    const data = await fs.readFile(path.join(backupPath, filename), 'utf-8');
    const table = JSON.parse(data);
    if (!table.length) throw new Error(`File ${filename} read success, but the content is empty`);
    Log.info(`✓ File ${filename} has been read successfully!`);
    return table;
  } catch (e) {
    Log.error(e);
    return [];
  }
}
  
export async function writeListToFile(content, filename){
  try {  
    // make sure the folder exists
    mkdirSync(backupPath, { recursive: true });
    return await fs.writeFile(path.join(backupPath, filename), JSON.stringify(content, null, 2), (err) => {
      if (err) return Log.error(`Error writing file ${filename}:`, err);
      Log.info(`✓ File ${filename} has been written successfully!`);
    });
  } catch (e) {
    Log.error(e)
  }
}