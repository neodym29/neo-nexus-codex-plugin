# Neo-Nexus for Codex

Private Neodym marketplace for the Neo-Nexus engineering plugin.

The plugin lets an approved engineer use Codex to:

- read the Neo-Nexus project connected to the current Git checkout;
- see project progress, tracking health, and open client tasks or issue flags;
- move a client request between open, in progress, and resolved with explicit approval.
- verify which approved engineer and device the plugin is using.

It reuses the device identity created by the Neo-Nexus Trace CLI. It does not upload repository source, diffs, prompts, terminal history, or local paths.

## Install

Requirements:

- Codex and Git are installed;
- Node.js 18 or newer is available;
- this computer is connected from **Set up Neo-Nexus CLI**;
- the current checkout is linked to a Neo-Nexus project and Trace is started;
- the GitHub account can read this private repository.

Add the marketplace once:

```bash
codex plugin marketplace add neodym29/neo-nexus-codex-plugin
```

Then open Codex, run `/plugins`, select **Neodym Engineering**, open **Neo-Nexus**, and choose **Install plugin**. Start a new chat in the project repository after installation.

Useful prompts:

- `Show the Neo-Nexus context for this project.`
- `What client requests should I work on?`
- `Check Neo-Nexus tracking health for this repo.`

## Update

Refresh the marketplace with:

```bash
codex plugin marketplace upgrade neodym
```

Restart Codex and start a new chat after installing an update.

## Access model

The server independently verifies the current device, company, approved engineer account, active project membership, and approved repository binding. Each request-status change is audited to that engineer and device. Installing the plugin alone never grants project access.
