import { useState } from "react";

/**
 * A project's mark: the avatar of the GitHub owner its repositories live
 * under, or its first letter when there is none (or the picture cannot load,
 * offline for instance).
 */
export default function ProjectMark({ project }: { project: { name: string; avatar?: string } }) {
  const [broken, setBroken] = useState(false);
  if (project.avatar && !broken) return <img className="projectAvatar" src={project.avatar} alt="" draggable={false} onError={() => setBroken(true)} />;
  return <>{(project.name || "?").slice(0, 1).toUpperCase()}</>;
}
