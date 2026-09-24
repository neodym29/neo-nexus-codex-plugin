# Neo-Nexus for Codex

Private Neodym marketplace for the Neo-Nexus engineering plugin.

The plugin lets an approved engineer use Codex to:

- read the Neo-Nexus project connected to the current Git checkout;
- list approved projects and explicitly connect the current repository to one of them;
- see project progress, tracking health, and open client tasks or issue flags;
- move a client request between open, in progress, and resolved with explicit approval.
- verify which approved engineer and device the plugin is using.
- post plain-language work milestones to the project dashboard as meaningful Codex work is completed;
- refresh project progress conservatively from those verified milestones as they are posted;
- keep the project's live-app link current from a provider-verified production deployment;
- file work from unregistered repositories and projectless chats under **Other work**.

It reuses the device identity created by the Neo-Nexus setup. Employee summaries come from Codex plugin work updates, not Git commits or watched-file activity. It does not upload repository source, diffs, prompts, secrets, terminal history, commands, or local paths.

## Install

Requirements:

- Codex and Git are installed;
- Node.js 18 or newer is available;
- this computer is connected from **Set up Neo-Nexus CLI**;
- the GitHub account can read this private repository.

Add the marketplace once:

```bash
codex plugin marketplace add neodym29/neo-nexus-codex-plugin
```

Then open Codex, run `/plugins`, select **Neodym Engineering**, open **Neo-Nexus**, and choose **Install plugin**. Start a new chat after installation. An exact configured Git-remote match connects automatically; otherwise ask the plugin to list projects and connect the repository to the exact project you choose. Connected repositories are grouped under their projects; all other meaningful engineering chats are summarized under **Other work**.

Useful prompts:

- `Show the Neo-Nexus context for this project.`
- `List the Neo-Nexus projects I can connect this repository to.`
- `Connect this repository to project 51.`
- `What client requests should I work on?`
- `Record the meaningful work I completed for this project.`
- `Check Neo-Nexus tracking health for this repo.`
- `Verify and update this project's production deployment link.`

## Update

Refresh the marketplace with:

```bash
codex plugin marketplace upgrade neodym
```

Restart Codex and start a new chat after installing an update.

## Access model

The server independently verifies the current device, company, approved engineer account, active project membership, and exact repository remote. Creating a plugin project connection requires an explicit tool approval unless the project already has one unique exact remote match. Connections and request-status changes are audited to that engineer and device. Installing the plugin alone never grants project access.
