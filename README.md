# Neo-Nexus for Codex

Public Neodym marketplace for the Neo-Nexus engineering plugin.

The plugin lets an approved engineer use Codex to:

- read the Neo-Nexus project connected to the current project folder;
- list approved projects and explicitly connect the current folder to one of them;
- see project progress, tracking health, and open client tasks or issue flags;
- move a client request between open, in progress, and resolved with explicit approval.
- verify which approved engineer and device the plugin is using.
- post plain-language work milestones to the project dashboard as meaningful Codex work is completed;
- refresh project progress conservatively from those verified milestones as they are posted;
- keep the project's live-app link current from a provider-verified production deployment;
- publish verified, plain-language usage steps that remain in the project's automatically refreshed guide;
- file unregistered work under **Other work** only when the engineer explicitly asks to report it to Neo-Nexus.

It reuses the device identity created by the Neo-Nexus setup. The skill applies only when an engineer explicitly requests Neo-Nexus integration or works in a repository already known to be connected to an approved Neo-Nexus project. Editing the Neo-Nexus app alone does not activate it, and it does not run for unrelated Codex work. Employee summaries come from Codex plugin work updates, not Git commits or watched-file activity. It does not upload repository source, diffs, prompts, secrets, terminal history, commands, or local paths.

## Install

Requirements:

- Codex is installed (Git is optional);
- Node.js 18 or newer is available;
- this computer is connected from **Set up Neo-Nexus CLI**;
- Git can reach the public GitHub repository.

Add the marketplace once:

```bash
codex plugin marketplace add neodym29/neo-nexus-codex-plugin
```

Then open Codex, run `/plugins`, select **Neodym Engineering**, open **Neo-Nexus**, and choose **Install plugin**. Start a new chat after installation. An exact hosted-remote or approved local-device folder match connects automatically; otherwise ask the plugin to list projects and connect the folder to the exact project you choose. A folder without Git or a hosted remote can be connected explicitly. Until it is linked, its work stays under **Other work** with a privacy-safe device-scoped identity; Neo-Nexus moves matching updates into the project when the connection is made. No local path is uploaded. A summary recorded from a projectless chat without a folder identity cannot be attributed automatically from its wording alone.

Useful prompts:

- `Show the Neo-Nexus context for this project.`
- `List the Neo-Nexus projects I can connect this repository to.`
- `Connect this repository to project 51.`
- `What client requests should I work on?`
- `Record the meaningful work I completed for this project.`
- `Check Neo-Nexus tracking health for this repo.`
- `Verify and update this project's production deployment link.`

## Update

The plugin checks the Neodym marketplace when its Codex connection starts and every 15 minutes while that connection is running. It installs a new release in the background only when the version changes; no manual upgrade command is needed for subsequent releases. A changed version must be published in the marketplace manifest. Codex loads updated skills and server files after its next restart; an existing chat cannot hot-reload them. If Codex has been closed, the check runs when the plugin connection starts again. The marketplace repository is public; project data remains protected by device and account permissions.

To force an immediate refresh:

```bash
codex plugin marketplace upgrade neodym
```

Restart Codex and start a new chat to use an update immediately after it has been downloaded.

## Access model

The server independently verifies the current device, company, approved engineer account, active project membership, and exact hosted remote or private local-folder identity. Creating a plugin project connection requires an explicit tool approval unless the folder already has one unique exact match. Connections and request-status changes are audited to that engineer and device. Installing the plugin alone never grants project access. Work milestones are recorded from Codex's verified work, including uncommitted changes; the plugin does not upload or independently inspect source files.
