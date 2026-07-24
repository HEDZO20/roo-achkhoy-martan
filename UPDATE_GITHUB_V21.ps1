$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Owner = 'HEDZO20'
$RepoName = 'roo-achkhoy-martan'
$RepoUrl = "https://github.com/$Owner/$RepoName.git"
$SiteUrl = "https://$($Owner.ToLower()).github.io/$RepoName/"
$WorkRoot = Join-Path $env:LOCALAPPDATA 'ROO_GitHub_V21_Update'
$RepoDir = Join-Path $WorkRoot 'repository'

function Step([string]$Text){
  Write-Host ''
  Write-Host '============================================================'
  Write-Host $Text
  Write-Host '============================================================'
}
function Find-Git {
  $cmd=Get-Command git.exe -ErrorAction SilentlyContinue
  if($cmd){return $cmd.Source}
  $candidates=@("$env:ProgramFiles\Git\cmd\git.exe","$env:ProgramFiles\Git\bin\git.exe","${env:ProgramFiles(x86)}\Git\cmd\git.exe","$env:LOCALAPPDATA\Programs\Git\cmd\git.exe")
  foreach($c in $candidates){if($c -and (Test-Path $c)){return $c}}
  return $null
}
function Git([string[]]$Args,[switch]$AllowFailure,[switch]$Quiet){
  $old=$ErrorActionPreference; $ErrorActionPreference='Continue'
  try{if($Quiet){& $script:Git @Args *> $null}else{& $script:Git @Args};$code=$LASTEXITCODE}
  finally{$ErrorActionPreference=$old}
  if($code -ne 0 -and -not $AllowFailure){throw "Git command failed: git $($Args -join ' ')"}
  return $code
}
function Copy-PublicProject([string]$Source,[string]$Destination){
  $preserve=@('.git')
  Get-ChildItem $Destination -Force | Where-Object{$preserve -notcontains $_.Name} | Remove-Item -Recurse -Force
  $skip=@('.git','.tools','SITE_URL.txt','UPDATE_GITHUB_V21.ps1','1_UPDATE_SITE_V21.bat')
  Get-ChildItem $Source -Force | Where-Object{$skip -notcontains $_.Name} | ForEach-Object{
    Copy-Item $_.FullName (Join-Path $Destination $_.Name) -Recurse -Force
  }
}
try{
  Step 'REMOVING THE LEGACY DEMO ROLE LABEL'
  $script:Git=Find-Git
  if(-not $script:Git){throw 'Git is not installed. Use the same computer where the previous upload succeeded.'}
  Write-Host "Git: $script:Git"
  Write-Host "Repository: $RepoUrl"
  if(Test-Path $WorkRoot){Remove-Item $WorkRoot -Recurse -Force}
  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
  Step 'DOWNLOADING CURRENT SITE'
  Git @('clone',$RepoUrl,$RepoDir) | Out-Null
  Set-Location $RepoDir
  Git @('checkout','main') | Out-Null
  Step 'CREATING BACKUP BRANCH'
  $stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
  $backup="backup-before-v21-$stamp"
  Git @('branch','-f',$backup,'origin/main') | Out-Null
  Git @('push','origin',"$backup`:$backup") | Out-Null
  Step 'COPYING FIXED ONLINE VERSION'
  Copy-PublicProject $ProjectDir $RepoDir
  Git @('config','user.name',$Owner) -Quiet | Out-Null
  Git @('config','user.email',"$Owner@users.noreply.github.com") -Quiet | Out-Null
  Git @('add','-A') -Quiet | Out-Null
  $diff=Git @('diff','--cached','--quiet') -AllowFailure -Quiet
  if($diff -ne 0){Git @('commit','-m','Remove legacy demo role controls from online site') | Out-Null}
  else{Write-Host 'No file changes were detected.'}
  Step 'UPLOADING FIX'
  Git @('push','origin','main') | Out-Null
  Write-Host 'Update uploaded successfully.' -ForegroundColor Green
  Write-Host 'GitHub Pages will publish the new commit automatically.'
  for($i=1;$i -le 30;$i++){
    try{
      $r=Invoke-WebRequest -Uri $SiteUrl -UseBasicParsing -TimeoutSec 12
      if($r.StatusCode -ge 200 -and $r.StatusCode -lt 400){break}
    }catch{}
    Start-Sleep -Seconds 4
  }
  Start-Process $SiteUrl
  Step 'SUCCESS'
  Write-Host "Site: $SiteUrl"
  Write-Host "Backup: $backup"
  Write-Host 'Press Ctrl+F5 in the browser if the old label is cached.'
  exit 0
}catch{
  Write-Host ''
  Write-Host 'ERROR:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host 'Send a screenshot of this whole window to ChatGPT.'
  exit 1
}finally{Set-Location $ProjectDir}
