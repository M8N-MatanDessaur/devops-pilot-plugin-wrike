/**
 * Wrike Plugin -- Server-side API Routes
 * Proxies Wrike REST API v4.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const API_BASE = 'https://www.wrike.com/api/v4';
const configPath = path.join(__dirname, 'config.json');

function getCfg() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch (_) { return { accessToken: '' }; }
}
function saveCfg(data) { fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8'); }

function wrikeRequest(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + apiPath);
    const opts = {
      hostname: url.hostname, path: url.pathname + url.search,
      method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    };
    const req = https.request(opts, (resp) => {
      let data = '';
      resp.on('data', c => { data += c; });
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: resp.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

module.exports = function ({ addPrefixRoute, json, readBody }) {
  addPrefixRoute(async (req, res, url, subpath) => {
    var method = req.method;
    try {

      // ── Config ─────────────────────────────────────────────────────────
      if (subpath === '/config' && method === 'GET') {
        var cfg = getCfg();
        return json(res, { configured: !!cfg.accessToken, accessToken: cfg.accessToken || '', accessTokenSet: !!cfg.accessToken });
      }
      if (subpath === '/config' && method === 'POST') {
        var body = await readBody(req);
        var cfg = getCfg();
        if (body.accessToken !== undefined) cfg.accessToken = body.accessToken;
        saveCfg(cfg);
        return json(res, { ok: true });
      }
      if (subpath === '/test' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { ok: false, error: 'Not configured' });
        try {
          var r = await wrikeRequest('GET', '/contacts?me=true', cfg.accessToken);
          if (r.status === 200 && r.data && r.data.data) return json(res, { ok: true, user: r.data.data[0] });
          return json(res, { ok: false, error: 'Auth failed (status ' + r.status + ')' });
        } catch (e) { return json(res, { ok: false, error: e.message }); }
      }

      // ── Spaces ─────────────────────────────────────────────────────────
      if (subpath === '/spaces' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/spaces', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Folders & Projects ─────────────────────────────────────────────
      // Returns ONLY top-level folders/projects in a space (not the full recursive tree)
      if (subpath === '/folders' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var spaceId = url.searchParams.get('spaceId');
        var parentId = url.searchParams.get('parentId');
        if (!spaceId && !parentId) return json(res, []);

        if (parentId) {
          // Get children of a specific folder
          var r = await wrikeRequest('GET', '/folders/' + parentId + '/folders', cfg.accessToken);
          return json(res, r.data.data || [], r.status);
        }

        // Get all folders in a space, then filter to only top-level ones
        // Top-level = folders whose scope is the space (they have no parent within the results that is also in the space)
        var r = await wrikeRequest('GET', '/spaces/' + spaceId + '/folders', cfg.accessToken);
        var all = r.data.data || [];
        // Build a set of all folder IDs
        var idSet = {};
        all.forEach(function (f) { idSet[f.id] = true; });
        // Top-level: folders whose parentIds either don't exist in the set, or are empty
        var topLevel = all.filter(function (f) {
          if (!f.parentIds || !f.parentIds.length) return true;
          // If none of the parent IDs are in our folder set, it's top-level within this space
          return !f.parentIds.some(function (pid) { return idSet[pid]; });
        });
        return json(res, topLevel, r.status);
      }

      // ── Search Tasks ─────────────────────────────────────────────────────
      if (subpath === '/tasks/search' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var q = url.searchParams.get('q') || '';
        if (!q) return json(res, []);
        var limit = url.searchParams.get('limit') || '20';
        var params = '?title=' + encodeURIComponent(q) + '&pageSize=' + limit + '&sortField=UpdatedDate&sortOrder=Desc';
        var r = await wrikeRequest('GET', '/tasks' + params, cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── My Tasks (assigned to current user) ────────────────────────────
      if (subpath === '/tasks/mine' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        // Get my contact ID
        var meR = await wrikeRequest('GET', '/contacts?me=true', cfg.accessToken);
        var me = (meR.data.data || [])[0];
        if (!me) return json(res, { error: 'Could not determine current user' }, 500);
        var status = url.searchParams.get('status') || '';
        var limit = url.searchParams.get('limit') || '50';
        var params = '?responsibles=' + encodeURIComponent('["' + me.id + '"]') + '&pageSize=' + limit + '&sortField=UpdatedDate&sortOrder=Desc&fields=' + encodeURIComponent('["parentIds"]');
        if (status) params += '&status=' + encodeURIComponent(status);
        // Support spaceId filter -- not natively supported with responsibles, so we fetch all mine then filter
        var r = await wrikeRequest('GET', '/tasks' + params, cfg.accessToken);
        var myTasks = r.data.data || [];
        var spaceId = url.searchParams.get('spaceId');
        if (spaceId && myTasks.length) {
          // Get folders in this space to filter tasks by parentId
          var spFolders = (await wrikeRequest('GET', '/spaces/' + spaceId + '/folders', cfg.accessToken)).data.data || [];
          var spFolderIds = {};
          spFolders.forEach(function(f) { spFolderIds[f.id] = true; });
          myTasks = myTasks.filter(function(t) {
            return (t.parentIds || []).some(function(pid) { return spFolderIds[pid]; });
          });
        }
        return json(res, myTasks, 200);
      }

      // ── Tasks ──────────────────────────────────────────────────────────
      if (subpath === '/tasks' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var folderId = url.searchParams.get('folderId');
        var spaceId = url.searchParams.get('spaceId');
        var status = url.searchParams.get('status');
        var limit = url.searchParams.get('limit') || '100';
        var fields = encodeURIComponent('["parentIds","responsibleIds"]');
        var params = '?pageSize=' + limit + '&sortField=UpdatedDate&sortOrder=Desc&descendants=true&fields=' + fields;
        if (status) params += '&status=' + encodeURIComponent(status);

        if (folderId) {
          // Tasks in a specific folder (with descendants)
          var r = await wrikeRequest('GET', '/folders/' + folderId + '/tasks' + params, cfg.accessToken);
          return json(res, r.data.data || [], r.status);
        }

        if (spaceId) {
          // Get ONLY the root-level folders of this space, then fetch tasks from each
          var allFolders = (await wrikeRequest('GET', '/spaces/' + spaceId + '/folders', cfg.accessToken)).data.data || [];
          var idSet = {};
          allFolders.forEach(function(f) { idSet[f.id] = true; });
          var roots = allFolders.filter(function(f) {
            if (!f.parentIds || !f.parentIds.length) return true;
            return !f.parentIds.some(function(pid) { return idSet[pid]; });
          });
          // Fetch tasks from root folders only (descendants=true gets all nested tasks)
          var allTasks = [];
          // Limit to first 10 root folders to avoid too many API calls
          var rootsToCheck = roots.slice(0, 10);
          for (var rf of rootsToCheck) {
            var fr = await wrikeRequest('GET', '/folders/' + rf.id + '/tasks' + params, cfg.accessToken);
            allTasks = allTasks.concat(fr.data.data || []);
          }
          // Deduplicate
          var seen = {};
          allTasks = allTasks.filter(function(t) { if (seen[t.id]) return false; seen[t.id] = true; return true; });
          allTasks.sort(function(a, b) { return (b.updatedDate || '').localeCompare(a.updatedDate || ''); });
          return json(res, allTasks.slice(0, parseInt(limit)), 200);
        }

        // No filter -- global tasks
        var r = await wrikeRequest('GET', '/tasks' + params, cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // GET /tasks/<id>
      var taskMatch = subpath.match(/^\/tasks\/([^/]+)$/);
      if (taskMatch && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/tasks/' + taskMatch[1], cfg.accessToken);
        var task = (r.data.data || [])[0] || null;
        return json(res, task, r.status);
      }

      // POST /tasks (create in folder)
      if (subpath === '/tasks' && method === 'POST') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var body = await readBody(req);
        var folderId = body.folderId;
        if (!folderId) return json(res, { error: 'folderId required' }, 400);
        delete body.folderId;
        var r = await wrikeRequest('POST', '/folders/' + folderId + '/tasks', cfg.accessToken, body);
        return json(res, (r.data.data || [])[0] || r.data, r.status);
      }

      // PUT /tasks/<id>
      if (taskMatch && method === 'PUT') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var body = await readBody(req);
        var r = await wrikeRequest('PUT', '/tasks/' + taskMatch[1], cfg.accessToken, body);
        return json(res, (r.data.data || [])[0] || r.data, r.status);
      }

      // DELETE /tasks/<id>
      if (taskMatch && method === 'DELETE') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('DELETE', '/tasks/' + taskMatch[1], cfg.accessToken);
        return json(res, { ok: r.status < 300 }, r.status);
      }

      // ── Folders by IDs (resolve names) ─────────────────────────────────
      if (subpath === '/folders-by-ids' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var ids = url.searchParams.get('ids') || '';
        if (!ids) return json(res, []);
        var r = await wrikeRequest('GET', '/folders/' + ids, cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Contacts (team members) ────────────────────────────────────────
      if (subpath === '/contacts' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/contacts', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Workflows (statuses) ───────────────────────────────────────────
      if (subpath === '/workflows' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/workflows', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Comments ───────────────────────────────────────────────────────
      var commentsMatch = subpath.match(/^\/tasks\/([^/]+)\/comments$/);
      if (commentsMatch && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/tasks/' + commentsMatch[1] + '/comments', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }
      if (commentsMatch && method === 'POST') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var body = await readBody(req);
        var r = await wrikeRequest('POST', '/tasks/' + commentsMatch[1] + '/comments', cfg.accessToken, body);
        return json(res, (r.data.data || [])[0] || r.data, r.status);
      }

      // ── Attachments ──────────────────────────────────────────────────────
      var attachMatch = subpath.match(/^\/tasks\/([^/]+)\/attachments$/);
      if (attachMatch && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/tasks/' + attachMatch[1] + '/attachments', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Custom Fields ────────────────────────────────────────────────────
      if (subpath === '/customfields' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/customfields', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Blueprints ─────────────────────────────────────────────────────
      if (subpath === '/blueprints/tasks' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/task_blueprints', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      if (subpath === '/blueprints/folders' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/folder_blueprints', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Approvals ──────────────────────────────────────────────────────
      var approvalMatch = subpath.match(/^\/tasks\/([^/]+)\/approvals$/);
      if (approvalMatch && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var r = await wrikeRequest('GET', '/tasks/' + approvalMatch[1] + '/approvals', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Recent Comments (global, for "What's New") ─────────────────────
      if (subpath === '/comments/recent' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);
        var limit = url.searchParams.get('limit') || '20';
        var r = await wrikeRequest('GET', '/comments?limit=' + limit + '&sortField=UpdatedDate&sortOrder=Desc', cfg.accessToken);
        return json(res, r.data.data || [], r.status);
      }

      // ── Summary (AI-friendly plain text) ───────────────────────────────
      if (subpath === '/summary' && method === 'GET') {
        var cfg = getCfg();
        if (!cfg.accessToken) return json(res, { error: 'Not configured' }, 401);

        var spaces = (await wrikeRequest('GET', '/spaces', cfg.accessToken)).data.data || [];
        var me = ((await wrikeRequest('GET', '/contacts?me=true', cfg.accessToken)).data.data || [])[0];
        var workflows = (await wrikeRequest('GET', '/workflows', cfg.accessToken)).data.data || [];

        var lines = ['Wrike Workspace Summary', '=======================', ''];
        if (me) lines.push('Logged in as: ' + (me.firstName || '') + ' ' + (me.lastName || '') + ' (' + (me.profiles && me.profiles[0] ? me.profiles[0].email : 'unknown') + ')', '');

        lines.push('Spaces (' + spaces.length + '):');
        for (var s of spaces) {
          lines.push('  - ' + s.title + ' (id: ' + s.id + ')');
        }

        lines.push('', 'Workflows:');
        for (var w of workflows) {
          var statuses = (w.customStatuses || []).map(s => s.name + ' [' + s.group + ']').join(', ');
          lines.push('  - ' + w.name + ': ' + statuses);
        }

        // Fetch tasks overview (all tasks visible to the user)
        var tasks = (await wrikeRequest('GET', '/tasks?pageSize=100&sortField=UpdatedDate&sortOrder=Desc&descendants=true&fields=' + encodeURIComponent('["parentIds","responsibleIds"]'), cfg.accessToken)).data.data || [];
        var byStatus = {};
        tasks.forEach(t => { var s = t.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
        lines.push('', 'Recent Tasks (' + tasks.length + '):');
        for (var st in byStatus) lines.push('  ' + st + ': ' + byStatus[st]);
        lines.push('');
        var recent = tasks.slice(0, 15);
        for (var t of recent) {
          var due = t.dates && t.dates.due ? ' (due: ' + t.dates.due + ')' : '';
          lines.push('  [' + (t.status || '?') + '] ' + t.title + due + ' (id: ' + t.id + ')');
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(lines.join('\n'));
      }

      return false;
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  });
};
