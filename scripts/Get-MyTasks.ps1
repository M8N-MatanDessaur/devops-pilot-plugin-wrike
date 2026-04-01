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
    Write-Host "`n  No tasks assigned to you.`n" -ForegroundColor Yellow
    return
}

$today = (Get-Date).ToString("yyyy-MM-dd")

# Group by status group
$groups = @{}
foreach ($t in $tasks) {
    $s = $statusMap[$t.customStatusId]
    $grp = if ($s) { $s.group } else { "Other" }
    if (-not $groups[$grp]) { $groups[$grp] = @() }
    $groups[$grp] += $t
}

Write-Host "`n  === My Wrike Tasks ===" -ForegroundColor Cyan
Write-Host "  $(Get-Date -Format 'dddd, MMMM dd yyyy')" -ForegroundColor DarkGray

$overdue = 0
$order = @("Active", "Completed", "Deferred", "Cancelled")
foreach ($grp in $order) {
    $items = $groups[$grp]
    if (-not $items -or $items.Count -eq 0) { continue }

    $color = switch ($grp) {
        "Active" { "Blue" }
        "Completed" { "Green" }
        "Deferred" { "DarkGray" }
        "Cancelled" { "Red" }
        default { "White" }
    }

    Write-Host "`n  $grp ($($items.Count))" -ForegroundColor $color
    Write-Host "  $('-' * 40)" -ForegroundColor DarkGray

    foreach ($t in $items) {
        $s = $statusMap[$t.customStatusId]
        $statusName = if ($s) { $s.name } else { $t.status }
        $due = if ($t.dates -and $t.dates.due) { $t.dates.due.Split("T")[0] } else { "" }
        $isOverdue = $due -and ($due -lt $today) -and ($grp -eq "Active")
        if ($isOverdue) { $overdue++ }

        $dueTxt = ""
        if ($isOverdue) {
            $dueTxt = " [OVERDUE: $due]"
        } elseif ($due) {
            $dueTxt = " (due: $due)"
        }

        $lineColor = if ($isOverdue) { "Red" } else { "White" }
        Write-Host "    $statusName | $($t.title)$dueTxt" -ForegroundColor $lineColor
    }
}

if ($overdue -gt 0) {
    Write-Host "`n  !! $overdue overdue task(s)" -ForegroundColor Red
}

Write-Host "`n  Total: $($tasks.Count) tasks`n" -ForegroundColor DarkGray
