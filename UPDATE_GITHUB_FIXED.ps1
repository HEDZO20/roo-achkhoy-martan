$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Owner = 'HEDZO20'
$RepoName = 'roo-achkhoy-martan'
$RepoFull = "$Owner/$RepoName"
$RepoUrl = "https://github.com/$RepoFull.git"
$SiteUrl = "https://$($Owner.ToLower()).github.io/$RepoName/"
$ApiRoot = 'https://api.github.com'
$ApiVersion = '2022-11-28'
$WorkRoot = Join-Path $env:LOCALAPPDATA 'ROO_GitHub_Update'
$RepoDir = Join-Path $WorkRoot 'repository'

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host '============================================================'
    Write-Host $Text
    Write-Host '============================================================'
}

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Find-Git {
    Refresh-Path
    $cmd = Get-Command git.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "$env:ProgramFiles\Git\cmd\git.exe",
        "$env:ProgramFiles\Git\bin\git.exe",
        "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Install-PortableGit {
    Write-Step 'GIT WAS NOT FOUND - DOWNLOADING PORTABLE GIT'
    $toolsDir = Join-Path $ProjectDir '.tools'
    $portableDir = Join-Path $toolsDir 'PortableGit'
    $portableGit = Join-Path $portableDir 'cmd\git.exe'
    if (Test-Path $portableGit) { return $portableGit }

    New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
    $headers = @{ 'User-Agent' = 'ROO-GitHub-Updater'; 'Accept' = 'application/vnd.github+json' }
    $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers $headers
    $asset = $release.assets | Where-Object { $_.name -match '^PortableGit-.*-64-bit\.7z\.exe$' } | Select-Object -First 1
    if (-not $asset) {
        throw 'Portable Git download was not found. Install Git from https://git-scm.com/download/win and run this file again.'
    }

    $installer = Join-Path $toolsDir $asset.name
    Write-Host "Downloading: $($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $installer -Headers @{ 'User-Agent' = 'ROO-GitHub-Updater' }
    if (Test-Path $portableDir) { Remove-Item $portableDir -Recurse -Force }
    New-Item -ItemType Directory -Path $portableDir -Force | Out-Null
    $process = Start-Process -FilePath $installer -ArgumentList @('-y', "-o$portableDir") -Wait -PassThru
    if ($process.ExitCode -ne 0 -or -not (Test-Path $portableGit)) {
        throw 'Portable Git could not be extracted.'
    }
    Remove-Item $installer -Force -ErrorAction SilentlyContinue
    return $portableGit
}

function Run-Git([string[]]$Arguments, [switch]$AllowFailure, [switch]$Quiet) {
    # Git Credential Manager writes normal status messages to STDERR.
    # Windows PowerShell can incorrectly treat those messages as errors when
    # ErrorActionPreference is Stop. Temporarily continue and trust exit code.
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Quiet) {
            & $script:Git @Arguments *> $null
        } else {
            & $script:Git @Arguments
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "Git command failed with code $code`: git $($Arguments -join ' ')"
    }
    return $code
}

function Prepare-GitAuthentication {
    Write-Step 'PREPARING SECURE GITHUB SIGN-IN'
    # Do not directly run `git credential-manager configure` here. On some
    # Windows PowerShell versions its harmless STDERR message aborts scripts.
    # Git for Windows invokes the installed credential helper automatically.
    Run-Git @('config', '--global', 'credential.interactive', 'true') -Quiet | Out-Null
    Run-Git @('config', '--global', 'credential.gitHubAuthModes', 'browser') -Quiet | Out-Null
    Run-Git @('config', '--global', 'credential.https://github.com.provider', 'github') -Quiet | Out-Null

    $helperLines = @()
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $helperLines = & $script:Git config --show-origin --get-all credential.helper 2>$null
        $helperCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($helperCode -eq 0 -and $helperLines) {
        Write-Host 'Git credential helper detected:'
        $helperLines | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Host 'Git will request authentication during the first push.'
    }
    Write-Host 'No credential-manager configure command is required.'
}

