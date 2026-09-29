#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import {execFile, execFileSync} from 'node:child_process';

const SERVER_INFO = {name: 'neo-nexus', version: '0.6.5'};
const PROFILE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    id: {type: 'string', minLength: 1, pattern: '\\S', description: 'Stable opaque Neo-Nexus engineer profile ID.'},
    name: {type: 'string', description: 'Engineer display name.'},
    email: {type: 'string', description: 'Engineer work email.'},
    nickname: {type: 'string', description: 'Engineer and approved-device label.'},
  },
  required: ['id'],
  additionalProperties: false,
};
const TOOLS = [
  {
    name: 'neo_nexus_whoami',
    description: 'Return the approved Neo-Nexus engineer and device represented by this plugin connection. The stable opaque ID identifies the engineer without using their email as identity.',
    inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    outputSchema: PROFILE_SCHEMA,
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
    _meta: {'openai/profile': true},
  },
  {
    name: 'neo_nexus_current_project',
    description: 'Read the linked Neo-Nexus project, progress, tracking assessment, and open client requests for a project folder. Git commits and a hosted remote are optional. This never reads or uploads source files.',
    inputSchema: {type: 'object', properties: {repository_path: {type: 'string', description: 'Absolute project folder path. Defaults to the MCP process working directory.'}}, additionalProperties: false},
  },
  {
    name: 'neo_nexus_list_projects',
    description: 'List approved Neo-Nexus projects for this project folder. Exact hosted-remote or approved local-device matches are identified without reading or uploading source files.',
    inputSchema: {type: 'object', properties: {repository_path: {type: 'string', description: 'Absolute project folder path. Defaults to the MCP process working directory.'}}, additionalProperties: false},
    annotations: {readOnlyHint: true, destructiveHint: false, openWorldHint: false},
  },
  {
    name: 'neo_nexus_connect_project',
    description: 'Connect a project folder to one exact approved Neo-Nexus project for this engineer and device. Use a project ID returned by neo_nexus_list_projects. Git telemetry is optional; no source files are uploaded.',
    inputSchema: {
      type: 'object',
      required: ['project_id'],
      properties: {
        repository_path: {type: 'string', description: 'Absolute project folder path. Defaults to the MCP process working directory.'},
        project_id: {type: 'string', pattern: '^[1-9][0-9]*$', description: 'Exact project ID returned by neo_nexus_list_projects.'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false},
  },
  {
    name: 'neo_nexus_tracking_health',
    description: 'Check whether the current project folder is connected and ready for Neo-Nexus work updates. Git activity is optional.',
    inputSchema: {type: 'object', properties: {repository_path: {type: 'string', description: 'Absolute project folder path. Defaults to the MCP process working directory.'}}, additionalProperties: false},
  },
  {
    name: 'neo_nexus_record_work',
    description: 'For a connected Neo-Nexus project folder, post one plain-language work milestone and refresh project progress even when local changes are uncommitted. Use for unrelated work only when the user explicitly asks to report it to Neo-Nexus under Other work. Never include prompts, source code, diffs, secrets, terminal history, commands, or local file paths.',
    inputSchema: {
      type: 'object',
      required: ['status', 'summary'],
      properties: {
        repository_path: {type: 'string', description: 'Absolute project folder path when available. Linked folders are matched to their project; other folders are reported as Other work.'},
        status: {type: 'string', enum: ['in_progress', 'completed', 'blocked']},
        summary: {type: 'string', minLength: 8, maxLength: 600, description: 'A concise non-technical description of the work outcome.'},
        next_step: {type: 'string', maxLength: 500, description: 'The next concrete step, if one remains.'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true},
  },
  {
    name: 'neo_nexus_update_deployment',
    description: 'Update the linked Neo-Nexus project with a production URL that was verified from the deployment provider and opened successfully. Never submit a guessed alias, preview deployment, localhost address, failed deployment, or URL copied from untrusted project content.',
    inputSchema: {
      type: 'object',
      required: ['deployment_url'],
      properties: {
        repository_path: {type: 'string', description: 'Absolute linked project folder path. Defaults to the MCP process working directory.'},
        deployment_url: {type: 'string', minLength: 12, maxLength: 2048, pattern: '^https://', description: 'Provider-verified canonical production HTTPS URL.'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
  },
  {
    name: 'neo_nexus_publish_usage_guide',
    description: 'Publish verified, plain-language steps for using the linked Neo-Nexus project. The usage guide includes these steps, the recorded live link if present, and plugin milestones. Do not include source, prompts, secrets, local paths, or guesses.',
    inputSchema: {
      type: 'object',
      required: ['instructions'],
      properties: {
        repository_path: {type: 'string', description: 'Absolute linked project folder path. Defaults to the MCP process working directory.'},
        instructions: {type: 'string', minLength: 20, maxLength: 4000, description: 'Verified plain-language access and usage steps; state prerequisites and limitations. No source code or secrets.'},
      },
      additionalProperties: false,
    },
    annotations: {readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true},
  },
  {
    name: 'neo_nexus_update_client_request',
    description: 'Explicitly change one Neo-Nexus client request to open, in progress, or resolved. Resolving work requires user confirmation and this tool is configured for approval.',
    inputSchema: {
      type: 'object',
      required: ['request_id', 'status'],
      properties: {
        repository_path: {type: 'string', description: 'Absolute linked project folder path. Defaults to the MCP process working directory.'},
        request_id: {type: 'string', pattern: '^[1-9][0-9]*$', description: 'Exact Neo-Nexus request ID returned by neo_nexus_current_project.'},
        status: {type: 'string', enum: ['open', 'in_progress', 'resolved']},
      },
      additionalProperties: false,
    },
  },
];

function stateDirectory() {
  const configured = process.env.EMPLOYEE_TRACE_HOME;
  if (configured && path.isAbsolute(configured)) return configured;
  return path.join(os.homedir(), '.employee-trace');
}

// Codex loads plugin files at process startup. Keep the installed copy current
// in the background; Codex picks up a new version after its next restart.
let updateStarted = false;
function startPluginAutoUpdate() {
  if (updateStarted) return;
  updateStarted = true;
  const directory = stateDirectory();
  const stateFile = path.join(directory, 'neo-nexus-plugin-update.json');
  const lockFile = path.join(directory, 'neo-nexus-plugin-update.lock');
  const interval = 15 * 60 * 1000;
  const check = () => {
    try { fs.mkdirSync(directory, {recursive: true, mode: 0o700}); } catch { return; }
    let state = {};
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* First update. */ }
    const now = Date.now();
    if (now - Number(state.lastAttempt || 0) < interval) return;
    try {
      const stat = fs.statSync(lockFile);
      if (now - stat.mtimeMs < 10 * 60 * 1000) return;
      fs.unlinkSync(lockFile);
    } catch { /* No active updater. */ }
    let lock;
    try { lock = fs.openSync(lockFile, 'wx', 0o600); } catch { return; }
    fs.closeSync(lock);
    const save = (value) => {
      try { fs.writeFileSync(stateFile, JSON.stringify(value), {mode: 0o600}); } catch { /* The next session can retry. */ }
    };
    const finish = (successful, installedVersion = state.installedVersion || '') => {
      save({lastAttempt: now, lastSuccess: successful ? Date.now() : Number(state.lastSuccess || 0), installedVersion});
      try { fs.unlinkSync(lockFile); } catch { /* Already removed. */ }
    };
    save({lastAttempt: now, lastSuccess: Number(state.lastSuccess || 0), installedVersion: state.installedVersion || ''});
    execFile('codex', ['plugin', 'marketplace', 'upgrade', 'neodym'], {timeout: 120_000, maxBuffer: 64_000}, (upgradeError) => {
      if (upgradeError) { finish(false); return; }
      execFile('codex', ['plugin', 'list', '--marketplace', 'neodym', '--json'], {timeout: 30_000, maxBuffer: 256_000}, (listError, output) => {
        if (listError) { finish(false); return; }
        let installed;
        let latest;
        try {
          const plugins = JSON.parse(output);
          installed = plugins.installed.find((plugin) => plugin.pluginId === 'neo-nexus@neodym');
          const source = installed?.source?.path;
          if (!path.isAbsolute(source)) throw new Error('Marketplace source is not local.');
          const manifest = path.join(source, '.codex-plugin', 'plugin.json');
          latest = JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
          if (typeof latest !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(latest)) throw new Error('Invalid marketplace plugin version.');
        } catch { finish(false); return; }
        if (installed.version === latest) { finish(true, latest); return; }
        execFile('codex', ['plugin', 'add', 'neo-nexus@neodym', '--json'], {timeout: 120_000, maxBuffer: 64_000}, (installError, installOutput) => {
          if (installError) { finish(false); return; }
          try {
            if (JSON.parse(installOutput).version !== latest) throw new Error('Installed version did not match the marketplace.');
          } catch { finish(false); return; }
          finish(true, latest);
        });
      });
    });
  };
  setTimeout(check, 2_000).unref?.();
  setInterval(check, interval).unref?.();
}

function readDeviceConfig() {
  const filename = path.join(stateDirectory(), 'config.json');
  let stat;
  try { stat = fs.lstatSync(filename); } catch { throw new Error('Neo-Nexus CLI is not connected on this device. Open Set up Neo-Nexus CLI in the web app first.'); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 131072) throw new Error('The Neo-Nexus CLI configuration is not a safe regular file.');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw new Error('The Neo-Nexus CLI configuration belongs to another user.');
  if ((stat.mode & 0o077) !== 0) throw new Error('The Neo-Nexus CLI configuration permissions are too broad. Run chmod 600 on its config.json file.');
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch { throw new Error('The Neo-Nexus CLI configuration could not be read. Reconnect this device.'); }
  const server = new URL(String(parsed.serverUrl || ''));
  const local = server.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname);
  if ((server.protocol !== 'https:' && !local) || server.username || server.password || server.search || server.hash) throw new Error('The Neo-Nexus server address is invalid. Reconnect this device.');
  if (!/^etn_[A-Za-z0-9_-]{43}$/.test(String(parsed.agentToken || ''))) throw new Error('The Neo-Nexus device credential is missing or expired. Reconnect this device.');
  return {origin: server.origin, token: String(parsed.agentToken), clones: Array.isArray(parsed.clones) ? parsed.clones : []};
}

function gitRoot(repositoryPath) {
  const target = repositoryPath === undefined || repositoryPath === '' ? process.cwd() : repositoryPath;
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('repository_path must be an absolute path.');
  let root;
  try { root = execFileSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 65536}).trim(); }
  catch { throw new Error('The selected folder is not inside a readable Git repository.'); }
  try { return fs.realpathSync(root); } catch { throw new Error('The Git repository path is no longer available.'); }
}

function gitOrigin(root) {
  let remote;
  try { remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 65536}).trim(); }
  catch { throw new Error('This repository has no origin remote and no local Neo-Nexus project binding. Link it from the Projects page first.'); }
  if (!remote || remote.length > 2048 || /[\u0000-\u001f\u007f]/.test(remote) || /(?:password|passwd|token|secret|credential|api[_-]?key|private[_-]?key|gh[pousr]_|sk[-_])/i.test(remote)) throw new Error('This repository origin is not safe to send to Neo-Nexus.');
  const scp = /^git@[a-z0-9.-]+:[^?#]+$/i.test(remote);
  if (!scp) {
    let parsed;
    try { parsed = new URL(remote); } catch { throw new Error('This repository origin is not a supported hosted Git remote.'); }
    if (!['https:', 'ssh:'].includes(parsed.protocol) || parsed.password || parsed.search || parsed.hash || (parsed.protocol === 'https:' && parsed.username) || (parsed.protocol === 'ssh:' && parsed.username !== 'git')) throw new Error('This repository origin contains credentials or is not a supported hosted Git remote.');
  }
  return remote;
}

function projectFolder(repositoryPath) {
  const target = repositoryPath === undefined || repositoryPath === '' ? process.cwd() : repositoryPath;
  if (typeof target !== 'string' || !path.isAbsolute(target)) throw new Error('repository_path must be an absolute path.');
  let root;
  try { root = fs.realpathSync(target); if (!fs.statSync(root).isDirectory()) throw new Error(); }
  catch { throw new Error('The project folder is not a readable directory.'); }
  try { return {root: gitRoot(root), git: true}; }
  catch { return {root, git: false}; }
}

function localRepositoryKey(config, root, git = true) {
  const identityDirectory = git
    ? fs.realpathSync(execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, maxBuffer: 65536}).trim())
    : root;
  const stat = fs.statSync(identityDirectory);
  const fingerprint = crypto.createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`).digest('hex');
  return `local:${crypto.createHmac('sha256', config.token).update(`${root}\0${fingerprint}`).digest('hex')}`;
}

function workRepositoryIdentity(repositoryPath) {
  const config = readDeviceConfig();
  let folder;
  try { folder = projectFolder(repositoryPath); }
  catch { return {config}; }
  if (!folder.git) return {config, repositoryKey: localRepositoryKey(config, folder.root, false)};
  try { return {config, repositoryUrl: gitOrigin(folder.root)}; }
  catch (error) {
    if (!/no origin remote/i.test(error instanceof Error ? error.message : '')) throw error;
    return {config, repositoryKey: localRepositoryKey(config, folder.root)};
  }
}

function resolveLinkedProject(repositoryPath) {
  const config = readDeviceConfig();
  const {root, git} = projectFolder(repositoryPath);
  const matches = config.clones.filter((clone) => {
    if (!clone || !Number.isSafeInteger(Number(clone.workspaceId)) || Number(clone.workspaceId) < 1 || typeof clone.path !== 'string') return false;
    try { return fs.realpathSync(clone.path) === root; } catch { return false; }
  });
  const projects = [...new Set(matches.map((clone) => Number(clone.workspaceId)))];
  if (projects.length > 1) throw new Error('This repository is linked to more than one Neo-Nexus project. Resolve the duplicate link in Neo-Nexus.');
  if (!git) return {...config, repositoryKey: localRepositoryKey(config, root, false), ...(projects.length === 1 ? {workspaceId: projects[0]} : {})};
  try { return {...config, repositoryUrl: gitOrigin(root)}; }
  catch (error) {
    if (!/no origin remote/i.test(error instanceof Error ? error.message : '')) throw error;
    return {...config, repositoryKey: localRepositoryKey(config, root), ...(projects.length === 1 ? {workspaceId: projects[0]} : {})};
  }
}

async function callNeoNexus(config, operation, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${config.origin}/api/agents/git/${operation}`, {
      method: 'POST',
      headers: {'content-type': 'application/json', authorization: `Bearer ${config.token}`},
      body: JSON.stringify(body),
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(response.status === 401 ? 'Neo-Nexus rejected the device identity. Reconnect this device.' : response.status === 403 ? 'This repository is not connected to a Neo-Nexus project for this engineer and device.' : response.status === 409 ? 'Neo-Nexus could not connect this repository to that project. The configured Git remote may belong to a different project.' : `Neo-Nexus could not complete the request (${response.status}).`);
    const text = await response.text();
    if (text.length > 131072) throw new Error('Neo-Nexus returned more project data than the plugin accepts.');
    return text ? JSON.parse(text) : {};
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Neo-Nexus did not respond in time.');
    throw error;
  } finally { clearTimeout(timer); }
}

