import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import tar from 'tar';

const TMP_DIR = './projects';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

export async function cloneFromGitHub(repoUrl, repoName) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Missing GITHUB_TOKEN');

  const apiUrl = repoUrl
    .replace('https://github.com/', 'https://api.github.com/repos/')
    .replace(/\.git$/, '');

  const tarUrl = `${apiUrl}/tarball/main`;
  const dest = path.join(TMP_DIR, repoName);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  console.log(`⬇️  Fetching ${repoName} from GitHub...`);
  const res = await fetch(tarUrl, { headers: { Authorization: `token ${token}` } });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.statusText}`);

  const tarPath = path.join(TMP_DIR, `${repoName}.tar.gz`);
  const file = fs.createWriteStream(tarPath);
  await new Promise((resolve, reject) => {
    res.body.pipe(file);
    res.body.on('error', reject);
    file.on('finish', resolve);
  });

  await tar.x({ file: tarPath, cwd: dest, strip: 1 });
  fs.unlinkSync(tarPath);
  console.log(`✅  ${repoName} unpacked.`);
  return dest;
}
