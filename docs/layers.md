# Layers: what agents are given

What an agent knows about your project comes in layers: **project > repository
> service**. Each layer turns skills on (or off again, for what a wider layer
turned on), names the stacks the code is built with and holds the team's own
notes. Set it once for the whole project, change it for one repository, add to
it for one service. An agent working in a repository gets the sum: skills given
to every project, then the project's layer, the repository's, and each service
in it; the stacks; the architecture of the whole project and of the repository;
and the notes. Open **Layers** to change a layer and to see what an agent in a
repository ends up with, down to the exact text it reads. A skill can be
installed for every project or for one project, repository or service (Skills,
Install skill, Who gets it). Agents get the change from their next message.
Kept in the project's registry (`layers.json`), so it travels with an exported
project. Amateurs can leave it alone; teams use it to keep house rules in one
place.

## How the layers add up

- **Skills.** Skills installed for every project come first. Then the project's
  layer, the repository's, and each service in the repository each turn skills
  on. A layer can also turn off a skill that a wider layer turned on. One agent
  works on the whole repository, so a service can only turn a skill off when it
  is the only service there.
- **Stacks.** A repository's stacks replace the project's when it names any.
  Each service adds the stack it is built with (set on the service) and its own.
- **Architecture.** The agent gets the whole project's board, then the
  repository's.
- **Notes.** The agent gets every layer's notes, widest first.

## Where a skill comes from

Garry's pipeline skills (the ones that ship with it) are used by the feature
pipeline. Agents in Build get one only when a layer turns it on. A skill you
install goes to every project unless you pick a project, repository or service
under "Who gets it". You can change that later on its card in Skills.

## The API

```
GET  /api/layers
POST /api/layers {scope: {level: project | repo | service, name?}, layer: {skills, skillsOff, stacks, notes}}
GET  /api/layers/agent?repo=<id>        what an agent in that repository gets
POST /api/skills/install {..., scope?}  a skill for one layer only
POST /api/skills/:name/everywhere {on}
```
