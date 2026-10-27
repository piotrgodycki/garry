import { createInterface } from "node:readline/promises";
import pc from "picocolors";
import { forgetToken, githubStatus, listRepos, pollDeviceFlow, saveToken, startDeviceFlow } from "../github/connect.js";
import { githubToken } from "../github/env.js";

const HELP = `garry github [status | login [--token <token>] | logout | repos [query]]

Connects Garry to GitHub, for importing repositories and opening pull requests.
login signs in with a code on github.com when GARRY_GITHUB_CLIENT_ID names a
GitHub OAuth app; otherwise it asks for a token (a fine-grained token with
Contents and Pull requests: read and write). The token is kept in
~/.garry/github.json, readable by you only. GARRY_GITHUB_TOKEN in .env.local and
a signed in GitHub CLI (gh) work too.
`;

export async function runGithub(argv: string[]): Promise<void> {
  const [sub = "status", arg] = argv;
  if (sub === "--help" || sub === "-h") return void console.log(HELP);
  if (sub === "status") {
    const s = await githubStatus();
    console.log(s.connected ? pc.green(`Connected as ${s.login} (${s.source === "env" ? "GARRY_GITHUB_TOKEN" : s.source === "gh" ? "GitHub CLI" : "Garry"})`) : pc.yellow(s.error ?? "Not connected. garry github login"));
    return;
  }
  if (sub === "logout") {
    forgetToken();
    console.log("Forgot the token Garry saved. (GARRY_GITHUB_TOKEN and gh stay as they are.)");
    return;
  }
  if (sub === "repos") {
    const token = githubToken();
    if (!token) throw new Error("connect first: garry github login");
    for (const r of await listRepos(token, arg ?? "")) console.log(`${r.fullName.padEnd(40)} ${r.private ? pc.dim("private") : "public "} ${pc.dim(r.description ?? "")}`);
    return;
  }
  if (sub === "login") {
    const i = argv.indexOf("--token");
    if (i >= 0) return void console.log(pc.green(`Connected as ${(await saveToken(argv[i + 1] ?? "")).login}`));
    if (process.env.GARRY_GITHUB_CLIENT_ID) {
      const d = await startDeviceFlow();
      console.log(`Open ${pc.bold(d.verificationUri)} and enter ${pc.bold(d.userCode)}`);
      let wait = d.interval;
      for (const end = Date.now() + d.expiresIn * 1000; Date.now() < end; ) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        const r = await pollDeviceFlow(d.deviceCode);
        if (r.status === "done") return void console.log(pc.green(`Connected as ${r.login}`));
        if (r.status === "slow_down") wait += 5;
        if (r.status === "denied" || r.status === "expired") throw new Error(`sign in ${r.status}`);
      }
      throw new Error("the code expired");
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const token = await rl.question("GitHub token (github.com/settings/personal-access-tokens): ");
    rl.close();
    console.log(pc.green(`Connected as ${(await saveToken(token)).login}`));
    return;
  }
  throw new Error(`unknown subcommand: ${sub}\n\n${HELP}`);
}