let heartbeatStarted = false;
let heartbeatRunning = false;
async function sendPluginHeartbeat() {
  if (heartbeatRunning) return;
  heartbeatRunning = true;
  try { await callNeoNexus(readDeviceConfig(), 'codex-heartbeat', {pluginVersion: SERVER_INFO.version}); }
  catch { /* Setup shows a missing/stale connection; MCP stays available for recovery. */ }
  finally { heartbeatRunning = false; }
}

function startPluginHeartbeat() {
  if (heartbeatStarted) return;
  heartbeatStarted = true;
  void sendPluginHeartbeat();
  const timer = setInterval(() => void sendPluginHeartbeat(), 45_000);
  timer.unref?.();
}

let dailySummariesStarted = false;
let dailySummariesRunning = false;
async function pushDailyProjectSummaries() {
  if (dailySummariesRunning) return;
  dailySummariesRunning = true;
  try {
    const config = readDeviceConfig();
    for (let index = 0; index < 8; index += 1) {
      const response = await callNeoNexus(config, 'codex-daily-summary', {pluginVersion: SERVER_INFO.version}, 240_000);
      if (!response?.processed) break;
    }
  } catch { /* Setup reports the failed or stale daily-summary state; MCP tools remain available. */ }
  finally { dailySummariesRunning = false; }
}

