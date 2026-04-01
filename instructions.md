## Wrike Plugin -- AI Instructions

You have access to a Wrike project management plugin via the DevOps Pilot API. This lets you manage Wrike tasks, spaces, and projects.

**All routes are at** `http://127.0.0.1:3800/api/plugins/wrike/`

### Start with the Summary

```bash
# Get a plain-text overview of the workspace (spaces, workflows, recent tasks)
curl -s http://127.0.0.1:3800/api/plugins/wrike/summary
```

### Spaces & Projects

```bash
# List all spaces
curl -s http://127.0.0.1:3800/api/plugins/wrike/spaces

# List projects in a space
curl -s "http://127.0.0.1:3800/api/plugins/wrike/projects?spaceId=SPACE_ID"

# List folders in a space
curl -s "http://127.0.0.1:3800/api/plugins/wrike/folders?spaceId=SPACE_ID"
```

### Tasks

```bash
# List MY tasks (assigned to the current user)
curl -s http://127.0.0.1:3800/api/plugins/wrike/tasks/mine

# List all tasks (most recent first, includes status, importance, dates)
curl -s http://127.0.0.1:3800/api/plugins/wrike/tasks

# List tasks in a specific space
curl -s "http://127.0.0.1:3800/api/plugins/wrike/tasks?spaceId=SPACE_ID"

# List tasks in a specific folder/project
curl -s "http://127.0.0.1:3800/api/plugins/wrike/tasks?folderId=FOLDER_ID"

# Filter by status
curl -s "http://127.0.0.1:3800/api/plugins/wrike/tasks?status=Active"

# Get a specific task (full details with description)
curl -s http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID

# Create a task in a folder
curl -s -X POST http://127.0.0.1:3800/api/plugins/wrike/tasks \
  -H "Content-Type: application/json" \
  -d '{"folderId":"FOLDER_ID","title":"Task title","description":"Details","importance":"High","dates":{"due":"2025-12-31"}}'

# Update a task
curl -s -X PUT http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated title","status":"Completed"}'

# Delete a task
curl -s -X DELETE http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID
```

### Task Fields

- **status**: Active, Completed, Deferred, Cancelled
- **importance**: High, Normal, Low
- **dates**: `{ "start": "YYYY-MM-DD", "due": "YYYY-MM-DD" }`
- **description**: HTML string
- **title**: Plain text

### Comments

```bash
# List comments on a task
curl -s http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID/comments

# Add a comment
curl -s -X POST http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID/comments \
  -H "Content-Type: application/json" \
  -d '{"text":"Comment text here"}'
```

### Custom Fields

```bash
# List all custom field definitions (types, options for dropdowns)
curl -s http://127.0.0.1:3800/api/plugins/wrike/customfields

# Update custom fields on a task
curl -s -X PUT http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID \
  -H "Content-Type: application/json" \
  -d '{"customFields": [{"id":"FIELD_ID","value":"new_value"}]}'
```

### Approvals

```bash
# Get approvals for a specific task
curl -s http://127.0.0.1:3800/api/plugins/wrike/tasks/TASK_ID/approvals
```

Approval statuses: Pending, Approved, Rejected. Each has decisions from approvers.

### Blueprints (Templates)

```bash
# List task blueprints
curl -s http://127.0.0.1:3800/api/plugins/wrike/blueprints/tasks

# List folder/project blueprints
curl -s http://127.0.0.1:3800/api/plugins/wrike/blueprints/folders
```

### Contacts & Workflows

```bash
# List team members
curl -s http://127.0.0.1:3800/api/plugins/wrike/contacts

# List workflows and their statuses
curl -s http://127.0.0.1:3800/api/plugins/wrike/workflows

# Recent comments across all tasks (for notifications)
curl -s http://127.0.0.1:3800/api/plugins/wrike/comments/recent
```

### Opening in the Dashboard

After creating, updating, or working with Wrike tasks, **always offer to open the Wrike tab in the dashboard**:

```bash
# Open the Wrike tab
curl -s -X POST http://127.0.0.1:3800/api/ui/view-plugin \
  -H "Content-Type: application/json" \
  -d '{"plugin":"wrike"}'
```

After any create/update/delete operation, ask the user: "Want me to open the Wrike dashboard?"

### ADO-Wrike Sync

To sync a Wrike task to Azure DevOps:
1. Fetch the Wrike task details
2. Create an ADO work item with the same title and description
3. Include the Wrike permalink in the ADO description for cross-reference
4. Always ask the user for confirmation before creating

```bash
# Example: create ADO work item from Wrike task
curl -s -X POST http://127.0.0.1:3800/api/workitems/create \
  -H "Content-Type: application/json" \
  -d '{"type":"Task","title":"[Wrike] Task Title","description":"Synced from Wrike: https://www.wrike.com/open.htm?id=...","priority":2}'
```
