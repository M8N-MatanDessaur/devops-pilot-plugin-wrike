param(
    [string]$ApiBase = "http://127.0.0.1:3800"
)

$taskBp = Invoke-RestMethod "$ApiBase/api/plugins/wrike/blueprints/tasks"
$folderBp = Invoke-RestMethod "$ApiBase/api/plugins/wrike/blueprints/folders"

Write-Host "`n  === Wrike Blueprints ===" -ForegroundColor Cyan

if ($taskBp -and $taskBp.Count -gt 0) {
    Write-Host "`n  Task Blueprints ($($taskBp.Count)):" -ForegroundColor Yellow
    foreach ($bp in $taskBp) {
        if ($bp.title) {
            Write-Host "    - $($bp.title) (id: $($bp.id))"
        }
    }
} else {
    Write-Host "`n  No task blueprints found." -ForegroundColor DarkGray
}

if ($folderBp -and $folderBp.Count -gt 0) {
    Write-Host "`n  Project Blueprints ($($folderBp.Count)):" -ForegroundColor Yellow
    foreach ($bp in $folderBp) {
        if ($bp.title -and $bp.scope -eq "FolderBp") {
            Write-Host "    - $($bp.title) (id: $($bp.id))"
        }
    }
} else {
    Write-Host "`n  No project blueprints found." -ForegroundColor DarkGray
}

Write-Host ""