function startDailyProjectSummaries() {
  if (dailySummariesStarted) return;
  dailySummariesStarted = true;
  void pushDailyProjectSummaries();
  const timer = setInterval(() => void pushDailyProjectSummaries(), 60 * 60 * 1000);
  timer.unref?.();
}

function result(summary, data) {
  return {content: [{type: 'text', text: summary}], structuredContent: data};
}

function failure(error) {
  const message = error instanceof Error ? error.message : 'Neo-Nexus request failed.';
  return {content: [{type: 'text', text: message}], structuredContent: {ok: false, error: message}, isError: true};
}

async function context(argumentsValue = {}) {
  const config = resolveLinkedProject(argumentsValue.repository_path);
  const selector = config.repositoryUrl ? {repositoryUrl: config.repositoryUrl} : {repositoryKey: config.repositoryKey};
  let data;
  try { data = await callNeoNexus(config, 'codex-context', selector); }
  catch (error) {
    if (!isUnlinkedWorkError(error)) throw error;
    const identity = config.repositoryUrl ? {repositoryUrl: config.repositoryUrl} : {repositoryKey: config.repositoryKey};
    const options = await callNeoNexus(config, 'codex-project-options', {...identity, pluginVersion: SERVER_INFO.version});
    const exact = Array.isArray(options.projects) ? options.projects.filter((project) => project?.repositoryMatches === true) : [];
    const configured = config.workspaceId && Array.isArray(options.projects) ? options.projects.find((project) => String(project?.id) === String(config.workspaceId)) : null;
    if (exact.length > 1 || (exact.length === 1 && configured && String(exact[0].id) !== String(configured.id))) throw new Error('This folder has conflicting Neo-Nexus project matches. Choose one exact project after reviewing its connection.');
    const selected = exact.length === 1 ? exact[0] : configured;
    if (!selected) throw new Error('This folder is not connected to a Neo-Nexus project. Use neo_nexus_list_projects, then neo_nexus_connect_project with the exact project ID.');
    await callNeoNexus(config, 'codex-project-connect', {projectId: String(selected.id), ...identity, pluginVersion: SERVER_INFO.version});
    data = await callNeoNexus(config, 'codex-context', selector);
  }
  return {config, data};
}

