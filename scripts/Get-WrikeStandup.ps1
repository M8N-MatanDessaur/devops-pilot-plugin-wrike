param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$tasks = Invoke-RestMethod "$ApiBase/api/plugins/wrike/tasks/mine?limit=50"
$workflows = Invoke-RestMethod "$ApiBase/api/plugins/wrike/workflows"

# Build status name map
$statusMap = @{}
foreach ($wf in $workflows) {
    foreach ($s in $wf.customStatuses) {
        $statusMap[$s.id] = $s
    }
}

if (-not $tasks -or $tasks.Count -eq 0) {
    Write-Host "`n  No tasks found.`n" -ForegroundColor Yellow
    return
}

$today = (Get-Date).ToString("yyyy-MM-dd")
$threeDaysAgo = (Get-Date).AddDays(-3)

$completed = @()
$inProgress = @()
$overdueItems = @()

foreach ($t in $tasks) {
    $s = $statusMap[$t.customStatusId]
    $grp = if ($s) { $s.group } else { "Active" }
    $statusName = if ($s) { $s.name } else { $t.status }
    $due = if ($t.dates -and $t.dates.due) { $t.dates.due.Split("T")[0] } else { "" }
    $updated = if ($t.updatedDate) { [datetime]$t.updatedDate } else { $null }
    $recentlyUpdated = $updated -and ($updated -gt $threeDaysAgo)

    if ($grp -eq "Completed" -and $recentlyUpdated) {
        $completed += @{ title = $t.title; status = $statusName }
    } elseif ($grp -eq "Active") {
        $inProgress += @{ title = $t.title; status = $statusName; due = $due }
        if ($due -and ($due -lt $today)) {
            $overdueItems += @{ title = $t.title; due = $due }
        }
    }
}

Write-Host "`n  === Wrike Standup ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

if ($completed.Count -gt 0) {
    Write-Host "`n  Done (last 3 days):" -ForegroundColor Green
    foreach ($t in $completed) {
        Write-Host "    - $($t.title)"
    }
} else {
    Write-Host "`n  Done: (none recently completed)" -ForegroundColor DarkGray
}

if ($inProgress.Count -gt 0) {
    Write-Host "`n  In Progress:" -ForegroundColor Blue
    foreach ($t in $inProgress) {
        $dueTxt = if ($t.due) { " (due: $($t.due))" } else { "" }
        Write-Host "    - [$($t.status)] $($t.title)$dueTxt"
    }
} else {
    Write-Host "`n  In Progress: (none)" -ForegroundColor DarkGray
}

if ($overdueItems.Count -gt 0) {
    Write-Host "`n  !! Overdue:" -ForegroundColor Red
    foreach ($t in $overdueItems) {
        Write-Host "    - $($t.title) (was due: $($t.due))" -ForegroundColor Red
    }
}

Write-Host ""
