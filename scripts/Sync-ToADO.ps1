param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

# Get my Wrike tasks
$tasks = Invoke-RestMethod "$ApiBase/api/plugins/wrike/tasks/mine?limit=20"
$workflows = Invoke-RestMethod "$ApiBase/api/plugins/wrike/workflows"

$statusMap = @{}
foreach ($wf in $workflows) {
    foreach ($s in $wf.customStatuses) {
        $statusMap[$s.id] = $s
    }
}

if (-not $tasks -or $tasks.Count -eq 0) {
    Write-Host "`n  No Wrike tasks to sync.`n" -ForegroundColor Yellow
    return
}

Write-Host "`n  === Wrike Tasks Available for ADO Sync ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

$idx = 1
foreach ($t in $tasks) {
    $s = $statusMap[$t.customStatusId]
    $grp = if ($s) { $s.group } else { "Active" }
    if ($grp -ne "Active") { continue }

    $statusName = if ($s) { $s.name } else { $t.status }
    $due = if ($t.dates -and $t.dates.due) { $t.dates.due.Split("T")[0] } else { "" }
    $dueTxt = if ($due) { " (due: $due)" } else { "" }

    Write-Host "`n  [$idx] $($t.title)" -ForegroundColor White
    Write-Host "      Status: $statusName | ID: $($t.id)$dueTxt" -ForegroundColor DarkGray
    if ($t.permalink) {
        Write-Host "      Wrike: $($t.permalink)" -ForegroundColor DarkGray
    }
    $idx++
}

Write-Host "`n  Active tasks shown above. Ask the AI which task to sync to Azure DevOps.`n" -ForegroundColor Yellow
