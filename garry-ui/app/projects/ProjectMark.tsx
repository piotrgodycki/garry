import { useState } from "react";

/** The GitHub owner's avatar, or the project's first letter when there is none or it fails to load (offline, for instance). */
export default function ProjectMark({ project }: { project: { name: string; avatar?: string } }) {
  const [broken, setBroken] = useState(false);
  if (project.avatar && !broken) return <img className="projectAvatar" src={project.avatar} alt="" draggable={false} onError={() => setBroken(true)} />;
  return <>{(project.name || "?").slice(0, 1).toUpperCase()}</>;
}
