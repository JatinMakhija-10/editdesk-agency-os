import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.EDITDESK_PORT || 4747);
const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

if (fs.existsSync(electronBin)) {
  // Launch full Electron Desktop App with System Tray
  const child = spawn(electronBin, ['.'], {
    cwd: __dirname,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log('Launched EditDesk Desktop App (Electron)');
} else {
  // Launch built-in server + native Windows App Window via Edge/Chrome --app mode
  await startServer({
    port,
    host: '0.0.0.0',
    dbPath: path.join(__dirname, 'data', 'editdesk.db'),
    distDir: path.join(__dirname, 'dist'),
  });

  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = fs.existsSync(edge) ? edge : fs.existsSync(chrome) ? chrome : null;
  if (browser) {
    const profileDir = path.join(__dirname, 'data', 'desktop-shell-profile');
    fs.mkdirSync(profileDir, { recursive: true });
    spawn(
      browser,
      [`--app=http://127.0.0.1:${port}`, `--user-data-dir=${profileDir}`, '--class=EditDesk'],
      { detached: true, stdio: 'ignore' }
    ).unref();
    console.log(`Launched EditDesk Desktop Window (${path.basename(browser)})`);
  }
}