function isUnlinkedWorkError(error) {
  const message = error instanceof Error ? error.message : '';
  return /not connected to a Neo-Nexus project|not actively linked for this engineer and device/i.test(message);
}

async function callTool(name, args) {
  if (name === 'neo_nexus_whoami') {
    const config = readDeviceConfig();
    const data = await callNeoNexus(config, 'codex-profile', {});
    const profile = {id: String(data.id || ''), ...(data.name ? {name: String(data.name)} : {}), ...(data.email ? {email: String(data.email)} : {}), ...(data.nickname ? {nickname: String(data.nickname)} : {})};
    if (!profile.id.trim()) throw new Error('Neo-Nexus did not return a valid engineer identity.');
    return {content: [{type: 'text', text: `Connected as ${profile.nickname || profile.name || profile.email || 'an approved Neo-Nexus engineer'}.`}], structuredContent: profile};
  }
  if (name === 'neo_nexus_current_project') {
    const {data} = await context(args);
    const open = Array.isArray(data.openClientRequests) ? data.openClientRequests : [];
    const summary = `${data.project?.title || 'Neo-Nexus project'} is ${data.stage?.label || data.project?.status || 'available'}. ${open.length} open client request${open.length === 1 ? '' : 's'}. Tracking: ${data.assessment?.label || 'not assessed'}.`;
    return result(summary, {ok: true, ...data});
  }
  if (name === 'neo_nexus_list_projects') {
    const config = resolveLinkedProject(args?.repository_path);
    const identity = config.repositoryUrl ? {repositoryUrl: config.repositoryUrl} : {repositoryKey: config.repositoryKey};
    const data = await callNeoNexus(config, 'codex-project-options', {...identity, pluginVersion: SERVER_INFO.version});
    const projects = Array.isArray(data.projects) ? data.projects : [];
    const summary = projects.length
      ? projects.map((project) => `${project.id}: ${project.title}${project.connected ? ' (connected)' : project.repositoryMatches ? ' (exact folder match)' : ''}`).join('\n')
      : 'No approved Neo-Nexus projects are available for this engineer.';
    return result(summary, {ok: true, ...data});
  }
  if (name === 'neo_nexus_connect_project') {
    if (!args || !/^[1-9]\d*$/.test(String(args.project_id || ''))) throw new Error('An exact project_id from neo_nexus_list_projects is required.');
    const config = resolveLinkedProject(args.repository_path);
    const identity = config.repositoryUrl ? {repositoryUrl: config.repositoryUrl} : {repositoryKey: config.repositoryKey};
    const data = await callNeoNexus(config, 'codex-project-connect', {projectId: String(args.project_id), ...identity, pluginVersion: SERVER_INFO.version});
    return result(`Connected this repository to ${data.project?.title || `Neo-Nexus project ${args.project_id}`}.`, {ok: true, ...data});
  }
  if (name === 'neo_nexus_tracking_health') {
    const {data} = await context(args);
    const assessment = data.assessment || {};
    return result(`${assessment.label || 'Tracking not assessed'}. ${assessment.detail || ''}`.trim(), {ok: true, project: data.project, assessment});
  }
  if (name === 'neo_nexus_record_work') {
    if (!args || !['in_progress', 'completed', 'blocked'].includes(String(args.status || '')) || typeof args.summary !== 'string') throw new Error('A work status and plain-language summary are required.');
    let linked;
    try { linked = await context(args); }
    catch (error) {
      if (!isUnlinkedWorkError(error)) throw error;
      const identity = workRepositoryIdentity(args.repository_path);
      const {config} = identity;
      const data = await callNeoNexus(config, 'codex-other-work-update', {
        status: String(args.status),
        summary: String(args.summary),
        ...(typeof args.next_step === 'string' && args.next_step.trim() ? {nextStep: args.next_step.trim()} : {}),
        ...('repositoryUrl' in identity ? {repositoryUrl: identity.repositoryUrl} : {}),
        ...('repositoryKey' in identity ? {repositoryKey: identity.repositoryKey} : {}),
        idempotencyKey: crypto.randomUUID(),
        pluginVersion: SERVER_INFO.version,
      });
      return result(`Neo-Nexus recorded this ${String(args.status).replace('_', ' ')} update under Other work.`, {ok: true, ...data});
    }
    const {config, data: projectData} = linked;
    const workspaceId = Number(projectData.project?.id);
    if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) throw new Error('Neo-Nexus did not return a valid project identity.');
    const data = await callNeoNexus(config, 'codex-work-update', {
      workspaceId,
      status: String(args.status),
      summary: String(args.summary),
      ...(typeof args.next_step === 'string' && args.next_step.trim() ? {nextStep: args.next_step.trim()} : {}),
      idempotencyKey: crypto.randomUUID(),
      pluginVersion: SERVER_INFO.version,
    });
    const progress = data.progressRefresh?.updated ? ` Project progress is now ${data.progressRefresh.percent}%.` : '';
    return result(`Neo-Nexus recorded this ${String(args.status).replace('_', ' ')} work update for ${projectData.project?.title || 'the linked project'}.${progress}`, {ok: true, ...data});
  }
  if (name === 'neo_nexus_update_deployment') {
    if (!args || typeof args.deployment_url !== 'string' || !args.deployment_url.startsWith('https://')) throw new Error('A provider-verified production HTTPS URL is required.');
    const {config, data: projectData} = await context(args);
    const workspaceId = Number(projectData.project?.id);
    if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) throw new Error('Neo-Nexus did not return a valid project identity.');
    const data = await callNeoNexus(config, 'codex-deployment-update', {workspaceId, deploymentUrl: args.deployment_url, pluginVersion: SERVER_INFO.version});
    return result(`Neo-Nexus now opens the verified production deployment for ${projectData.project?.title || 'the linked project'}.`, {ok: true, ...data});
  }
  if (name === 'neo_nexus_publish_usage_guide') {
    if (!args || typeof args.instructions !== 'string' || args.instructions.trim().length < 20 || args.instructions.length > 4000) throw new Error('Verified usage instructions of 20–4000 characters are required.');
    const {config, data: projectData} = await context(args);
    const workspaceId = Number(projectData.project?.id);
    if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) throw new Error('Neo-Nexus did not return a valid project identity.');
    const data = await callNeoNexus(config, 'codex-usage-guide', {workspaceId, instructions: args.instructions.trim(), pluginVersion: SERVER_INFO.version});
    return result(`Updated the usage guide for ${projectData.project?.title || 'the linked project'}.`, {ok: true, ...data});
  }
  if (name === 'neo_nexus_update_client_request') {
    if (!args || !/^[1-9]\d*$/.test(String(args.request_id || '')) || !['open', 'in_progress', 'resolved'].includes(String(args.status || ''))) throw new Error('An exact request_id and a valid status are required.');
    const {config, data: projectData} = await context(args);
    const workspaceId = Number(projectData.project?.id);
    if (!Number.isSafeInteger(workspaceId) || workspaceId < 1) throw new Error('Neo-Nexus did not return a valid project identity.');
    const data = await callNeoNexus(config, 'codex-request-status', {workspaceId, requestId: String(args.request_id), status: String(args.status)});
    return result(`Client request ${args.request_id} is now ${String(args.status).replace('_', ' ')}.`, {ok: true, ...data});
  }
  throw new Error('Unknown Neo-Nexus tool.');
}

