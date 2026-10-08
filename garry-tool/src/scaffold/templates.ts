import { type ScaffoldOptions, stackString } from "./options.js";

export interface GeneratedFile {
  path: string;
  content: string;
}

/** Renders all files for a new microfrontend service. */
export function renderService(opts: ScaffoldOptions): GeneratedFile[] {
  const isHost = opts.kind === "shell";
  const files: GeneratedFile[] = [
    { path: "package.json", content: packageJson(opts) },
    { path: "tsconfig.json", content: tsconfig() },
    { path: "vite.config.ts", content: viteConfig(opts, isHost) },
    { path: "index.html", content: indexHtml(opts) },
    { path: "src/main.ts", content: mainTs() },
    { path: "src/bootstrap.tsx", content: bootstrapTsx() },
    { path: "src/App.tsx", content: appTsx(opts, isHost) },
    { path: "AGENTS.md", content: agentsMd(opts, isHost) },
    { path: ".gitignore", content: gitignore() },
    { path: ".garry/README.md", content: garryReadme() },
    { path: ".garry/service.json", content: serviceJson(opts) },
  ];
  return files;
}

function serviceJson(o: ScaffoldOptions): string {
  // Lets `garry sync` know which service this repo is and where the registry lives.
  return JSON.stringify({ name: o.name, kind: o.kind, registry: o.registry }, null, 2) + "\n";
}

function packageJson(o: ScaffoldOptions): string {
  const pkg = {
    name: o.name,
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: { dev: "vite", build: "vite build", preview: "vite preview" },
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: {
      "@module-federation/vite": "^1.0.0",
      "@vitejs/plugin-react": "^4.3.0",
      typescript: "^5.6.0",
      vite: "^5.4.0",
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

function tsconfig(): string {
  const cfg = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
    },
    include: ["src"],
  };
  return JSON.stringify(cfg, null, 2) + "\n";
}

function viteConfig(o: ScaffoldOptions, isHost: boolean): string {
  const fed = isHost
    ? `    federation({
      name: "${o.name}",
      remotes: {},
      shared: ["react", "react-dom"],
    }),`
    : `    federation({
      name: "${o.name}",
      filename: "remoteEntry.js",
      exposes: {
        "./App": "./src/App.tsx",
      },
      shared: ["react", "react-dom"],
    }),`;

  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

// Module Federation 2.0 runtime. The remotes and exposes here are reconciled
// with the contract in the registry by the mf-wiring skill (garry sync).
export default defineConfig({
  plugins: [
    react(),
${fed}
  ],
  build: { target: "esnext" },
});
`;
}

function indexHtml(o: ScaffoldOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${o.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;
}

function mainTs(): string {
  return `// Module Federation needs an async boundary before the app imports shared
// singletons, so the real entry lives in bootstrap.
import("./bootstrap");
`;
}

function bootstrapTsx(): string {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
`;
}

function appTsx(o: ScaffoldOptions, isHost: boolean): string {
  const role = isHost ? "shell host" : "remote";
  return `export default function App() {
  return (
    <main>
      <h1>${o.name}</h1>
      <p>Garry scaffolded ${role} (${stackString(o)}).</p>
    </main>
  );
}
`;
}

function agentsMd(o: ScaffoldOptions, isHost: boolean): string {
  const role = isHost
    ? "This service is the shell host. It consumes remotes declared in the registry."
    : "This service is a remote. It exposes modules declared in the registry.";
  return `# ${o.name}

${role}

- Owner: ${o.owner}
- Stack: ${stackString(o)}
- Kind: ${o.kind}

## How to work here

- This repository is isolated. You never read other services directly.
- The contracts you may rely on live in \`.garry/contracts/\` and are injected by
  \`garry sync\` from the Contract Registry. Treat them as the source of truth.
- Contract first: if a change needs a new or different contract, it is updated in
  the registry before any code here changes.
- Keep everything in English with plain ASCII punctuation.
`;
}

function gitignore(): string {
  return `node_modules/
dist/
.env
.env.*
*.log
.DS_Store
`;
}

function garryReadme(): string {
  return `# .garry

This directory is managed by Garry. \`garry sync\` writes the slice of contracts
this service may rely on (remotes, shared dependencies, design tokens, events)
plus the generated types. Do not edit it by hand.
`;
}