function Copy-ProjectToRepository([string]$Source, [string]$Destination) {
    Get-ChildItem -LiteralPath $Destination -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
    $skip = @('.git', '.tools', 'SITE_URL.txt')
    Get-ChildItem -LiteralPath $Source -Force | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name) -Recurse -Force
    }
}

function Get-GitHubToken([string]$GitPath) {
    $request = "protocol=https`nhost=github.com`npath=$Owner/$RepoName.git`n`n"
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = $request | & $GitPath credential fill 2>$null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($code -ne 0 -or -not $output) { return $null }
    $values = @{}
    foreach ($line in $output) {
        $index = $line.IndexOf('=')
        if ($index -gt 0) {
            $key = $line.Substring(0, $index)
            $value = $line.Substring($index + 1)
            $values[$key] = $value
        }
    }
    if ($values.ContainsKey('password')) { return $values['password'] }
    return $null
}

function Invoke-GitHubApi([string]$Method, [string]$Path, [object]$Body = $null) {
    if (-not $script:Token) { throw 'GitHub token is not available.' }
    $headers = @{
        'Accept' = 'application/vnd.github+json'
        'Authorization' = "Bearer $script:Token"
        'X-GitHub-Api-Version' = $ApiVersion
        'User-Agent' = 'ROO-GitHub-Updater'
    }
    $params = @{
        Uri = "$ApiRoot$Path"
        Method = $Method
        Headers = $headers
    }
    if ($null -ne $Body) {
        $params['ContentType'] = 'application/json'
        $params['Body'] = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }
    return Invoke-RestMethod @params
}

function Enable-GitHubPages {
    Write-Step 'ENABLING GITHUB PAGES'
    $exists = $false
    try {
        $null = Invoke-GitHubApi -Method Get -Path "/repos/$RepoFull/pages"
        $exists = $true
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -ne 404) { throw }
    }

    if ($exists) {
        $null = Invoke-GitHubApi -Method Put -Path "/repos/$RepoFull/pages" -Body @{ build_type = 'workflow' }
        Write-Host 'GitHub Pages settings updated.'
    } else {
        $null = Invoke-GitHubApi -Method Post -Path "/repos/$RepoFull/pages" -Body @{ build_type = 'workflow' }
        Write-Host 'GitHub Pages enabled.'
    }
}

function Wait-ForDeployment {
    Write-Step 'WAITING FOR GITHUB PAGES DEPLOYMENT'
    $workflowPath = '/repos/' + $RepoFull + '/actions/workflows/deploy-pages.yml/runs?branch=main&per_page=5'
    for ($i = 1; $i -le 60; $i++) {
        try {
            $runs = Invoke-GitHubApi -Method Get -Path $workflowPath
            if ($runs.workflow_runs -and $runs.workflow_runs.Count -gt 0) {
                $run = $runs.workflow_runs | Sort-Object created_at -Descending | Select-Object -First 1
                Write-Host ("Deployment status: {0}" -f $run.status)
                if ($run.status -eq 'completed') {
                    if ($run.conclusion -eq 'success') { return $true }
                    Write-Host ("Deployment result: {0}" -f $run.conclusion)
                    return $false
                }
            }
        } catch {
            Write-Host 'Waiting for the workflow to appear...'
        }
        Start-Sleep -Seconds 5
    }
    return $false
}