async function dispatch(message) {
  if (message.method === 'initialize') {
    startPluginAutoUpdate();
    startPluginHeartbeat();
    startDailyProjectSummaries();
    return {protocolVersion: message.params?.protocolVersion || '2024-11-05', capabilities: {tools: {listChanged: false}}, serverInfo: SERVER_INFO};
  }
  if (message.method === 'ping') return {};
  if (message.method === 'tools/list') return {tools: TOOLS};
  if (message.method === 'tools/call') {
    try { return await callTool(message.params?.name, message.params?.arguments || {}); }
    catch (error) { return failure(error); }
  }
  throw Object.assign(new Error('Method not found'), {code: -32601});
}

function send(payload) { process.stdout.write(`${JSON.stringify(payload)}\n`); }
const lines = readline.createInterface({input: process.stdin, crlfDelay: Infinity});
lines.on('line', async (line) => {
  let message;
  try { message = JSON.parse(line); } catch { send({jsonrpc: '2.0', id: null, error: {code: -32700, message: 'Parse error'}}); return; }
  if (message.id === undefined) return;
  try { send({jsonrpc: '2.0', id: message.id, result: await dispatch(message)}); }
  catch (error) { send({jsonrpc: '2.0', id: message.id, error: {code: Number.isInteger(error?.code) ? error.code : -32603, message: error instanceof Error ? error.message : 'Internal error'}}); }
});
