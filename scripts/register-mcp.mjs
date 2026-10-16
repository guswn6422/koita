// Claude 데스크톱 앱 설정(claude_desktop_config.json)에 gtt-patent MCP 서버를 등록한다.
// 사용법: node scripts/register-mcp.mjs  (기존 설정은 .bak 파일로 백업)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const file = path.join(process.env.APPDATA, "Claude", "claude_desktop_config.json");

const config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
if (existsSync(file)) copyFileSync(file, `${file}.bak`);

config.mcpServers = {
  ...(config.mcpServers ?? {}),
  "gtt-patent": {
    command: process.execPath,
    args: [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), path.join(root, "mcp", "server.mts")],
  },
};
writeFileSync(file, JSON.stringify(config, null, 2));
console.log(`등록 완료: ${file}`);
console.log(JSON.stringify(config.mcpServers["gtt-patent"], null, 2));