try {
    Write-Step 'UPDATING THE EXISTING GITHUB REPOSITORY'
    Write-Host "Repository: https://github.com/$RepoFull"
    Write-Host "Expected site: $SiteUrl"
    Write-Host 'No winget or GitHub CLI is required.'

    $script:Git = Find-Git
    if (-not $script:Git) { $script:Git = Install-PortableGit }
    if (-not (Test-Path $script:Git)) { throw 'git.exe was not found.' }
    Write-Host "Git: $script:Git"
    Prepare-GitAuthentication

    if (Test-Path $WorkRoot) { Remove-Item $WorkRoot -Recurse -Force }
    New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null

    Write-Step 'DOWNLOADING THE CURRENT REPOSITORY'
    Run-Git @('clone', $RepoUrl, $RepoDir) | Out-Null
    Set-Location $RepoDir

    $hasMainCode = Run-Git @('show-ref', '--verify', '--quiet', 'refs/remotes/origin/main') -AllowFailure -Quiet
    $hasMain = ($hasMainCode -eq 0)

    if ($hasMain) {
        Write-Step 'CREATING A SAFE BACKUP BRANCH'
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupBranch = "backup-before-v19-$timestamp"
        Run-Git @('branch', '-f', $backupBranch, 'origin/main') | Out-Null
        Write-Host 'GitHub may open a browser now. Confirm the HEDZO20 account once.'
        Run-Git @('push', 'origin', "$backupBranch`:$backupBranch") | Out-Null
        Write-Host "Backup created: $backupBranch"
        Run-Git @('checkout', '-B', 'main', 'origin/main') | Out-Null
    } else {
        $backupBranch = 'not-needed-empty-repository'
        Run-Git @('checkout', '--orphan', 'main') -Quiet | Out-Null
    }

    Write-Step 'COPYING THE NEW WORKING VERSION'
    Copy-ProjectToRepository -Source $ProjectDir -Destination $RepoDir
    Run-Git @('config', 'user.name', $Owner) -Quiet | Out-Null
    Run-Git @('config', 'user.email', "$Owner@users.noreply.github.com") -Quiet | Out-Null
    Run-Git @('add', '-A') -Quiet | Out-Null
    $diffCode = Run-Git @('diff', '--cached', '--quiet') -AllowFailure -Quiet
    if ($diffCode -ne 0) {
        Run-Git @('commit', '-m', 'Update education management system to V19') | Out-Null
    } else {
        Write-Host 'Files are already current. No content commit was needed.'
    }

    Write-Step 'UPLOADING TO GITHUB'
    Write-Host 'If a GitHub sign-in page opens, confirm the HEDZO20 account.'
    Run-Git @('push', '-u', 'origin', 'main') | Out-Null
    Write-Host 'The project files were uploaded successfully.'

    $script:Token = Get-GitHubToken -GitPath $script:Git
    if ($script:Token) {
        Enable-GitHubPages

        Write-Step 'STARTING A FRESH DEPLOYMENT'
        Run-Git @('commit', '--allow-empty', '-m', 'Trigger GitHub Pages deployment') | Out-Null
        Run-Git @('push', 'origin', 'main') | Out-Null

        $deployed = Wait-ForDeployment
        if (-not $deployed) {
            Start-Process "https://github.com/$RepoFull/actions/workflows/deploy-pages.yml"
            throw 'GitHub Pages deployment did not finish successfully. The Actions page was opened.'
        }
    } else {
        Write-Step 'FILES UPLOADED - CHECKING THE PUBLISHED SITE'
        Write-Host 'The temporary credential could not be read for the Pages API.'
        Write-Host 'If Pages is already enabled, the workflow will publish automatically.'
        Start-Process "https://github.com/$RepoFull/actions/workflows/deploy-pages.yml"
        Start-Process "https://github.com/$RepoFull/settings/pages"
    }

    $siteOnline = $false
    for ($attempt = 1; $attempt -le 36; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 15
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                $siteOnline = $true
                break
            }
        } catch { }
        Write-Host "Waiting for the site... attempt $attempt of 36"
        Start-Sleep -Seconds 5
    }

    $SiteUrl | Set-Content -Path (Join-Path $ProjectDir 'SITE_URL.txt') -Encoding UTF8
    try { Set-Clipboard -Value $SiteUrl } catch { $SiteUrl | clip.exe }

    if (-not $siteOnline) {
        Start-Process "https://github.com/$RepoFull/settings/pages"
        Start-Process "https://github.com/$RepoFull/actions/workflows/deploy-pages.yml"
        throw 'Files are on GitHub, but the Pages site is not online yet. The exact Pages and Actions pages were opened.'
    }

    Write-Step 'SUCCESS'
    Write-Host "Site: $SiteUrl"
    Write-Host "Backup branch: $backupBranch"
    Write-Host 'The site address was copied to the clipboard.'
    Start-Process $SiteUrl
    $script:Token = $null
    exit 0
} catch {
    $script:Token = $null
    Write-Host ''
    Write-Host 'ERROR:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Write-Host 'Send a screenshot of this whole window to ChatGPT.'
    exit 1
} finally {
    Set-Location $ProjectDir
}
