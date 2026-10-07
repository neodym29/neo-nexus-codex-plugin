const REMOTE_MAX = 2048;
const REPOSITORY_KEY_MAX = 1024;

function invalid() {
  // Never echo a potentially credential-bearing remote in an error or log.
  throw new Error('This repository origin contains credentials or is not a supported hosted Git remote.');
}

function validHost(value) {
  const host = value.toLowerCase();
  if (host.startsWith('[') || host.endsWith(']')) {
    if (!(host.startsWith('[') && host.endsWith(']'))) return false;
    try {
      const parsed = new URL(`http://${host}/`);
      return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']');
    } catch { return false; }
  }
  if (/^[0-9.]+$/.test(host)) {
    const octets = host.split('.');
    return octets.length === 4 && octets.every(octet => /^(?:0|[1-9][0-9]{0,2})$/.test(octet) && Number(octet) <= 255);
  }
  if (host.length > 253) return false;
  const labels = host.split('.');
  return labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function validateRepository(hostname, port, pathname, transport) {
  const host = hostname.toLowerCase();
  if (!validHost(host) || host === 'localhost' || host.endsWith('.local') || /^127\.|^0\.|^\[?::1\]?$/.test(host)) invalid();
  const hadGitSuffix = /\.git\/?$/i.test(pathname);
  const repository = pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  if (!repository || repository.length > REPOSITORY_KEY_MAX || !/^[A-Za-z0-9._~+-]+(?:\/[A-Za-z0-9._~+-]+)+$/.test(repository)) invalid();
  const parts = repository.split('/');
  if (parts.some(part => part === '.' || part === '..')) invalid();
  if (['github.com', 'bitbucket.org'].includes(host) && parts.length !== 2) invalid();
  if (host === 'gitlab.com' && (repository.includes('/-/') || parts.slice(2).some(part => ['issues', 'pull', 'pulls', 'tree', 'blob', 'commit', 'commits', 'merge_requests'].includes(part.toLowerCase())))) invalid();
  if (transport === 'https' && !['github.com', 'bitbucket.org', 'gitlab.com'].includes(host) && !hadGitSuffix) invalid();
  if (`${host}${port ? `:${port}` : ''}/${repository}`.length > REPOSITORY_KEY_MAX) invalid();
}

/** Validate URL fields and hosted repository structure, never generic product-name words. */
export function assertSafeGitRemote(remote) {
  if (typeof remote !== 'string' || !remote || remote.length > REMOTE_MAX || remote !== remote.trim()
    || /[\u0000-\u0020\u007f\s\\?#%]/.test(remote)
    || /(?:^|\/)\.\.?(?:\/|$)/.test(remote)
    // Actual secret-shaped values remain unsafe even if hidden in a path/host.
    || /(?:gh[pousr]_[A-Za-z0-9_-]{16,}|sk[-_][A-Za-z0-9_-]{16,})/i.test(remote)) invalid();
  const scp = /^git@([a-z0-9.-]+):([^?#]+)$/i.exec(remote);
  if (scp) {
    validateRepository(scp[1], '', scp[2], 'ssh');
    return remote;
  }
  if (!/^(?:https|ssh):\/\//i.test(remote)) invalid();
  let parsed;
  try { parsed = new URL(remote); } catch { return invalid(); }
  const authority = remote.slice(remote.indexOf('://') + 3).split('/')[0];
  if (parsed.search || parsed.hash || parsed.password) invalid();
  if (parsed.protocol === 'https:') {
    if (parsed.username || authority.includes('@')) invalid();
    validateRepository(parsed.hostname, parsed.port, parsed.pathname, 'https');
  } else if (parsed.protocol === 'ssh:') {
    if (parsed.username !== 'git' || !authority.startsWith('git@')) invalid();
    validateRepository(parsed.hostname, parsed.port, parsed.pathname, 'ssh');
  } else invalid();
  return remote;
}
