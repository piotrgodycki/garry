import figlet from "figlet";
import gradient from "gradient-string";
import pc from "picocolors";

// Brand gradient taken from the design tokens (color.brand.primary and secondary).
const brand = gradient(["#6366f1", "#0ea5e9"]);

/** Big ANSI banner shown at the top of the wizard. */
export function renderBanner(): string {
  const art = figlet.textSync("GARRY", { font: "Standard" });
  return brand.multiline(art);
}

/** One line tagline under the banner. */
export function tagline(): string {
  return pc.dim("AI SDLC orchestrator for multi repo microfrontends");
}

/** A compact stepper line, for example step(2, 5). */
export function stepper(current: number, total: number): string {
  const dots = Array.from({ length: total }, (_, i) =>
    i + 1 <= current ? pc.cyan("●") : pc.dim("○"),
  ).join(pc.dim("──"));
  return `${dots}  ${pc.dim(`step ${current}/${total}`)}`;
}
